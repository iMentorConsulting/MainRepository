import os
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date as date
from database import get_db
from models_cases import CMCase
from pipelines import OLD_STATUS_MAP, get_all_statuses_for_program
from auth_cases import get_current_user, require_admin, CMUser

router = APIRouter(prefix="/api/cm/sheets", tags=["cm-sheets"])

# Tracks the last scheduled auto-refresh result — updated by the scheduler
_last_auto_refresh: dict = {
    "last_run_at": None,
    "imported": None,
    "updated_paid": None,
    "error": None,
    "next_runs": [],
}


def _detect_program(status: str, service_type: str) -> str:
    """Detect the program category from service_type keywords or status membership."""
    st = (service_type or '').upper()
    if 'ΜΙΚΡΟ' in st:
        return 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'
    if 'ΔΥΠΑ' in st or 'ΟΑΕΔ' in st or 'DYPA' in st:
        return 'ΔΥΠΑ'
    if status:
        for prog in ('ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ'):
            if status in get_all_statuses_for_program(prog):
                return prog
    return 'ΕΣΠΑ'

SPREADSHEET_ID = os.getenv("GOOGLE_SHEET_ID", "138at2ByB0TEzZpdwdGhtfLC2FShbA5l1IeLtTo5r4x4")
SHEET_TAB = os.getenv("GOOGLE_SHEET_TAB", "ΕΣΟΔΑ")

# Column mapping (0-indexed)
# A  B  C     D    E       F                G   H          I    J           K         L                      M                              N                              O                       P                Q               R                    S                    T      U                    V      W    X                  Y                        Z
# 0  1  2     3    4       5                6   7          8    9           10        11                     12                             13                             14                      15               16              17                   18                   19     20                   21     22   23                 24                       25
# ΕΠΩΝΥΜΙΑ  ΚΑΤΑΣΤΑΣΗ  EMAIL  SMS  ΚΙΝΗΤΟ  ΠΟΛΗ  ΤΚ  ΔΙΕΥΘΥΝΣΗ  ΑΦΜ  ΑΝΤΙΚΕΙΜΕΝΟ  ΛΟΓΙΣΤΗΣ  ΠΟΣΟ_ΑΙΤΗΣΗ  ΠΟΣΟ_ΥΛΟΠΟΙΗΣΗ  ΕΓΚΡΙΣΗ  ΠΡΟΘΕΣΜΙΑ  ΕΠΕΝΔΥΣΗ  ΟΦΕΙΛΕΣ  ΠΡΟΕΛΕΥΣΗ  ΠΩΛΗΤΗΣ  BONUS  ΥΠΕΥΘΥΝΟΣ  ΠΟΣΟ  ΦΠΑ  ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ  ΚΑΤΗΓΟΡΙΑ  ΠΩΛΗΣΗ
COL_MAP = {
    "client_name": 0,                # ΕΠΩΝΥΜΙΑ ΠΕΛΑΤΗ ΧΟΝΔΡΙΚΗΣ
    "status": 1,                     # ΚΑΤΑΣΤΑΣΗ ΕΡΓΑΣΙΑΣ
    "email": 2,                      # EMAIL
    "phone": 4,                      # ΚΙΝΗΤΟ
    "afm": 8,                        # ΑΦΜ
    "accountant": 10,                # ΛΟΓΙΣΤΗΣ
    "agreed_fee_application": 11,    # ΠΟΣΟ ΓΙΑ ΑΙΤΗΣΗ
    "agreed_fee_implementation": 12, # ΣΥΜΦΩΝΗΘΕΝ ΠΟΣΟ ΓΙΑ ΥΛΟΠΟΙΗΣΗ
    "approval_date": 13,             # Ημερομηνία Έγκρισης / Απόρριψης
    "project_deadline": 14,          # Προθεσμία Ολοκλήρωσης
    "approved_budget": 15,           # ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ
    "service_type": 23,              # ΕΙΔΟΣ ΥΠΗΡΕΣΙΑΣ
    "total_paid": 21,                # ΠΟΣΟ
    "sale_date": 25,                 # ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ
    "responsible": 20,               # Υπεύθυνος Φακέλου
}


