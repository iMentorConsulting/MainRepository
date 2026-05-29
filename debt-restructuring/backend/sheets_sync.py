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

# Sheet header → Lead field name
COL_MAP = {
    "Status": "status",
    "Assigned To": "assigned_to",
    "DATE": "date",
    "Date": "date",
    "Επωνυμία": "name",
    "Comments": "sheet_comments",
    "Next Call": "next_call_sheet",
    "Σύνολο Οφειλών": "total_debt",
    "Τηλέφωνο": "phone",
    "Email": "email",
    "ΠΡΟΣΦΟΡΑ": "offer_sent",
    "Προσφορά": "offer_sent",
    "Ημερομηνία Αποστολής Προσφοράς": "offer_sent_date",
    "ΠΟΣΟ ΠΡΟΣΦΟΡΑΣ ΓΙΑ ΥΠΟΒΟΛΗ": "offer_amount",
    "Ποσό Προσφοράς για Υποβολή": "offer_amount",
    "SUCCESS FEE ΠΡΟΣΦΟΡΑΣ": "success_fee",
    "Success Fee Προσφοράς": "success_fee",
    "Ευάλωτος Οφειλέτης": "vulnerable_debtor",
    "Referrer": "referrer",
    "ΥΠΗΡΕΣΙΑ": "service_type",
    "Υπηρεσία": "service_type",
    "ΑΡΙΘΜΟΣ ΑΙΤΗΣΗΣ": "application_number",
    "Αριθμός Αίτησης Εξωδ.": "application_number",
    "VIBER": "viber_info",
    "Viber & email (αυτοματοποιημένα)": "viber_info",
}


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


def fetch_sheet_rows() -> list:
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID not set")

    svc = _get_sheets_service()
    result = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range=f"'{TAB_NAME}'!A:Z",
    ).execute()

    rows = result.get("values", [])
    if len(rows) < 2:
        return []

    headers = [h.strip() for h in rows[0]]
    data_rows = []

    for row_num, row in enumerate(rows[1:], start=2):
        row_dict = {"_row_num": row_num}
        for i, header in enumerate(headers):
            field = COL_MAP.get(header, "_col_" + header.lower().replace(" ", "_")[:20])
            val = row[i].strip() if i < len(row) else ""
            row_dict[field] = val
        # Fill missing mapped fields with empty string
        for field in set(COL_MAP.values()):
            row_dict.setdefault(field, "")
        data_rows.append(row_dict)

    return data_rows


def _parse_bool(v: str) -> bool:
    return str(v).strip().lower() in ("true", "yes", "ναι", "✓", "x", "1", "☑")


def sync_leads(db) -> dict:
    from models import Lead

    rows = fetch_sheet_rows()
    inserted = 0
    updated = 0
    skipped = 0

    for row in rows:
        phone = row.get("phone", "").strip()
        name = row.get("name", "").strip()

        if not phone and not name:
            skipped += 1
            continue

        # Match by phone first, then by row number
        existing = None
        if phone:
            existing = db.query(Lead).filter(Lead.phone == phone).first()
        if not existing:
            existing = db.query(Lead).filter(Lead.sheet_row_num == row["_row_num"]).first()

        sheet_fields = dict(
            sheet_row_num=row["_row_num"],
            status=row.get("status", ""),
            assigned_to=row.get("assigned_to", ""),
            date=row.get("date", ""),
            name=name,
            sheet_comments=row.get("sheet_comments", ""),
            next_call_sheet=row.get("next_call_sheet", ""),
            total_debt=row.get("total_debt", ""),
            phone=phone,
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
        )

        if existing:
            for k, v in sheet_fields.items():
                setattr(existing, k, v)
            existing.updated_at = datetime.utcnow()
            updated += 1
        else:
            db.add(Lead(**sheet_fields))
            inserted += 1

    db.commit()
    return {
        "ok": True,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "total_sheet_rows": len(rows),
    }
