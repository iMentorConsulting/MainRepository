"""
Google Sheets → Leads sync.

Requires env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON  — same service account used for Drive backup
  GOOGLE_SHEET_ID              — spreadsheet ID (from the URL)

The service account must have Viewer access to the spreadsheet.
Tab read: ΔΙΑΧΕΙΡΙΣΗ
"""

import os
import json
from datetime import datetime


TAB_NAME = "ΔΙΑΧΕΙΡΙΣΗ"

# Sheet header → Lead field name (exact match, first occurrence wins on duplicates)
COL_MAP = {
    # Core fields
    "Status": "status",
    "Assigned To": "assigned_to",
    "ΣΥΜΒΟΥΛΟΣ": "assigned_to",
    "Σύμβουλος": "assigned_to",
    "DATE": "date",
    "Date": "date",
    "ΜΗΝΑΣ": "month_sheet",
    "Επωνυμία": "name",
    "First": "first_name_sheet",
    "Last": "last_name_sheet",
    "Comments": "sheet_comments",
    "Next Call": "next_call_sheet",
    "Σύνολο Οφειλών": "total_debt",
    "Τηλέφωνο": "phone",
    "Email": "email",
    "VIBER": "viber_info",
    # Service & results
    "ΥΠΗΡΕΣΙΑ": "service_type",
    "ΑΠΟΤΕΛΕΣΜΑ ΠΛΑΤΦΟΡΜΑΣ": "platform_result",
    # Offer / case fields
    "ΠΡΟΣΦΟΡΑ": "offer_sent",
    "Προσφορά": "offer_sent",
    "Ημερομηνία Αποστολής Προσφοράς": "offer_sent_date",
    "ΠΟΣΟ ΠΡΟΣΦΟΡΑΣ ΓΙΑ ΥΠΟΒΟΛΗ": "offer_amount",
    "Ποσό Προσφοράς για Υποβολή": "offer_amount",
    "SUCCESS FEE ΠΡΟΣΦΟΡΑΣ": "success_fee",
    "Success Fee Προσφοράς": "success_fee",
    "Ευάλωτος Οφειλέτης": "vulnerable_debtor",
    "Referrer": "referrer",
    "ΑΡΙΘΜΟΣ ΑΙΤΗΣΗΣ": "application_number",
    "Αριθμός Αίτησης Εξωδ.": "application_number",
}

# Case-insensitive fallback
_COL_MAP_LOWER = {k.lower(): v for k, v in COL_MAP.items()}

# Fields stored in extra_fields JSON (shown in expanded row)
EXTRA_DISPLAY_LABELS = {
    "Ιδιότητα": "Ιδιότητα",
    "Αντικείμενο Επιχείρησης": "Αντικείμενο",
    "Νομική Μορφή Επιχείρησης": "Νομική Μορφή",
    "Εφορία": "Εφορία",
    "Ασφ.Ταμεία": "Ασφ.Ταμεία",
    "Τράπεζες": "Τράπεζες",
    "FUNDS": "FUNDS",
    "τρίτους": "Τρίτοι",
    "Ρύθμιση Δημοσίου": "Ρύθμιση Δημοσίου",
    "Ρύθμιση Ασφ.Ταμείων": "Ρύθμιση Ασφ.Ταμείων",
    "Ρύθμιση τραπεζικών": "Ρύθμιση Τραπεζών",
    "Διαγραφή": "Διαγραφή",
}


def _map_header(header: str) -> str | None:
    """Map a sheet header to a Lead field name. Returns None for headers to put in extra_fields."""
    h = header.strip()
    mapped = COL_MAP.get(h) or _COL_MAP_LOWER.get(h.lower())
    return mapped  # None means → extra_fields


def _normalize_status(raw: str) -> str:
    """Map any sheet status value to one of the 5 canonical, uppercase groups:
    CANCEL, CALL, ACTIVE, HOT, DEAL."""
    r = raw.strip().upper()
    if not r:
        return ""
    if r.startswith("CANCEL"):
        return "CANCEL"
    if r == "DEAL":
        return "DEAL"
    if r == "ACTIVE":
        return "ACTIVE"
    if r == "CALL":
        return "CALL"
    if r == "HOT":
        return "HOT"
    return r


def _get_sheets_service():
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON not set")
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    creds = Credentials.from_service_account_info(
        json.loads(sa_json),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def fetch_raw_headers() -> dict:
    """Return the raw headers + field mapping for debugging."""
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID not set")
    svc = _get_sheets_service()
    # Use A:BZ to capture up to 78 columns
    result = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range=f"'{TAB_NAME}'!A1:BZ1",
    ).execute()
    raw_headers = result.get("values", [[]])[0]
    mapping = {}
    for h in raw_headers:
        field = _map_header(h)
        mapping[h] = field if field else f"extra_fields[{h}]"
    return {
        "raw_headers": raw_headers,
        "total_columns": len(raw_headers),
        "mapping": mapping,
    }


