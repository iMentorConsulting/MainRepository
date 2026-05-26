"""
Connector: pulls data from the iMentor Finance app (finance.i-mentor.gr)
and syncs it into the case management database.

Replaces the Google Sheet import/sync jobs.
Runs on the same 08:00 + 14:00 schedule via APScheduler in main.py.
"""
import os
import unicodedata
from datetime import datetime, date

import requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth_cases import get_current_user, CMUser
from database import get_db
from models_cases import CMCase, CMPaymentLog
from pipelines import PIPELINES, get_all_statuses_for_program

router = APIRouter(prefix="/api/cm/finance-sync", tags=["cm-finance-sync"])

# State visible to the scheduler and the status endpoint
_last_sync: dict = {
    "last_run_at": None,
    "imported": None,
    "updated_paid": None,
    "error": None,
}

FINANCE_APP_URL = os.getenv("FINANCE_APP_URL", "https://finance.i-mentor.gr")
CM_SYNC_SECRET  = os.getenv("CM_SYNC_SECRET", "")


# ── helpers ──────────────────────────────────────────────────────────────────

def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    ).upper()


def _parse_date(val) -> date | None:
    if not val:
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_float(val) -> float:
    try:
        return float(val or 0) or 0.0
    except (TypeError, ValueError):
        return 0.0


def _detect_program(service_type: str) -> str:
    st = (service_type or "").upper()
    if "ΜΙΚΡΟ" in st:
        return "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"
    if "ΔΥΠΑ" in st or "ΟΑΕΔ" in st or "DYPA" in st:
        return "ΔΥΠΑ"
    if "ΑΝΑΚΑΙΝ" in st:
        return "ΑΝΑΚΑΙΝΙΖΩ"
    return "ΕΣΠΑ"


def _match_agent_id(folder_agent: str, users: list) -> int | None:
    if not folder_agent or not folder_agent.strip():
        return None
    needle = _strip_accents(folder_agent.strip())
    for user in users:
        haystack = _strip_accents(user.full_name or "")
        if needle in haystack or any(needle == w for w in haystack.split()):
            return user.id
    return None


def _finance_ref(vat_number: str, customer_name: str, service_type: str) -> str:
    """Dedup key matching the old sheet_import_ref format."""
    identifier = (vat_number or "").strip() if (vat_number or "").strip() else (customer_name or "").upper().strip()
    return f"{identifier}|{service_type or ''}"


def _fetch_finance_records() -> list[dict]:
    """Call the finance app cm-sync endpoint. Raises on failure."""
    if not CM_SYNC_SECRET:
        raise RuntimeError("CM_SYNC_SECRET env var not set on case management app")
    url = f"{FINANCE_APP_URL}/api/cm-sync"
    resp = requests.get(url, headers={"X-CM-Sync-Secret": CM_SYNC_SECRET}, timeout=30)
    resp.raise_for_status()
    return resp.json().get("data", [])


# ── core sync logic ───────────────────────────────────────────────────────────

