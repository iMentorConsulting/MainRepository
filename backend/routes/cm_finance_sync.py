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

# Persists across requests in the same process; lost on restart (acceptable)
_last_sync: dict = {
    "last_run_at": None,
    "imported": None,
    "updated_paid": None,
    "total_records": None,
    "error": None,
    # Undo data — populated after a successful sync
    "created_case_ids": [],   # IDs of CMCase rows created in the last sync
    "updated_log_ids": [],    # IDs of CMPaymentLog rows written in the last sync
    "can_undo": False,
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
    if not resp.ok:
        raise RuntimeError(f"Finance app returned HTTP {resp.status_code}: {resp.text[:300]}")
    content_type = resp.headers.get("content-type", "")
    if "application/json" not in content_type:
        raise RuntimeError(
            f"Finance app returned non-JSON response (Content-Type: {content_type}). "
            f"Body: {resp.text[:300]}"
        )
    return resp.json().get("data", [])


def _build_lookup_maps(db: Session):
    """Return (existing_by_ref, existing_by_afm, existing_by_name) from all cases."""
    existing_cases = db.query(CMCase).all()
    by_ref  = {c.sheet_import_ref: c for c in existing_cases if c.sheet_import_ref}
    by_afm  = {}
    by_name = {}
    for c in existing_cases:
        if c.afm:
            by_afm[(c.afm, c.service_type or "")] = c
        if c.client_name:
            by_name[(_strip_accents(c.client_name), c.service_type or "")] = c
    return by_ref, by_afm, by_name


def _find_existing(r, by_ref, by_afm, by_name):
    vat   = (r.get("vat_number") or "").strip()
    name  = (r.get("customer_name") or "").strip()
    svc   = (r.get("service_type") or "").strip()
    ref   = _finance_ref(vat, name, svc)
    existing = by_ref.get(ref)
    if existing is None and vat:
        existing = by_afm.get((vat, svc))
    if existing is None:
        existing = by_name.get((_strip_accents(name), svc))
    return existing, ref


# ── preview (dry run — no DB writes) ─────────────────────────────────────────

def _do_preview(db: Session) -> dict:
    records = _fetch_finance_records()
    by_ref, by_afm, by_name = _build_lookup_maps(db)

    new_cases     = []
    paid_updates  = []
    no_change     = 0

    for r in records:
        customer_name = (r.get("customer_name") or "").strip()
        if not customer_name:
            continue
        total_paid = _parse_float(r.get("total_paid"))
        existing, _ = _find_existing(r, by_ref, by_afm, by_name)

        if existing:
            if abs((existing.total_paid or 0) - total_paid) > 0.01:
                paid_updates.append({
                    "case_id": existing.id,
                    "client_name": existing.client_name,
                    "afm": existing.afm,
                    "service_type": existing.service_type,
                    "current_paid": existing.total_paid or 0,
                    "new_paid": total_paid,
                    "delta": round(total_paid - (existing.total_paid or 0), 2),
                })
            else:
                no_change += 1
        else:
            new_cases.append({
                "customer_name": customer_name,
                "vat_number": (r.get("vat_number") or "").strip() or None,
                "service_type": (r.get("service_type") or "").strip() or None,
                "total_paid": total_paid,
                "sale_date": r.get("sale_date"),
                "email": (r.get("email") or "").strip() or None,
                "phone": (r.get("phone") or "").strip() or None,
                "amount_application": _parse_float(r.get("amount_application")) or None,
                "amount_implementation": _parse_float(r.get("amount_implementation")) or None,
            })

    return {
        "total_records": len(records),
        "new_cases_count": len(new_cases),
        "paid_updates_count": len(paid_updates),
        "no_change_count": no_change,
        "new_cases": new_cases[:50],
        "paid_updates": paid_updates[:50],
    }


# ── core sync logic ───────────────────────────────────────────────────────────

def _do_sync_from_finance(db: Session) -> dict:
    """
    Import new cases and sync total_paid from the finance app.
    Tracks created case IDs and payment log IDs for undo support.
    """
    records = _fetch_finance_records()

    from models_cases import CMUser as CMUserModel
    users = db.query(CMUserModel).filter(CMUserModel.is_active == True).all()

    by_ref, by_afm, by_name = _build_lookup_maps(db)

    imported       = 0
    updated_paid   = 0
    created_ids    = []
    updated_log_ids = []

    for r in records:
        customer_name = (r.get("customer_name") or "").strip()
        if not customer_name:
            continue

        vat_number   = (r.get("vat_number")   or "").strip()
        service_type = (r.get("service_type") or "").strip()
        total_paid   = _parse_float(r.get("total_paid"))
        existing, ref = _find_existing(r, by_ref, by_afm, by_name)

        if existing:
            if not existing.sheet_import_ref:
                existing.sheet_import_ref = ref

            if abs((existing.total_paid or 0) - total_paid) > 0.01:
                prev  = existing.total_paid or 0.0
                delta = total_paid - prev
                existing.total_paid  = total_paid
                existing.updated_at  = datetime.utcnow()
                log = CMPaymentLog(
                    case_id=existing.id,
                    previous_total=prev,
                    new_total=total_paid,
                    delta=delta,
                    source="finance_sync",
                    log_date=datetime.utcnow(),
                )
                db.add(log)
                db.flush()
                updated_log_ids.append(log.id)
                updated_paid += 1
        else:
            program      = _detect_program(service_type)
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
            created_ids.append(case.id)

            if total_paid > 0.01:
                log = CMPaymentLog(
                    case_id=case.id,
                    previous_total=0.0,
                    new_total=total_paid,
                    delta=total_paid,
                    source="finance_import",
                    log_date=datetime.utcnow(),
                )
                db.add(log)
                db.flush()
                updated_log_ids.append(log.id)

            by_ref[ref] = case
            if vat_number:
                by_afm[(vat_number, service_type)] = case
            by_name[(_strip_accents(customer_name), service_type)] = case
            imported += 1

    db.commit()
    return {
        "imported": imported,
        "updated_paid": updated_paid,
        "total_records": len(records),
        "created_case_ids": created_ids,
        "updated_log_ids": updated_log_ids,
    }


# ── undo last sync ────────────────────────────────────────────────────────────

def _do_undo(db: Session) -> dict:
    """
    Reverse the last sync run:
    - Delete cases that were created (created_case_ids)
    - Revert total_paid to previous_total for updated cases (updated_log_ids)
    """
    created_ids    = _last_sync.get("created_case_ids", [])
    updated_log_ids = _last_sync.get("updated_log_ids", [])

    if not created_ids and not updated_log_ids:
        raise RuntimeError("Δεν υπάρχουν δεδομένα για αναίρεση. Είτε δεν έχει εκτελεστεί sync, είτε η εφαρμογή επανεκκινήθηκε από τότε.")

    deleted_cases  = 0
    reverted_paid  = 0

    # Revert total_paid for existing cases that were updated
    for log_id in updated_log_ids:
        log = db.query(CMPaymentLog).filter(CMPaymentLog.id == log_id).first()
        if not log:
            continue
        if log.source == "finance_sync":
            case = db.query(CMCase).filter(CMCase.id == log.case_id).first()
            if case:
                case.total_paid = log.previous_total
                case.updated_at = datetime.utcnow()
                reverted_paid += 1
        db.delete(log)

    # Delete newly created cases (with all their child records via cascade)
    for case_id in created_ids:
        case = db.query(CMCase).filter(CMCase.id == case_id).first()
        if case:
            db.delete(case)
            deleted_cases += 1

    db.commit()

    # Clear undo data so it can't be applied twice
    _last_sync["created_case_ids"] = []
    _last_sync["updated_log_ids"]  = []
    _last_sync["can_undo"]         = False

    return {"deleted_cases": deleted_cases, "reverted_paid": reverted_paid}


# ── API endpoints ─────────────────────────────────────────────────────────────

@router.get("/status")
def finance_sync_status(current_user: CMUser = Depends(get_current_user)):
    return _last_sync


@router.get("/preview")
def preview_finance_sync(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dry run — shows what would change without touching the DB."""
    try:
        return _do_preview(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/run")
def run_finance_sync(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run the sync. Saves undo data so the next call to /undo can reverse it."""
    try:
        result = _do_sync_from_finance(db)
        _last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": result["imported"],
            "updated_paid": result["updated_paid"],
            "total_records": result["total_records"],
            "error": None,
            "created_case_ids": result["created_case_ids"],
            "updated_log_ids": result["updated_log_ids"],
            "can_undo": bool(result["created_case_ids"] or result["updated_log_ids"]),
        })
        return {
            "imported": result["imported"],
            "updated_paid": result["updated_paid"],
            "total_records": result["total_records"],
            "can_undo": _last_sync["can_undo"],
            "message": (
                f"Εισήχθησαν {result['imported']} νέες υποθέσεις. "
                f"Ενημερώθηκε total_paid σε {result['updated_paid']} υποθέσεις."
            ),
        }
    except Exception as exc:
        _last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": None,
            "updated_paid": None,
            "error": str(exc),
            "can_undo": False,
        })
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/undo")
def undo_finance_sync(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reverse the last sync: delete imported cases, revert total_paid changes."""
    try:
        result = _do_undo(db)
        return {
            **result,
            "message": (
                f"Αναίρεση ολοκληρώθηκε: διαγράφηκαν {result['deleted_cases']} υποθέσεις, "
                f"επαναφέρθηκε το total_paid σε {result['reverted_paid']} υποθέσεις."
            ),
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
