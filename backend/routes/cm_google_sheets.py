import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date as date
from database import get_db
from models_cases import CMCase, CMPaymentLog
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
        detected_program = _detect_program(r["status"], r["service_type"])
        # Validate that the sheet status belongs to the detected program.
        # If not (e.g. ΕΣΠΑ status on a ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ case), fall back to the
        # first status of the correct pipeline so the case is not imported with
        # a status that makes no sense for its program category.
        from pipelines import PIPELINES as _PIPELINES
        valid_for_program = set(get_all_statuses_for_program(detected_program))
        if r["status"] not in valid_for_program:
            r["status"] = _PIPELINES[detected_program]["phases"][0]["statuses"][0]
        case = CMCase(
            client_name=r["client_name"],
            phone=r["phone"],
            email=r["email"],
            afm=r["afm"],
            accountant=r["accountant"],
            sale_date=r["sale_date"],
            service_type=r["service_type"],
            status=r["status"],
            program_category=detected_program,
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
        db.flush()  # get case.id before commit
        if paid > 0.01:
            db.add(CMPaymentLog(
                case_id=case.id,
                previous_total=0.0,
                new_total=paid,
                delta=paid,
                source="sheet_import_new",
                log_date=datetime.utcnow(),
            ))
        imported += 1
        existing_refs.add(ref)

    db.commit()
    return {"imported": imported, "skipped_existing": skipped}


def _do_sync_paid(db: Session) -> dict:
    """Sync total_paid from sheet without requiring auth. Used by scheduler and route."""
    rows = _read_sheet_rows()

    # Three maps for robust matching: by sheet_import_ref key, by (afm, svc), by (name, svc)
    ref_map: dict = {}
    afm_svc_map: dict = {}
    name_svc_map: dict = {}

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
        ref_map[key] = ref_map.get(key, 0.0) + paid

        if afm:
            afm_svc_map[(afm, svc)] = afm_svc_map.get((afm, svc), 0.0) + paid
        if client_name:
            name_svc_map[(client_name.upper(), svc)] = name_svc_map.get((client_name.upper(), svc), 0.0) + paid

    updated = 0
    cases = db.query(CMCase).all()
    for c in cases:
        new_paid = None

        # 1. Match by sheet_import_ref (cases imported from sheet)
        if c.sheet_import_ref and c.sheet_import_ref in ref_map:
            new_paid = ref_map[c.sheet_import_ref]

        # 2. Fallback: match by AFM + service_type
        if new_paid is None and c.afm:
            new_paid = afm_svc_map.get((c.afm, c.service_type or ""))

        # 3. Fallback: match by client name + service_type
        if new_paid is None and c.client_name:
            new_paid = name_svc_map.get((c.client_name.upper().strip(), c.service_type or ""))

        # No match in sheet at all — do not reset, skip
        if new_paid is None:
            continue

        if abs((c.total_paid or 0) - new_paid) > 0.01:
            prev = c.total_paid or 0.0
            delta = new_paid - prev
            c.total_paid = new_paid
            c.updated_at = datetime.utcnow()
            updated += 1
            db.add(CMPaymentLog(
                case_id=c.id,
                previous_total=prev,
                new_total=new_paid,
                delta=delta,
                source="sheet_import",
                log_date=datetime.utcnow(),
            ))

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


# ── ΑΝΑΚΑΙΝΙΖΩ sheet import ──────────────────────────────────────────────────
# ── ΑΝΑΚΑΙΝΙΖΩ Sheet (separate spreadsheet) ──────────────────────────────────
# Actual columns (0-indexed, from sheet diagnosis):
# 0=DATE  1=Επωνυμία  2=Email  3=Τηλέφωνο  4=VIBER(skip)
# 5=Πόλη  6=Status  7=Comments  8=Τύπος Κατοικίας  9=Παλαιότητα
# 10=ΤΜ  11=Χρήση  12=Εργασίες Ανακαίνισης  13=Νομιμότητα(skip)
# 14=Assigned To(skip)  15=Next Call(skip)
# 16=*ΤΙΤΛΟΣ  17=*Ε9  18=*ΑΔΕΙΑ  19=*ΤΑΚΤ.ΑΥΘ.  20=*ΣΧΕΔΙΑ
# 21=Ε1  22=ΕΚΚΑΘ  23=Ε2
ANA_COL = {
    "sale_date": 0,
    "client_name": 1,
    "email": 2,
    "phone": 3,
    # col 4: VIBER — skipped
    "property_prefecture": 5,
    "status": 6,
    "notes": 7,
    "property_type": 8,
    "property_age": 9,
    "property_sqm": 10,
    "property_usage": 11,
    "renovation_works": 12,
    # col 13: Νομιμότητα Ακινήτου — skipped per user request
    # col 14: Assigned To — skipped
    # col 15: Next Call — skipped
    "doc_title_deed": 16,
    "doc_e9": 17,
    "doc_permit": 18,
    "doc_legalization": 19,
    "doc_plans": 20,
    "doc_e1": 21,
    "doc_tax_clearance": 22,
    "doc_e2": 23,
}
ANA_NUM_COLS = 24

ANAKAINIZW_SPREADSHEET_ID = os.getenv("ANAKAINIZW_SHEET_ID", "1BB-39I_7yAt6pOK0Ua-Tx6EZcmPp8DIFm7q0drd4VsM")
ANAKAINIZW_SHEET_TAB = os.getenv("ANAKAINIZW_SHEET_TAB", "ΑΝΑΚΑΙΝΙΣΕΙΣ")
ANAKAINIZW_SERVICE_TYPE = "Ανακαινίζω"


def _normalize_phone_token(phone: str) -> str:
    """Strip non-digits, remove leading Greek country code (30), return bare number."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("30") and len(digits) > 10:
        digits = digits[2:]
    return digits


def _parse_bool_cell(val: str) -> bool:
    return str(val).strip().upper() in ("TRUE", "1", "ΝΑΙ", "NAI", "YES")


def _read_anakainizw_rows() -> list[list]:
    """Read all rows from the ΑΝΑΚΑΙΝΙΖΩ spreadsheet."""
    service = _get_sheets_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=ANAKAINIZW_SPREADSHEET_ID, range=f"{ANAKAINIZW_SHEET_TAB}!A:U")
        .execute()
    )
    return result.get("values", [])


CANCEL_STATUSES = {"CANCEL", "CANCELLED", "ΑΚΥΡΩΣΗ", "CANCELED"}


def _is_cancel_status(status: str) -> bool:
    return status.strip().upper() in CANCEL_STATUSES


def _parse_anakainizw_data_rows(rows: list) -> list:
    """Parse raw sheet rows into dicts. Returns list of parsed row dicts (no header)."""
    parsed = []
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < ANA_NUM_COLS:
            row.append("")
        client_name = str(row[ANA_COL["client_name"]]).strip()
        if not client_name:
            continue
        parsed.append({
            "sheet_row": i + 1,  # 1-based row number
            "client_name": client_name,
            "email": str(row[ANA_COL["email"]]).strip() or None,
            "phone": str(row[ANA_COL["phone"]]).strip() or None,
            "status_raw": str(row[ANA_COL["status"]]).strip(),
            "property_prefecture": str(row[ANA_COL["property_prefecture"]]).strip() or None,
            "property_sqm": str(row[ANA_COL["property_sqm"]]).strip() or None,
            "property_usage": str(row[ANA_COL["property_usage"]]).strip() or None,
            "property_type": str(row[ANA_COL["property_type"]]).strip() or None,
            "property_age": str(row[ANA_COL["property_age"]]).strip() or None,
            "renovation_works": str(row[ANA_COL["renovation_works"]]).strip() or None,
            "sale_date": str(row[ANA_COL["sale_date"]]).strip() or None,
            "_raw": row,  # keep raw for actual import
        })
    return parsed


def _do_import_anakainizw(db: Session, selected_rows: list[int] | None = None) -> dict:
    """Import/update cases from the ΑΝΑΚΑΙΝΙΖΩ Google Sheet.

    selected_rows: sheet_row numbers (1-based) chosen by the user for duplicate groups.
                   Non-duplicate rows are always imported (unless CANCEL).
    """
    from models_cases import CMCaseAnakainizw as CMCaseAna
    from pipelines import PIPELINES as _PIPELINES

    raw_rows = _read_anakainizw_rows()
    if not raw_rows:
        return {"imported": 0, "updated": 0, "skipped": 0, "cancelled": 0}

    parsed = _parse_anakainizw_data_rows(raw_rows)
    if not parsed:
        return {"imported": 0, "updated": 0, "skipped": 0, "cancelled": 0}

    # Identify duplicate names (excluding cancelled rows)
    from collections import Counter
    name_counts = Counter(
        p["client_name"] for p in parsed if not _is_cancel_status(p["status_raw"])
    )
    duplicate_names = {name for name, cnt in name_counts.items() if cnt > 1}
    selected_set = set(selected_rows or [])

    valid_statuses = set(get_all_statuses_for_program("ΑΝΑΚΑΙΝΙΖΩ"))
    first_status = _PIPELINES["ΑΝΑΚΑΙΝΙΖΩ"]["phases"][0]["statuses"][0]

    imported = 0
    updated = 0
    skipped = 0
    cancelled = 0
    ana_row_cache: dict = {}

    for p in parsed:
        row = p["_raw"]
        client_name = p["client_name"]
        sheet_row = p["sheet_row"]
        status_raw = p["status_raw"]

        # Skip CANCEL statuses
        if _is_cancel_status(status_raw):
            cancelled += 1
            continue

        # Skip duplicate rows not explicitly selected by user
        if client_name in duplicate_names and sheet_row not in selected_set:
            skipped += 1
            continue

        status = status_raw if status_raw in valid_statuses else first_status
        phone = str(row[ANA_COL["phone"]]).strip() or None
        email = str(row[ANA_COL["email"]]).strip() or None
        sale_date = _parse_date(str(row[ANA_COL["sale_date"]]).strip())
        property_prefecture = str(row[ANA_COL["property_prefecture"]]).strip() or None
        property_type = str(row[ANA_COL["property_type"]]).strip() or None
        property_age = str(row[ANA_COL["property_age"]]).strip() or None
        sqm_raw = str(row[ANA_COL["property_sqm"]]).strip()
        property_sqm = _parse_float(sqm_raw) if sqm_raw else None
        property_usage = str(row[ANA_COL["property_usage"]]).strip() or None
        renovation_works = str(row[ANA_COL["renovation_works"]]).strip() or None
        notes = str(row[ANA_COL["notes"]]).strip() or None

        doc_title_deed = _parse_bool_cell(row[ANA_COL["doc_title_deed"]])
        doc_e9 = _parse_bool_cell(row[ANA_COL["doc_e9"]])
        doc_permit = _parse_bool_cell(row[ANA_COL["doc_permit"]])
        doc_legalization = _parse_bool_cell(row[ANA_COL["doc_legalization"]])
        doc_plans = _parse_bool_cell(row[ANA_COL["doc_plans"]])
        doc_e1 = _parse_bool_cell(row[ANA_COL["doc_e1"]])
        doc_tax_clearance = _parse_bool_cell(row[ANA_COL["doc_tax_clearance"]])
        doc_e2 = _parse_bool_cell(row[ANA_COL["doc_e2"]])

        phone_token = _normalize_phone_token(phone) if phone else None
        # For duplicates each row is a separate case — use phone+row as unique ref
        if client_name in duplicate_names:
            ref = _merge_key("", f"{client_name}__row{sheet_row}", ANAKAINIZW_SERVICE_TYPE)
        else:
            ref = _merge_key("", client_name, ANAKAINIZW_SERVICE_TYPE)

        existing = db.query(CMCase).filter(CMCase.sheet_import_ref == ref).first()
        if not existing and client_name not in duplicate_names:
            existing = db.query(CMCase).filter(
                CMCase.client_name == client_name,
                CMCase.program_category == "ΑΝΑΚΑΙΝΙΖΩ",
            ).first()

        if existing:
            changed = False
            if existing.program_category != "ΑΝΑΚΑΙΝΙΖΩ":
                existing.program_category = "ΑΝΑΚΑΙΝΙΖΩ"
                changed = True
            if existing.service_type != ANAKAINIZW_SERVICE_TYPE:
                existing.service_type = ANAKAINIZW_SERVICE_TYPE
                changed = True
            if status and existing.status != status:
                existing.status = status
                existing.status_changed_at = datetime.utcnow()
                changed = True
            for field, val in [("phone", phone), ("email", email), ("sale_date", sale_date)]:
                if val and getattr(existing, field) != val:
                    setattr(existing, field, val)
                    changed = True
            if notes and existing.notes != notes:
                existing.notes = notes
                changed = True
            if not existing.share_token and phone_token:
                existing.share_token = phone_token
                existing.portal_active = True
                changed = True
            if changed:
                existing.updated_at = datetime.utcnow()
                updated += 1
            else:
                skipped += 1

            case_id = existing.id
            if case_id not in ana_row_cache:
                ana_row = db.query(CMCaseAna).filter(CMCaseAna.case_id == case_id).first()
                if not ana_row:
                    ana_row = CMCaseAna(case_id=case_id)
                    db.add(ana_row)
                ana_row_cache[case_id] = ana_row
            ana_row = ana_row_cache[case_id]
        else:
            case = CMCase(
                client_name=client_name,
                phone=phone,
                email=email,
                sale_date=sale_date,
                service_type=ANAKAINIZW_SERVICE_TYPE,
                status=status,
                program_category="ΑΝΑΚΑΙΝΙΖΩ",
                sheet_import_ref=ref,
                notes=notes,
                share_token=phone_token,
                portal_active=bool(phone_token),
                status_changed_at=datetime.utcnow(),
            )
            db.add(case)
            db.flush()
            ana_row = CMCaseAna(case_id=case.id)
            db.add(ana_row)
            ana_row_cache[case.id] = ana_row
            imported += 1

        ana_row.property_prefecture = property_prefecture
        ana_row.property_type = property_type
        ana_row.property_age = property_age
        if property_sqm is not None:
            ana_row.property_sqm = property_sqm
        ana_row.property_usage = property_usage
        ana_row.renovation_works = renovation_works
        ana_row.doc_title_deed = doc_title_deed
        ana_row.doc_e9 = doc_e9
        ana_row.doc_permit = doc_permit
        ana_row.doc_legalization = doc_legalization
        ana_row.doc_plans = doc_plans
        ana_row.doc_e1 = doc_e1
        ana_row.doc_tax_clearance = doc_tax_clearance
        ana_row.doc_e2 = doc_e2
        ana_row.updated_at = datetime.utcnow()

    db.commit()
    return {"imported": imported, "updated": updated, "skipped": skipped, "cancelled": cancelled}


class AnaImportRequest(BaseModel):
    selected_rows: list[int] = []


@router.post("/import-anakainizw")
def import_anakainizw_sheet(
    req: AnaImportRequest = AnaImportRequest(),
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import/update cases from the ΑΝΑΚΑΙΝΙΖΩ Google Sheet."""
    try:
        r = _do_import_anakainizw(db, selected_rows=req.selected_rows)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Σφάλμα εισαγωγής: {exc}")
    return {
        **r,
        "message": (
            f"Εισήχθησαν {r['imported']} νέες, "
            f"ενημερώθηκαν {r['updated']}, "
            f"παραλείφθηκαν {r['skipped']}, "
            f"ακυρωμένες {r['cancelled']}."
        ),
    }


@router.get("/anakainizw-headers")
def anakainizw_headers(
    current_user: CMUser = Depends(get_current_user),
):
    """Return the raw header row and first 3 data rows to verify column mapping."""
    try:
        rows = _read_anakainizw_rows()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Σφάλμα: {exc}")
    if not rows:
        return {"headers": [], "sample_rows": []}
    headers = [{"col": i, "header": v} for i, v in enumerate(rows[0])]
    sample = []
    for row in rows[1:4]:
        while len(row) < len(rows[0]):
            row.append("")
        sample.append([{"col": i, "value": v} for i, v in enumerate(row)])
    return {"headers": headers, "sample_rows": sample}


@router.get("/preview-anakainizw")
def preview_anakainizw_sheet(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview rows: returns auto-import count, cancelled count, and duplicate groups."""
    try:
        raw_rows = _read_anakainizw_rows()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Σφάλμα ανάγνωσης sheet: {exc}")

    parsed = _parse_anakainizw_data_rows(raw_rows)
    from collections import Counter
    name_counts = Counter(
        p["client_name"] for p in parsed if not _is_cancel_status(p["status_raw"])
    )
    duplicate_names = {name for name, cnt in name_counts.items() if cnt > 1}

    auto_rows = []
    cancelled_rows = []
    dup_groups: dict = {}

    for p in parsed:
        entry = {
            "sheet_row": p["sheet_row"],
            "client_name": p["client_name"],
            "phone": p["phone"],
            "email": p["email"],
            "property_prefecture": p["property_prefecture"],
            "property_sqm": p["property_sqm"],
            "property_usage": p["property_usage"],
            "property_age": p["property_age"],
            "status": p["status_raw"],
            "sale_date": p["sale_date"],
        }
        if _is_cancel_status(p["status_raw"]):
            cancelled_rows.append(entry)
        elif p["client_name"] in duplicate_names:
            dup_groups.setdefault(p["client_name"], []).append(entry)
        else:
            auto_rows.append(entry)

    duplicate_groups = [
        {"client_name": name, "rows": rows}
        for name, rows in dup_groups.items()
    ]

    return {
        "auto_count": len(auto_rows),
        "cancelled_count": len(cancelled_rows),
        "duplicate_groups": duplicate_groups,
        "total_rows": len(parsed),
    }


@router.post("/fix-anakainizw-program")
def fix_anakainizw_program_category(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fix: set program_category='ΑΝΑΚΑΙΝΙΖΩ' for all cases that either have a
    cm_case_anakainizw record OR have service_type='Ανακαινίζω'."""
    from models_cases import CMCaseAnakainizw as CMCaseAnaFix
    from sqlalchemy import or_
    subq = db.query(CMCaseAnaFix.case_id).subquery()
    cases = db.query(CMCase).filter(
        or_(
            CMCase.id.in_(subq),
            CMCase.service_type == ANAKAINIZW_SERVICE_TYPE,
        )
    ).all()
    fixed = 0
    for c in cases:
        changed = False
        if c.program_category != "ΑΝΑΚΑΙΝΙΖΩ":
            c.program_category = "ΑΝΑΚΑΙΝΙΖΩ"
            changed = True
        if c.service_type != ANAKAINIZW_SERVICE_TYPE:
            c.service_type = ANAKAINIZW_SERVICE_TYPE
            changed = True
        if changed:
            c.updated_at = datetime.utcnow()
            fixed += 1
    db.commit()
    return {"fixed": fixed, "total_anakainizw": len(cases)}


@router.post("/delete-non-keno-anakainizw")
def delete_non_keno_anakainizw(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete ΑΝΑΚΑΙΝΙΖΩ cases where property_usage is ΜΙΣΘΩΜΕΝΟ or ΙΔΙΟΚΑΤΟΙΚΗΣΗ.
    Only cases with a cm_case_anakainizw record are affected."""
    from models_cases import CMCaseAnakainizw as CMCaseAnaDel
    NON_KENO = {"ΜΙΣΘΩΜΕΝΟ", "ΙΔΙΟΚΑΤΟΙΚΗΣΗ", "ΜΙΣΘΩΜΈΝΟ", "ΙΔΙΟΚΑΤΟΊΚΗΣΗ",
                "Μισθωμένο", "Ιδιοκατοίκηση", "μισθωμένο", "ιδιοκατοίκηση"}
    rows = db.query(CMCaseAnaDel).all()
    to_delete = []
    for r in rows:
        usage = (r.property_usage or "").strip()
        if usage in NON_KENO or (usage and usage.upper() not in ("ΚΕΝΟ", "KENO", "")):
            # Only delete if usage is explicitly non-ΚΕΝΟ
            if usage and usage.upper() != "ΚΕΝΟ":
                to_delete.append(r.case_id)
    deleted = 0
    for case_id in to_delete:
        case = db.query(CMCase).filter(CMCase.id == case_id).first()
        if case:
            db.delete(case)
            deleted += 1
    db.commit()
    return {"deleted": deleted, "case_ids": to_delete}