def _do_sync_from_finance(db: Session) -> dict:
    """
    Import new cases and sync total_paid from the finance app.
    Mirrors the combined behaviour of the old _do_import + _do_sync_paid.
    """
    records = _fetch_finance_records()

    from models_cases import CMUser as CMUserModel
    users = db.query(CMUserModel).filter(CMUserModel.is_active == True).all()

    existing_cases = db.query(CMCase).all()
    existing_by_ref   = {c.sheet_import_ref: c for c in existing_cases if c.sheet_import_ref}
    existing_by_afm   = {}   # (afm, service_type) -> case
    existing_by_name  = {}   # (name_upper, service_type) -> case
    for c in existing_cases:
        if c.afm:
            existing_by_afm[(c.afm, c.service_type or "")] = c
        if c.client_name:
            existing_by_name[(_strip_accents(c.client_name), c.service_type or "")] = c

    imported = 0
    updated_paid = 0

    for r in records:
        customer_name = (r.get("customer_name") or "").strip()
        if not customer_name:
            continue

        vat_number   = (r.get("vat_number")   or "").strip()
        service_type = (r.get("service_type") or "").strip()
        total_paid   = _parse_float(r.get("total_paid"))
        ref          = _finance_ref(vat_number, customer_name, service_type)

        # -- find existing case (3-way lookup) --
        existing = existing_by_ref.get(ref)
        if existing is None and vat_number:
            existing = existing_by_afm.get((vat_number, service_type))
        if existing is None:
            existing = existing_by_name.get((_strip_accents(customer_name), service_type))

        if existing:
            # Sync total_paid only (do not overwrite status / other CM-managed fields)
            if abs((existing.total_paid or 0) - total_paid) > 0.01:
                prev = existing.total_paid or 0.0
                delta = total_paid - prev
                existing.total_paid = total_paid
                existing.updated_at = datetime.utcnow()
                db.add(CMPaymentLog(
                    case_id=existing.id,
                    previous_total=prev,
                    new_total=total_paid,
                    delta=delta,
                    source="finance_sync",
                    log_date=datetime.utcnow(),
                ))
                updated_paid += 1
            # Keep ref stamped if it was missing (handles cases created manually)
            if not existing.sheet_import_ref:
                existing.sheet_import_ref = ref
        else:
            # New case — import it
            program = _detect_program(service_type)
            first_status = PIPELINES[program]["phases"][0]["statuses"][0]
            case = CMCase(
                client_name=customer_name,
                afm=vat_number or None,
                email=(r.get("email") or "").strip() or None,
                phone=(r.get("phone") or "").strip() or None,
                accountant=(r.get("accountant") or "").strip() or None,
                service_type=service_type or None,
                program_category=program,
                status=first_status,
                status_changed_at=datetime.utcnow(),
                sale_date=_parse_date(r.get("sale_date")),
                approval_date=_parse_date(r.get("approval_date")),
                project_deadline=_parse_date(r.get("completion_deadline")),
                approved_budget=_parse_float(r.get("investment_height")) or None,
                agreed_fee_application=_parse_float(r.get("amount_application")) or None,
                agreed_fee_implementation=_parse_float(r.get("amount_implementation")) or None,
                total_paid=total_paid,
                sheet_import_ref=ref,
                assigned_agent_id=_match_agent_id(r.get("folder_agent") or "", users),
            )
            db.add(case)
            db.flush()
            if total_paid > 0.01:
                db.add(CMPaymentLog(
                    case_id=case.id,
                    previous_total=0.0,
                    new_total=total_paid,
                    delta=total_paid,
                    source="finance_import",
                    log_date=datetime.utcnow(),
                ))
            imported += 1
            # Add to local maps so duplicate rows in the same batch don't re-import
            existing_by_ref[ref] = case
            if vat_number:
                existing_by_afm[(vat_number, service_type)] = case
            existing_by_name[(_strip_accents(customer_name), service_type)] = case

    db.commit()
    return {"imported": imported, "updated_paid": updated_paid, "total_records": len(records)}


# ── API endpoints ─────────────────────────────────────────────────────────────

@router.get("/status")
def finance_sync_status(current_user: CMUser = Depends(get_current_user)):
    """Return the result of the last finance-app sync run."""
    return _last_sync


@router.post("/run")
def run_finance_sync(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a sync from the finance app."""
    try:
        result = _do_sync_from_finance(db)
        _last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": result["imported"],
            "updated_paid": result["updated_paid"],
            "total_records": result["total_records"],
            "error": None,
        })
        return {**result, "message": (
            f"Εισήχθησαν {result['imported']} νέες υποθέσεις. "
            f"Ενημερώθηκε total_paid σε {result['updated_paid']} υποθέσεις. "
            f"Σύνολο εγγραφών finance app: {result['total_records']}."
        )}
    except Exception as exc:
        _last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": None,
            "updated_paid": None,
            "error": str(exc),
        })
        raise HTTPException(status_code=500, detail=str(exc))