def fetch_sheet_rows(from_row: int = 0) -> list:
    """Fetch data rows. from_row > 0 skips rows already in DB (incremental)."""
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID not set")

    svc = _get_sheets_service()
    # Use A:BZ to capture up to 78 columns (handles sheets with many columns)
    result = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range=f"'{TAB_NAME}'!A:BZ",
    ).execute()

    rows = result.get("values", [])
    if len(rows) < 2:
        return []

    raw_headers = rows[0]
    headers = [h.strip() for h in raw_headers]

    # Track which core field has been assigned first (handles duplicate headers)
    data_rows = []

    for row_num, row in enumerate(rows[1:], start=2):
        if from_row > 0 and row_num <= from_row:
            continue

        row_dict = {"_row_num": row_num, "_extra_": {}}
        assigned_core = set()

        for i, header in enumerate(headers):
            val = row[i].strip() if i < len(row) else ""
            field = _map_header(header)

            if field is None:
                # Store in extra_fields (skip empty values)
                if val:
                    row_dict["_extra_"][header] = val
            elif field not in assigned_core:
                # First occurrence wins
                row_dict[field] = val
                assigned_core.add(field)

        # Ensure all core mapped fields exist
        for f in set(COL_MAP.values()):
            row_dict.setdefault(f, "")

        data_rows.append(row_dict)

    return data_rows


def _parse_bool(v: str) -> bool:
    return str(v).strip().lower() in ("true", "yes", "ναι", "✓", "x", "1", "☑")


def _build_sheet_fields(row: dict) -> dict:
    raw_status = row.get("status", "").strip()
    # Build name: prefer Επωνυμία, fallback to First + Last
    name = row.get("name", "").strip()
    if not name:
        first = row.get("first_name_sheet", "").strip()
        last = row.get("last_name_sheet", "").strip()
        name = f"{first} {last}".strip()
    return dict(
        sheet_row_num=row["_row_num"],
        status=_normalize_status(raw_status),
        status_raw=raw_status,
        assigned_to=row.get("assigned_to", ""),
        date=row.get("date", ""),
        month_sheet=row.get("month_sheet", ""),
        name=name,
        sheet_comments=row.get("sheet_comments", ""),
        next_call_sheet=row.get("next_call_sheet", ""),
        total_debt=row.get("total_debt", ""),
        phone=row.get("phone", "").strip(),
        email=row.get("email", ""),
        offer_sent=_parse_bool(row.get("offer_sent", "")),
        offer_sent_date=row.get("offer_sent_date", ""),
        offer_amount=row.get("offer_amount", ""),
        success_fee=row.get("success_fee", ""),
        vulnerable_debtor=_parse_bool(row.get("vulnerable_debtor", "")),
        referrer=row.get("referrer", ""),
        service_type=row.get("service_type", ""),
        application_number=row.get("application_number", ""),
        viber_info=row.get("viber_info", ""),
        platform_result=row.get("platform_result", ""),
        extra_fields=row.get("_extra_", {}),
    )


def sync_leads(db, full: bool = False) -> dict:
    """
    full=False → incremental: only new rows beyond max sheet_row_num in DB.
    full=True  → insert rows missing from DB (matched by sheet_row_num only).
                 Existing records are NEVER updated — app data (status, comments,
                 app_next_call, assigned_to) is always preserved.
    Matching is by sheet_row_num only. Phone is NOT used for matching because
    multiple sheet rows can share the same phone number (different family members).
    """
    from models import Lead
    from sqlalchemy import func

    from_row = 0
    if not full:
        max_row = db.query(func.max(Lead.sheet_row_num)).scalar()
        from_row = max_row or 0

    rows = fetch_sheet_rows(from_row=from_row)
    inserted = 0
    skipped = 0
    new_leads = []

    # For full sync build a set of existing row numbers to avoid N+1 queries
    if full:
        existing_row_nums = set(
            r[0] for r in db.query(Lead.sheet_row_num).filter(Lead.sheet_row_num != None).all()
        )

    for row in rows:
        fields = _build_sheet_fields(row)
        phone = fields["phone"]
        name = fields["name"]

        if not phone and not name:
            skipped += 1
            continue

        if full and row["_row_num"] in existing_row_nums:
            # Already in DB — never overwrite existing records
            skipped += 1
            continue

        lead = Lead(**fields)
        db.add(lead)
        new_leads.append(lead)
        inserted += 1

    db.commit()

    # Auto-send the Θέμις screening link — only for the normal incremental sync,
    # never for a full backfill/reconciliation pass (would mass-message historical leads).
    if not full and new_leads:
        try:
            from themis_ai import send_themis_link
            for lead in new_leads:
                send_themis_link(lead)
        except Exception:
            pass

    return {
        "ok": True,
        "mode": "full" if full else "incremental",
        "from_row": from_row,
        "inserted": inserted,
        "updated": 0,
        "skipped": skipped,
        "new_rows_processed": len(rows),
    }


def normalize_all_statuses(db) -> dict:
    """Fix existing leads where status wasn't properly normalized."""
    from models import Lead
    leads = db.query(Lead).all()
    fixed = 0
    for lead in leads:
        raw = lead.status_raw or lead.status or ""
        normalized = _normalize_status(raw)
        if normalized != lead.status:
            lead.status = normalized
            if not lead.status_raw:
                lead.status_raw = lead.status  # best effort
            fixed += 1
    db.commit()
    return {"ok": True, "fixed": fixed, "total": len(leads)}
