import os
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date
from database import get_db
from models_cases import CMCase, ACTIVE_STATUSES
from auth_cases import get_current_user, require_admin, CMUser

router = APIRouter(prefix="/api/cm/sheets", tags=["cm-sheets"])

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
    merged: dict[str, dict] = {}
    if not rows:
        return []
    for i, row in enumerate(rows):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")

        status = str(row[COL_MAP["status"]]).strip()
        if status not in ACTIVE_STATUSES:
            continue

        afm = str(row[COL_MAP["afm"]]).strip()
        service_type = str(row[COL_MAP["service_type"]]).strip()
        client_name = str(row[COL_MAP["client_name"]]).strip()
        if not client_name:
            continue

        key = _merge_key(afm, client_name, service_type)
        rec = {
            "client_name": client_name,
            "status": status,
            "email": str(row[COL_MAP["email"]]).strip() or None,
            "phone": str(row[COL_MAP["phone"]]).strip() or None,
            "afm": afm or None,
            "accountant": str(row[COL_MAP["accountant"]]).strip() or None,
            "agreed_fee_application": _parse_float(row[COL_MAP["agreed_fee_application"]]),
            "agreed_fee_implementation": _parse_float(row[COL_MAP["agreed_fee_implementation"]]),
            "approval_date": _parse_date(row[COL_MAP["approval_date"]]),
            "project_deadline": _parse_date(row[COL_MAP["project_deadline"]]),
            "approved_budget": _parse_float(row[COL_MAP["approved_budget"]]),
            "service_type": service_type or None,
            "total_paid": _parse_float(row[COL_MAP["total_paid"]]),
            "sale_date": _parse_date(row[COL_MAP["sale_date"]]),
            "responsible": str(row[COL_MAP["responsible"]]).strip(),
        }
        if key in merged:
            # Sum fee amounts; keep first non-None values for other fields
            existing = merged[key]
            existing["agreed_fee_application"] += rec["agreed_fee_application"]
            existing["agreed_fee_implementation"] += rec["agreed_fee_implementation"]
            existing["total_paid"] += rec["total_paid"]
            for field in ("email", "phone", "afm", "accountant", "approval_date",
                          "project_deadline", "approved_budget", "sale_date"):
                if not existing.get(field) and rec.get(field):
                    existing[field] = rec[field]
        else:
            merged[key] = rec
    return list(merged.values())


def _build_paid_map(records: list[dict]) -> dict:
    """Sum ΠΟΣΟ per (afm, service_type) key for sync."""
    paid_map = {}
    for r in records:
        key = (r["afm"] or "", r["service_type"] or "")
        paid_map[key] = paid_map.get(key, 0.0) + (r["total_paid"] or 0.0)
    return paid_map


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
    rows = _read_sheet_rows()
    records = _rows_to_records(rows)

    from models_cases import CMUser
    users = db.query(CMUser).filter(CMUser.is_active == True).all()

    existing_refs = {c.sheet_import_ref for c in db.query(CMCase).all() if c.sheet_import_ref}

    # Build paid map (sum ΠΟΣΟ per AFM+service)
    paid_map = _build_paid_map(records)

    imported = 0
    skipped = 0

    for r in records:
        ref = _merge_key(r['afm'] or '', r['client_name'], r['service_type'] or '')
        if ref in existing_refs:
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
            approved_budget=r["approved_budget"],
            project_deadline=r["project_deadline"],
            approval_date=r["approval_date"],
            agreed_fee_application=r["agreed_fee_application"],
            agreed_fee_implementation=r["agreed_fee_implementation"],
            total_paid=paid,
            sheet_import_ref=ref,
            assigned_agent_id=_match_agent_id(r.get("responsible", ""), users),
        )
        db.add(case)
        imported += 1
        existing_refs.add(ref)  # prevent duplicates in same batch

    db.commit()
    return {
        "imported": imported,
        "skipped_existing": skipped,
        "message": f"Εισήχθησαν {imported} νέες υποθέσεις. {skipped} υπήρχαν ήδη.",
    }


@router.post("/sync-paid")
def sync_paid_amounts(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sync ONLY the total_paid field from sheet (sum of ΠΟΣΟ per AFM+service_type)."""
    rows = _read_sheet_rows()
    records = _rows_to_records(rows)

    # Build paid map from ALL rows (not just active statuses for summing)
    rows_all = _read_sheet_rows()
    # Re-parse without status filter for ΠΟΣΟ sum
    all_paid_map: dict = {}
    for i, row in enumerate(rows_all):
        if i == 0:
            continue
        while len(row) < 26:
            row.append("")
        afm = str(row[COL_MAP["afm"]]).strip()
        svc = str(row[COL_MAP["service_type"]]).strip()
        paid = _parse_float(row[COL_MAP["total_paid"]])
        key = (afm, svc)
        all_paid_map[key] = all_paid_map.get(key, 0.0) + paid

    updated = 0
    cases = db.query(CMCase).all()
    for c in cases:
        if not c.sheet_import_ref:
            continue
        parts = c.sheet_import_ref.split("|", 1)
        if len(parts) != 2:
            continue
        afm, svc = parts[0], parts[1]
        new_paid = all_paid_map.get((afm, svc), 0.0)
        if abs((c.total_paid or 0) - new_paid) > 0.01:
            c.total_paid = new_paid
            c.updated_at = datetime.utcnow()
            updated += 1

    db.commit()
    return {
        "updated": updated,
        "message": f"Ενημερώθηκαν {updated} υποθέσεις με νέο ΠΟΣΟ από το Sheet.",
    }


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