def _get_sheets_service():
    """Build Google Sheets service using service account credentials."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        if not creds_json:
            raise HTTPException(status_code=500, detail="GOOGLE_SERVICE_ACCOUNT_JSON env var δεν βρέθηκε")

        creds_info = json.loads(creds_json)
        creds = Credentials.from_service_account_info(
            creds_info,
            scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
        )
        return build("sheets", "v4", credentials=creds, cache_discovery=False)
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Δεν βρέθηκαν τα Google API packages. Εγκαταστήστε: google-auth google-api-python-client",
        )


def _parse_date(val: str):
    if not val or str(val).strip() == "":
        return None
    val = str(val).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _parse_float(val) -> float:
    if val is None or str(val).strip() == "":
        return 0.0
    s = str(val).strip().replace(" ", "").replace("€", "").replace("+", "")
    # European format: dot=thousands separator, comma=decimal separator
    # e.g. "1.800" → 1800, "4.750" → 4750, "1.800,50" → 1800.5
    import re
    if re.match(r'^\d{1,3}(\.\d{3})+(,\d+)?$', s):
        s = s.replace(".", "").replace(",", ".")
    elif "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) == 3:
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _read_sheet_rows() -> list[list]:
    """Read all rows from the ΕΣΟΔΑ tab."""
    service = _get_sheets_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_TAB}!A:Z")
        .execute()
    )
    return result.get("values", [])


def _merge_key(afm: str, client_name: str, service_type: str) -> str:
    """Dedup key: prefer AFM, fall back to client_name when AFM is missing."""
    identifier = afm if afm else client_name.upper().strip()
    return f"{identifier}|{service_type}"


import unicodedata

def _strip_accents(s: str) -> str:
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    ).upper()

def _match_agent_id(responsible: str, users: list) -> int | None:
    if not responsible or not responsible.strip():
        return None
    needle = _strip_accents(responsible.strip())
    for user in users:
        haystack = _strip_accents(user.full_name or '')
        if needle in haystack or any(needle == w for w in haystack.split()):
            return user.id
    return None


def _rows_to_records(rows: list[list]) -> list[dict]:
    """Convert raw sheet rows to normalized dicts, skip header. Merge duplicate rows."""
    # Accept both old-format statuses (via OLD_STATUS_MAP) and any current pipeline status
    from pipelines import get_all_statuses_for_program
    valid_import_statuses = set(OLD_STATUS_MAP.keys()) | set(get_all_statuses_for_program('ΕΣΠΑ')) | set(get_all_statuses_for_program('ΔΥΠΑ')) | set(get_all_statuses_for_program('ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'))
    merged: dict[str, dict] = {}
    if not rows:
        return []
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")

        status = str(row[COL_MAP["status"]]).strip()
        if status not in valid_import_statuses:
            continue
        status = OLD_STATUS_MAP.get(status, status)  # map old→new; new statuses pass through

        afm = str(row[COL_MAP["afm"]]).strip()
        service_type = str(row[COL_MAP["service_type"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        if not client_name:
            continue

        key = _merge_key(afm, client_name, service_type)
        fee_app = _parse_float(row[COL_MAP["agreed_fee_application"]])
        fee_impl = _parse_float(row[COL_MAP["agreed_fee_implementation"]])
        rec = {
            "client_name": client_name,
            "status": status,
            "email": str(row[COL_MAP["email"]]).strip() or None,
            "phone": str(row[COL_MAP["phone"]]).strip() or None,
            "afm": afm or None,
            "accountant": str(row[COL_MAP["accountant"]]).strip() or None,
            "agreed_fee_application": fee_app,
            "agreed_fee_implementation": fee_impl,
            "_fee_app_set": {fee_app} if fee_app > 0 else set(),
            "_fee_impl_set": {fee_impl} if fee_impl > 0 else set(),
            "approval_date": _parse_date(row[COL_MAP["approval_date"]]),
            "project_deadline": _parse_date(row[COL_MAP["project_deadline"]]),
            "approved_budget": _parse_float(row[COL_MAP["approved_budget"]]),
            "service_type": service_type or None,
            "total_paid": _parse_float(row[COL_MAP["total_paid"]]),
            "sale_date": _parse_date(row[COL_MAP["sale_date"]]),
            "responsible": str(row[COL_MAP["responsible"]]).strip(),
        }
        if key in merged:
            existing = merged[key]
            existing["total_paid"] += rec["total_paid"]
            # Sum unique non-zero fee values: handles both repeated-fee rows AND
            # rows with genuinely different fee amounts for the same contract
            if fee_app > 0:
                existing["_fee_app_set"].add(fee_app)
            if fee_impl > 0:
                existing["_fee_impl_set"].add(fee_impl)
            for field in ("email", "phone", "afm", "accountant", "approval_date",
                          "project_deadline", "approved_budget", "sale_date"):
                if not existing.get(field) and rec.get(field):
                    existing[field] = rec[field]
        else:
            merged[key] = rec

    # Compute final fee totals from accumulated unique-value sets
    result = []
    for rec in merged.values():
        rec["agreed_fee_application"] = sum(rec.pop("_fee_app_set", set()))
        rec["agreed_fee_implementation"] = sum(rec.pop("_fee_impl_set", set()))
        result.append(rec)
    return result


def _build_paid_map(records: list[dict]) -> dict:
    """Sum ΠΟΣΟ per (afm, service_type) key for sync."""
    paid_map = {}
    for r in records:
        key = (r["afm"] or "", r["service_type"] or "")
        paid_map[key] = paid_map.get(key, 0.0) + (r["total_paid"] or 0.0)
    return paid_map


def _do_import(db: Session) -> dict:
    """Import new cases from sheet without requiring auth. Used by scheduler and route."""
    rows = _read_sheet_rows()
    records = _rows_to_records(rows)

    from models_cases import CMUser as CMUserModel
    users = db.query(CMUserModel).filter(CMUserModel.is_active == True).all()

    existing_cases = db.query(CMCase).all()
    existing_refs = {c.sheet_import_ref for c in existing_cases if c.sheet_import_ref}
    existing_by_name_svc = {
        (_strip_accents(c.client_name or ''), _strip_accents(c.service_type or '')): True
        for c in existing_cases
    }
    paid_map = _build_paid_map(records)

    imported = 0
    skipped = 0

    for r in records:
        ref = _merge_key(r['afm'] or '', r['client_name'], r['service_type'] or '')
        if ref in existing_refs:
            skipped += 1
            continue
        name_svc_key = (_strip_accents(r['client_name']), _strip_accents(r['service_type'] or ''))
        if name_svc_key in existing_by_name_svc:
            skipped += 1
            continue

        paid = paid_map.get((r["afm"] or "", r["service_type"] or ""), 0.0)
        case = CMCase(
            client_name=r["client_name"],
            phone=r["phone"],
            email=r["email"],
            afm=r["afm"],
            accountant=r["accountant"],
            sale_date=r["sale_date"],
            service_type=r["service_type"],
            status=r["status"],
            program_category=_detect_program(r["status"], r["service_type"]),
            approved_budget=r["approved_budget"],
            project_deadline=r["project_deadline"],
            approval_date=r["approval_date"],
            agreed_fee_application=r["agreed_fee_application"],
            agreed_fee_implementation=r["agreed_fee_implementation"],
            total_paid=paid,
            sheet_import_ref=ref,
            assigned_agent_id=_match_agent_id(r.get("responsible", ""), users),
            status_changed_at=datetime.utcnow(),
        )
        db.add(case)
        imported += 1
        existing_refs.add(ref)

    db.commit()
    return {"imported": imported, "skipped_existing": skipped}


def _do_sync_paid(db: Session) -> dict:
    """Sync total_paid from sheet without requiring auth. Used by scheduler and route."""
    rows = _read_sheet_rows()
    all_paid_map: dict = {}
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")
        afm = str(row[COL_MAP["afm"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        svc = str(row[COL_MAP["service_type"]]).strip()
        paid = _parse_float(row[COL_MAP["total_paid"]])
        key = _merge_key(afm, client_name, svc)
        all_paid_map[key] = all_paid_map.get(key, 0.0) + paid

    updated = 0
    cases = db.query(CMCase).all()
    for c in cases:
        if not c.sheet_import_ref:
            continue
        new_paid = all_paid_map.get(c.sheet_import_ref, 0.0)
        if abs((c.total_paid or 0) - new_paid) > 0.01:
            c.total_paid = new_paid
            c.updated_at = datetime.utcnow()
            updated += 1

    db.commit()
    return {"updated": updated}


@router.get("/auto-refresh-status")
def auto_refresh_status(current_user: CMUser = Depends(get_current_user)):
    """Return the last scheduled auto-refresh result."""
    return _last_auto_refresh


@router.get("/preview")
def preview_sheet(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview what would be imported from the sheet."""
    rows = _read_sheet_rows()
    records = _rows_to_records(rows)

    existing_refs = {c.sheet_import_ref for c in db.query(CMCase.sheet_import_ref).all() if c.sheet_import_ref}

    new_records = []
    already_imported = 0
    for r in records:
        ref = _merge_key(r['afm'] or '', r['client_name'], r['service_type'] or '')
        if ref in existing_refs:
            already_imported += 1
        else:
            new_records.append({**r, "ref": ref})

    return {
        "total_active_rows": len(records),
        "already_imported": already_imported,
        "new_to_import": len(new_records),
        "preview": new_records[:20],
    }


@router.post("/import")
def import_from_sheet(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import new cases from sheet. Existing cases are NOT updated (except ΠΟΣΟ via /sync)."""
    r = _do_import(db)
    return {**r, "message": f"Εισήχθησαν {r['imported']} νέες υποθέσεις. {r['skipped_existing']} υπήρχαν ήδη."}


@router.post("/sync-paid")
def sync_paid_amounts(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sync ONLY the total_paid field from sheet (sum of ΠΟΣΟ per AFM+service_type)."""
    r = _do_sync_paid(db)
    return {**r, "message": f"Ενημερώθηκαν {r['updated']} υποθέσεις με νέο ΠΟΣΟ από το Sheet."}


@router.post("/sync-agents")
def sync_agents(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sync assigned_agent_id from Υπεύθυνος Φακέλου column for all existing cases."""
    from models_cases import CMUser as UserModel
    rows = _read_sheet_rows()
    users = db.query(UserModel).filter(UserModel.is_active == True).all()

    # Build map: merge_key -> responsible name (take first non-empty value per key)
    responsible_map: dict[str, str] = {}
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")
        afm = str(row[COL_MAP["afm"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        service_type = str(row[COL_MAP["service_type"]]).strip()
        responsible = str(row[COL_MAP["responsible"]]).strip()
        if not client_name:
            continue
        key = _merge_key(afm, client_name, service_type)
        if key not in responsible_map and responsible:
            responsible_map[key] = responsible

    updated = 0
    cases = db.query(CMCase).all()
    for c in cases:
        if not c.sheet_import_ref:
            continue
        responsible = responsible_map.get(c.sheet_import_ref)
        if not responsible:
            continue
        agent_id = _match_agent_id(responsible, users)
        if agent_id and c.assigned_agent_id != agent_id:
            c.assigned_agent_id = agent_id
            updated += 1

    db.commit()
    return {"updated": updated, "message": f"Ενημερώθηκε ο υπεύθυνος σε {updated} υποθέσεις."}


@router.get("/service-types")
def list_service_types(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return distinct service_types with case counts and current program_category."""
    rows = (
        db.query(CMCase.service_type, CMCase.program_category, func.count(CMCase.id).label("cnt"))
        .group_by(CMCase.service_type, CMCase.program_category)
        .order_by(CMCase.service_type)
        .all()
    )
    # Aggregate per service_type → pick dominant program_category
    agg: dict = {}
    for service_type, program_category, cnt in rows:
        key = service_type or ""
        if key not in agg:
            agg[key] = {"service_type": service_type, "total": 0, "by_program": {}}
        agg[key]["total"] += cnt
        prog = program_category or "ΕΣΠΑ"
        agg[key]["by_program"][prog] = agg[key]["by_program"].get(prog, 0) + cnt

    result = []
    for key in sorted(agg):
        data = agg[key]
        dominant = max(data["by_program"], key=lambda k: data["by_program"][k])
        result.append({
            "service_type": data["service_type"],
            "total": data["total"],
            "program_category": dominant,
        })
    return result


class ProgramAssignment(BaseModel):
    service_type: Optional[str] = None
    program_category: str


class AssignProgramsRequest(BaseModel):
    assignments: List[ProgramAssignment]


@router.post("/sync-investment")
def sync_investment(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One-off: update approved_budget (ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ) for all existing cases from sheet."""
    rows = _read_sheet_rows()
    # Build map: merge_key -> approved_budget (take first non-zero per key)
    budget_map: dict[str, float] = {}
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")
        afm = str(row[COL_MAP["afm"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        svc = str(row[COL_MAP["service_type"]]).strip()
        budget = _parse_float(row[COL_MAP["approved_budget"]])
        if not client_name:
            continue
        key = _merge_key(afm, client_name, svc)
        if key not in budget_map and budget > 0:
            budget_map[key] = budget

    updated = 0
    for c in db.query(CMCase).all():
        if not c.sheet_import_ref:
            continue
        budget = budget_map.get(c.sheet_import_ref, 0.0)
        if budget > 0 and abs((c.approved_budget or 0) - budget) > 0.01:
            c.approved_budget = budget
            c.updated_at = datetime.utcnow()
            updated += 1

    db.commit()
    return {"updated": updated, "message": f"Ενημερώθηκε το Ύψος Επένδυσης σε {updated} υποθέσεις."}


@router.post("/sync-sale-dates")
def sync_sale_dates(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One-off: update sale_date (ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ) for all existing cases — picks earliest date per case."""
    rows = _read_sheet_rows()
    # Build map: merge_key -> earliest sale_date
    sale_date_map: dict[str, date] = {}
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")
        afm = str(row[COL_MAP["afm"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        svc = str(row[COL_MAP["service_type"]]).strip()
        sd = _parse_date(row[COL_MAP["sale_date"]])
        if not client_name or not sd:
            continue
        key = _merge_key(afm, client_name, svc)
        if key not in sale_date_map or sd < sale_date_map[key]:
            sale_date_map[key] = sd

    updated = 0
    for c in db.query(CMCase).all():
        if not c.sheet_import_ref:
            continue
        sd = sale_date_map.get(c.sheet_import_ref)
        if sd and c.sale_date != sd:
            c.sale_date = sd
            c.updated_at = datetime.utcnow()
            updated += 1

    db.commit()
    return {"updated": updated, "message": f"Ενημερώθηκε η Ημ. Πώλησης σε {updated} υποθέσεις."}


@router.post("/assign-programs")
def assign_programs(
    req: AssignProgramsRequest,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Bulk-assign program_category to cases matching each service_type."""
    total_updated = 0
    for a in req.assignments:
        q = db.query(CMCase)
        if a.service_type is None:
            q = q.filter(CMCase.service_type == None)
        else:
            q = q.filter(CMCase.service_type == a.service_type)
        for c in q.all():
            if c.program_category != a.program_category:
                c.program_category = a.program_category
                total_updated += 1
    db.commit()
    return {"updated": total_updated, "message": f"Ενημερώθηκαν {total_updated} υποθέσεις."}
