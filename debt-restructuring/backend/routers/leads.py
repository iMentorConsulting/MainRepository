from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String
from typing import Optional, List
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel
import os, json, base64, time, re

_ATHENS = ZoneInfo("Europe/Athens")
def _now():
    return datetime.now(_ATHENS).replace(tzinfo=None)


_GREEK_MONTHS = {
    "ιαν": 1, "φεβ": 2, "μαρ": 3, "απρ": 4, "μαι": 5, "ιουν": 6,
    "ιουλ": 7, "αυγ": 8, "σεπ": 9, "οκτ": 10, "νοε": 11, "δεκ": 12,
}
_GREEK_ACCENTS = str.maketrans("άέήίϊΐόύϋΰώ", "αεηιιιουυυω")


def parse_any_date(value):
    """Mirrors frontend's parseAnyDate() in Leads.jsx so backend reporting
    and the leads table sort consistently, despite Google Sheets exporting
    mixed date formats (DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, DD-GreekMonth-YYYY).
    """
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None

    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})(?:\s|$)", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), 2000 + int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    m = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            pass

    m = re.match(r"^(\d{1,2})[/\-](\S{3,})[/\-](\d{4})", s)
    if m:
        d, mon_raw, y = int(m.group(1)), m.group(2), int(m.group(3))
        mon_key = mon_raw.lower().translate(_GREEK_ACCENTS)
        mo = _GREEK_MONTHS.get(mon_key)
        if mo:
            try:
                return datetime(y, mo, d)
            except ValueError:
                pass

    return None

from database import get_db
from models import Lead, CallAttempt, ViberMessage, Case
from auth_utils import get_current_user

router = APIRouter(prefix="/leads", tags=["leads"], dependencies=[Depends(get_current_user)])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class LeadPatch(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    app_next_call: Optional[str] = None   # ISO date string or null
    sheet_comments: Optional[str] = None
    offer_sent: Optional[bool] = None
    offer_sent_date: Optional[str] = None
    offer_amount: Optional[str] = None
    success_fee: Optional[str] = None
    service_type: Optional[str] = None
    application_number: Optional[str] = None
    linked_case_id: Optional[int] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    taxisnet_username: Optional[str] = None
    taxisnet_password: Optional[str] = None
    spouse_name: Optional[str] = None
    taxisnet_username_2: Optional[str] = None
    taxisnet_password_2: Optional[str] = None
    total_debt: Optional[str] = None
    phone2: Optional[str] = None


class CommentAdd(BaseModel):
    text: str
    author: str


class CommentEdit(BaseModel):
    text: str


class ViberLeadRequest(BaseModel):
    message: str


class EmailLeadRequest(BaseModel):
    to: str
    subject: str
    body: str


class CallAttemptLog(BaseModel):
    answered: Optional[bool] = None
    duration_seconds: Optional[int] = None
    notes: str = ""


class BulkImportCall(BaseModel):
    lead_id: int
    consultant: str
    date: Optional[str] = None  # YYYY-MM-DD or timestamp
    answered: Optional[bool] = None
    duration_seconds: Optional[int] = None
    notes: str = ""


class BulkImportViber(BaseModel):
    lead_id: int
    consultant: str
    date: Optional[str] = None  # YYYY-MM-DD or timestamp
    message: str
    success: bool = True


class BulkImportRequest(BaseModel):
    calls: Optional[List[BulkImportCall]] = None
    vibers: Optional[List[BulkImportViber]] = None


# ── Helpers (copied from cases router) ───────────────────────────────────────

def _chatwoot_send(client_name: str, phone: str, message: str) -> tuple:
    cw_url = os.getenv("CHATWOOT_URL", "").strip().rstrip("/")
    cw_token = os.getenv("CHATWOOT_API_TOKEN", "").strip()
    cw_account = os.getenv("CHATWOOT_ACCOUNT_ID", "").strip()
    cw_inbox = os.getenv("CHATWOOT_INBOX_ID", "").strip()
    if not all([cw_url, cw_token, cw_account, cw_inbox]):
        return False, "Chatwoot env vars not set"

    import requests as _req
    hdrs = {"api_access_token": cw_token, "Content-Type": "application/json"}

    # Find existing contact by phone number first; only create if not found
    contact_id = None
    try:
        # Search for existing contact by phone number
        r = _req.get(f"{cw_url}/api/v1/accounts/{cw_account}/contacts/search",
                      headers=hdrs, params={"q": phone, "include_contacts": True}, timeout=10)
        if r.status_code == 200:
            items = r.json().get("payload", {})
            if isinstance(items, dict):
                items = items.get("contacts", [])
            if items:
                contact_id = items[0]["id"]

        # If not found, create a new contact
        if not contact_id:
            r = _req.post(f"{cw_url}/api/v1/accounts/{cw_account}/contacts",
                          headers=hdrs, json={"name": client_name, "phone_number": phone}, timeout=10)
            if r.status_code in (200, 201):
                body = r.json()
                contact_id = body.get("id") or body.get("data", {}).get("id") or None
    except Exception as e:
        return False, f"find_or_create_contact exception: {e}"

    if not contact_id:
        return False, f"Αδυναμία δημιουργίας/εύρεσης contact για αριθμό {phone}"

    # Create new conversation
    try:
        r = _req.post(f"{cw_url}/api/v1/accounts/{cw_account}/conversations",
                      headers=hdrs, json={"contact_id": contact_id, "inbox_id": int(cw_inbox)}, timeout=10)
        if r.status_code not in (200, 201):
            return False, f"create_conversation HTTP {r.status_code}"
        conv_id = r.json().get("id")
    except Exception as e:
        return False, f"create_conversation exception: {e}"

    # Post message
    try:
        r = _req.post(f"{cw_url}/api/v1/accounts/{cw_account}/conversations/{conv_id}/messages",
                      headers=hdrs,
                      json={"content": message, "message_type": "outgoing", "private": False},
                      timeout=10)
        if r.status_code not in (200, 201):
            return False, f"post_message HTTP {r.status_code}"
    except Exception as e:
        return False, f"post_message exception: {e}"

    return True, ""


def _chatwoot_send_with_retry(client_name: str, phone: str, message: str, max_attempts: int = 3) -> tuple:
    last_err = ""
    for attempt in range(1, max_attempts + 1):
        ok, err = _chatwoot_send(client_name, phone, message)
        if ok:
            return True, ""
        last_err = err
        is_retryable = (
            "timed out" in err.lower() or "timeout" in err.lower() or
            "connectionpool" in err.lower() or "αδυναμία" in err.lower()
        )
        if not is_retryable or attempt == max_attempts:
            break
        time.sleep(attempt * 3)
    return False, last_err


def _markup_to_html(text: str, logo_url: str = None) -> str:
    """Render our lightweight markup (**bold**, ▸ bullets, [c=#hex]color[/c], [btn]Label|URL[/btn]) as a styled HTML email."""
    import re as _re
    import html as _html
    btn_re = _re.compile(r'^\[btn\]([^|]+)\|([^\[]+)\[/btn\]$')

    escaped = _html.escape(text)
    escaped = _re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', escaped)
    escaped = _re.sub(r'\[c=(#[0-9a-fA-F]{3,6})\]([^\[]+)\[/c\]', r'<span style="color:\1">\2</span>', escaped)

    blocks = []
    for block in escaped.split('\n\n'):
        lines = [l for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        btn_match = btn_re.match(lines[0].strip()) if len(lines) == 1 else None
        if btn_match:
            label, url = btn_match.group(1).strip(), btn_match.group(2).strip()
            blocks.append(
                f'<div style="text-align:center;margin:24px 0;">'
                f'<a href="{url}" style="display:inline-block;background:#2563eb;color:#ffffff;'
                f'text-decoration:none;font-weight:bold;padding:14px 32px;border-radius:10px;font-size:15px;">'
                f'{label}</a></div>'
            )
        elif all(l.lstrip().startswith(('▸', '•', '-')) for l in lines):
            items = ''.join(f'<li style="margin:4px 0;">{l.lstrip()[1:].strip()}</li>' for l in lines)
            blocks.append(f'<ul style="margin:10px 0 16px;padding-left:18px;color:#1e293b;">{items}</ul>')
        else:
            blocks.append(f'<p style="margin:0 0 14px;line-height:1.65;">{"<br>".join(lines)}</p>')
    body_html = ''.join(blocks)
    logo_html = (
        f'<div style="text-align:center;background:#1e3a8a;padding:20px 18px;">'
        f'<img src="{logo_url}" alt="I MENTOR Consulting" style="max-width:240px;height:auto;border:0;display:inline-block;object-fit:contain;"/></div>'
    ) if logo_url else ''
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,0.06);overflow:hidden;">
{logo_html}
<div style="background:#ffffff;padding:28px 32px;font-size:15px;color:#1e293b;">
{body_html}
</div>
</div>
</body></html>"""


def _markup_strip(text: str) -> str:
    import re as _re
    text = _re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = _re.sub(r'\[c=#[0-9a-fA-F]{3,6}\]([^\[]+)\[/c\]', r'\1', text)
    text = _re.sub(r'\[btn\]([^|]+)\|([^\[]+)\[/btn\]', r'\1: \2', text)
    return text


def _send_gmail(to: str, subject: str, body: str, logo_url: str = None) -> tuple:
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    sender = os.getenv("SMTP_USER", "").strip()
    if not sa_json or not sender:
        return False, "GOOGLE_SERVICE_ACCOUNT_JSON ή SMTP_USER δεν έχουν οριστεί"
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        creds = Credentials.from_service_account_info(
            json.loads(sa_json),
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        ).with_subject(sender)
        svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to
        msg.attach(MIMEText(_markup_strip(body), "plain", "utf-8"))
        msg.attach(MIMEText(_markup_to_html(body, logo_url=logo_url), "html", "utf-8"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        svc.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True, ""
    except Exception as e:
        return False, str(e)


def _lead_to_dict(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "sheet_row_num": lead.sheet_row_num,
        "status": lead.status or "",
        "status_raw": lead.status_raw or "",
        "assigned_to": lead.assigned_to or "",
        "date": lead.date or "",
        "month_sheet": getattr(lead, "month_sheet", "") or "",
        "name": lead.name or "",
        "sheet_comments": lead.sheet_comments or "",
        "next_call_sheet": lead.next_call_sheet or "",
        "total_debt": lead.total_debt or "",
        "phone": lead.phone or "",
        "phone2": getattr(lead, "phone2", "") or "",
        "email": lead.email or "",
        "offer_sent": lead.offer_sent or False,
        "offer_sent_date": lead.offer_sent_date or "",
        "offer_amount": lead.offer_amount or "",
        "success_fee": lead.success_fee or "",
        "vulnerable_debtor": lead.vulnerable_debtor or False,
        "referrer": lead.referrer or "",
        "service_type": lead.service_type or "",
        "application_number": lead.application_number or "",
        "viber_info": lead.viber_info or "",
        "platform_result": getattr(lead, "platform_result", "") or "",
        "extra_fields": getattr(lead, "extra_fields", {}) or {},
        "app_comments": lead.app_comments or [],
        "app_next_call": lead.app_next_call.isoformat() if lead.app_next_call else None,
        "linked_case_id": lead.linked_case_id,
        "taxisnet_username": getattr(lead, "taxisnet_username", "") or "",
        "taxisnet_password": getattr(lead, "taxisnet_password", "") or "",
        "spouse_name": getattr(lead, "spouse_name", "") or "",
        "taxisnet_username_2": getattr(lead, "taxisnet_username_2", "") or "",
        "taxisnet_password_2": getattr(lead, "taxisnet_password_2", "") or "",
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


class LeadCreate(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    status: Optional[str] = ""
    assigned_to: Optional[str] = ""
    date: Optional[str] = ""
    total_debt: Optional[str] = ""
    sheet_comments: Optional[str] = ""
    service_type: Optional[str] = ""
    referrer: Optional[str] = ""
    application_number: Optional[str] = ""
    offer_amount: Optional[str] = ""
    success_fee: Optional[str] = ""
    send_themis: Optional[bool] = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create")
def create_lead(data: LeadCreate, db: Session = Depends(get_db)):
    """Manually create a new lead (not from Google Sheets)."""
    from sheets_sync import _normalize_status
    lead = Lead(
        sheet_row_num=None,
        name=data.name or "",
        phone=(data.phone or "").strip(),
        email=data.email or "",
        status=_normalize_status(data.status or ""),
        status_raw=data.status or "",
        assigned_to=data.assigned_to or "",
        date=data.date or "",
        total_debt=data.total_debt or "",
        sheet_comments=data.sheet_comments or "",
        service_type=data.service_type or "",
        referrer=data.referrer or "",
        application_number=data.application_number or "",
        offer_amount=data.offer_amount or "",
        success_fee=data.success_fee or "",
        extra_fields={},
        app_comments=[],
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    if data.send_themis:
        try:
            from themis_ai import send_themis_link
            send_themis_link(lead)
        except Exception:
            pass

    return _lead_to_dict(lead)


@router.get("/")
def list_leads(
    search: Optional[str] = None,
    status: Optional[List[str]] = Query(default=None),
    assigned_to: Optional[List[str]] = Query(default=None),
    years: Optional[List[str]] = Query(default=None),
    has_next_call: Optional[bool] = None,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    max_years: int = 3,
    db: Session = Depends(get_db),
):
    q = db.query(Lead)

    # Limit to last N years by sync date for performance (unless years are explicitly specified)
    if not years:
        cutoff = _now() - timedelta(days=365 * max_years)
        q = q.filter(Lead.created_at >= cutoff)

    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            Lead.name.ilike(term),
            Lead.phone.ilike(term),
            Lead.phone2.ilike(term),
            Lead.email.ilike(term),
            Lead.sheet_comments.ilike(term),
            cast(Lead.app_comments, String).ilike(term),
            Lead.total_debt.ilike(term),
            Lead.referrer.ilike(term),
            Lead.application_number.ilike(term),
        ))
    if status:
        normalized = [s.upper() for s in status]
        q = q.filter(Lead.status.in_(normalized))
    if assigned_to:
        q = q.filter(Lead.assigned_to.in_(assigned_to))
    if years:
        year_filters = [Lead.date.ilike(f"%{y}%") for y in years]
        q = q.filter(or_(*year_filters))
    if has_next_call is True:
        q = q.filter(Lead.app_next_call != None)

    # Newest first (highest sheet row = most recent entry)
    leads = q.order_by(Lead.sheet_row_num.desc().nullslast(), Lead.id.desc()).all()

    # Date range filtering (on Lead.date sheet field, not created_at)
    if date_from or date_to:
        from_date = parse_any_date(date_from) if date_from else None
        to_date = parse_any_date(date_to) if date_to else None

        filtered = []
        for lead in leads:
            if lead.date:
                lead_date = parse_any_date(lead.date)
                if lead_date:
                    if from_date and lead_date < from_date:
                        continue
                    if to_date:
                        # Include entire end date
                        to_date_end = to_date + timedelta(days=1)
                        if lead_date >= to_date_end:
                            continue
                    filtered.append(lead)
            elif not (from_date or to_date):
                # Keep leads with no date only if no date filter
                filtered.append(lead)
        leads = filtered

    return [_lead_to_dict(l) for l in leads]


@router.post("/sync")
def sync_from_sheets(full: bool = False, db: Session = Depends(get_db)):
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise HTTPException(status_code=503, detail="GOOGLE_SHEET_ID not configured")
    try:
        from sheets_sync import sync_leads
        result = sync_leads(db, full=full)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sheet-headers")
def sheet_headers():
    """Debug: returns raw sheet headers and their field mapping (now reads up to 78 cols)."""
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise HTTPException(status_code=503, detail="GOOGLE_SHEET_ID not configured")
    try:
        from sheets_sync import fetch_raw_headers
        return fetch_raw_headers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/normalize-statuses")
def normalize_statuses(db: Session = Depends(get_db)):
    """Fix existing leads where status wasn't normalized (e.g. CANCEL-INTEREST → cancelled)."""
    try:
        from sheets_sync import normalize_all_statuses
        return normalize_all_statuses(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug-duplicates")
def debug_duplicates(db: Session = Depends(get_db)):
    """AUDIT ONLY - List duplicate leads without deleting.
    Shows which leads are duplicated and what differs between them."""
    from sqlalchemy import func

    duplicates_info = []

    # Find all sheet_row_num values that appear more than once
    dup_rows = db.query(
        Lead.sheet_row_num,
        func.count().label('cnt')
    ).filter(
        Lead.sheet_row_num != None
    ).group_by(Lead.sheet_row_num).having(
        func.count() > 1
    ).all()

    for sheet_row_num, cnt in dup_rows:
        leads = db.query(Lead).filter(
            Lead.sheet_row_num == sheet_row_num
        ).order_by(Lead.id.asc()).all()

        # Check what differs between duplicates
        differences = []
        first = leads[0]
        for i, lead in enumerate(leads[1:], start=1):
            diffs = {}
            if lead.status != first.status:
                diffs['status'] = f"{first.status} vs {lead.status}"
            if lead.assigned_to != first.assigned_to:
                diffs['assigned_to'] = f"{first.assigned_to} vs {lead.assigned_to}"
            if lead.app_comments != first.app_comments:
                diffs['app_comments'] = "differs"
            if lead.app_next_call != first.app_next_call:
                diffs['app_next_call'] = "differs"
            differences.append({'duplicate_id': lead.id, 'differences': diffs})

        duplicates_info.append({
            'sheet_row_num': sheet_row_num,
            'lead_name': first.name,
            'count': cnt,
            'ids': [l.id for l in leads],
            'duplicates_with_changes': differences
        })

    return {
        'ok': True,
        'total_duplicate_groups': len(duplicates_info),
        'details': duplicates_info
    }


@router.post("/cleanup-duplicates")
def cleanup_duplicates(db: Session = Depends(get_db)):
    """Remove duplicate leads created by concurrent webhook syncs.
    Keeps the first occurrence of each sheet_row_num, deletes duplicates.

    WARNING: This is irreversible. Run /debug-duplicates first to audit."""
    try:
        from sheets_sync import cleanup_duplicate_leads
        return cleanup_duplicate_leads(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reporting")
def get_reporting(db: Session = Depends(get_db)):
    from collections import defaultdict
    try:
        leads = db.query(Lead).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    AGENTS = ["STELLA", "VALLIA", "SOFIA"]

    events = []
    for lead in leads:
        for c in (lead.app_comments or []):
            at_str = c.get("at")
            author = c.get("author", "")
            if at_str and author and author not in ("system",):
                try:
                    at = datetime.fromisoformat(at_str.split(".")[0])  # strip microseconds
                    events.append({"at": at, "author": author.upper()})
                except Exception:
                    pass

    daily: dict = defaultdict(lambda: defaultdict(int))
    weekly: dict = defaultdict(lambda: defaultdict(int))
    monthly: dict = defaultdict(lambda: defaultdict(int))
    hourly: dict = defaultdict(int)

    for ev in events:
        day_key = ev["at"].strftime("%Y-%m-%d")
        week_key = ev["at"].strftime("%G-W%V")
        month_key = ev["at"].strftime("%Y-%m")
        hour = ev["at"].hour
        author = ev["author"]
        daily[day_key][author] += 1
        weekly[week_key][author] += 1
        monthly[month_key][author] += 1
        hourly[hour] += 1

    return {
        "daily": [{"date": k, **{a: v.get(a, 0) for a in AGENTS}} for k, v in sorted(daily.items())[-90:]],
        "weekly": [{"week": k, **{a: v.get(a, 0) for a in AGENTS}} for k, v in sorted(weekly.items())[-26:]],
        "monthly": [{"month": k, **{a: v.get(a, 0) for a in AGENTS}} for k, v in sorted(monthly.items())[-12:]],
        "hourly": [{"hour": f"{h}:00", "count": hourly.get(h, 0)} for h in range(8, 17)],
        "total_comments": len(events),
        "total_leads": len(leads),
        "deals": sum(1 for l in leads if l.status == "DEAL"),
        "active": sum(1 for l in leads if l.status == "ACTIVE"),
        "hot": sum(1 for l in leads if l.status == "HOT"),
        "cancelled": sum(1 for l in leads if l.status == "CANCEL"),
    }


@router.get("/conversion")
def get_conversion(db: Session = Depends(get_db)):
    """Conversion stats: leads → DEAL per month, per referrer, and per consultant.
    Uses Lead.date (the sheet date field) as the lead creation date.
    Only leads with a parseable date are included in time-bucketed stats.
    """
    from collections import defaultdict

    try:
        leads = db.query(Lead).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    def _month(lead):
        d = parse_any_date(lead.date) if lead.date else None
        if not d:
            d = lead.created_at
        if not d:
            return None
        return d.strftime("%Y-%m")

    def _is_deal(lead):
        return (lead.status or "").upper() == "DEAL"

    # ---------- per month ----------
    month_total: dict = defaultdict(int)
    month_deal: dict = defaultdict(int)
    for l in leads:
        m = _month(l)
        if not m:
            continue
        month_total[m] += 1
        if _is_deal(l):
            month_deal[m] += 1

    by_month = []
    for m in sorted(month_total):
        total = month_total[m]
        deals = month_deal[m]
        by_month.append({
            "month": m,
            "total": total,
            "deals": deals,
            "rate": round(deals / total * 100, 1) if total else 0,
        })

    # ---------- per referrer ----------
    ref_total: dict = defaultdict(int)
    ref_deal: dict = defaultdict(int)
    for l in leads:
        ref = (l.referrer or "").strip() or "—"
        ref_total[ref] += 1
        if _is_deal(l):
            ref_deal[ref] += 1

    by_referrer = sorted(
        [
            {"referrer": r, "total": ref_total[r], "deals": ref_deal[r],
             "rate": round(ref_deal[r] / ref_total[r] * 100, 1) if ref_total[r] else 0}
            for r in ref_total
        ],
        key=lambda x: -x["total"],
    )

    # ---------- per consultant ----------
    cons_total: dict = defaultdict(int)
    cons_deal: dict = defaultdict(int)
    for l in leads:
        c = (l.assigned_to or "").strip().upper() or "—"
        cons_total[c] += 1
        if _is_deal(l):
            cons_deal[c] += 1

    by_consultant = sorted(
        [
            {"consultant": c, "total": cons_total[c], "deals": cons_deal[c],
             "rate": round(cons_deal[c] / cons_total[c] * 100, 1) if cons_total[c] else 0}
            for c in cons_total
        ],
        key=lambda x: -x["total"],
    )

    total_all = len(leads)
    deal_all = sum(1 for l in leads if _is_deal(l))
    return {
        "total": total_all,
        "deals": deal_all,
        "overall_rate": round(deal_all / total_all * 100, 1) if total_all else 0,
        "by_month": by_month,
        "by_referrer": by_referrer,
        "by_consultant": by_consultant,
    }


@router.get("/daily-volume")
def get_daily_volume(db: Session = Depends(get_db)):
    """Αριθμός leads ανά ημέρα (βάσει του πεδίου date/ΗΜΕΡΟΜΗΝΙΑ), με ανάλυση
    σε status & σύμβουλο. Τροφοδοτεί το report (γράφημα + πίνακας) στη σελίδα
    Reporting.
    """
    from collections import defaultdict

    try:
        leads = db.query(Lead).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    by_day_status: dict = defaultdict(lambda: defaultdict(int))
    by_day_agent: dict = defaultdict(lambda: defaultdict(int))
    day_totals: dict = defaultdict(int)
    statuses_seen, agents_seen = set(), set()
    unparsed = 0

    for lead in leads:
        d = parse_any_date(lead.date)
        if not d:
            unparsed += 1
            continue
        day_key = d.strftime("%Y-%m-%d")
        status = (lead.status or "χωρίς status").strip() or "χωρίς status"
        agent = (lead.assigned_to or "χωρίς σύμβουλο").strip().upper() or "ΧΩΡΙΣ ΣΥΜΒΟΥΛΟ"

        day_totals[day_key] += 1
        by_day_status[day_key][status] += 1
        by_day_agent[day_key][agent] += 1
        statuses_seen.add(status)
        agents_seen.add(agent)

    days_sorted = sorted(day_totals.keys())
    statuses_sorted = sorted(statuses_seen)
    agents_sorted = sorted(agents_seen)

    return {
        "daily_total": [{"date": d, "total": day_totals[d]} for d in days_sorted],
        "daily_by_status": [
            {"date": d, **{s: by_day_status[d].get(s, 0) for s in statuses_sorted}}
            for d in days_sorted
        ],
        "daily_by_agent": [
            {"date": d, **{a: by_day_agent[d].get(a, 0) for a in agents_sorted}}
            for d in days_sorted
        ],
        "statuses": statuses_sorted,
        "agents": agents_sorted,
        "total_leads_with_date": sum(day_totals.values()),
        "total_leads_unparsed_date": unparsed,
    }


@router.get("/debug-raw")
def debug_raw_leads(db: Session = Depends(get_db)):
    """DEBUG ONLY: Return raw leads data to verify fetching works."""
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"[debug-raw] Starting query...")
    logger.info(f"[debug-raw] Database session: {db}")

    leads = db.query(Lead).all()
    logger.info(f"[debug-raw] Query completed. Total leads in DB: {len(leads)}")

    if len(leads) == 0:
        logger.warning(f"[debug-raw] WARNING: No leads found in database!")
    else:
        logger.info(f"[debug-raw] Found leads. First 3: {[{'id': l.id, 'name': l.name, 'assigned_to': l.assigned_to} for l in leads[:3]]}")

    # Group by assigned_to
    by_assigned = {}
    sample_leads = []

    for lead in leads:
        assigned = (lead.assigned_to or "").strip().upper() or "EMPTY"
        by_assigned[assigned] = by_assigned.get(assigned, 0) + 1

        if len(sample_leads) < 10:
            sample_leads.append({
                'id': lead.id,
                'name': lead.name or '',
                'assigned_to': lead.assigned_to or '',
                'date': lead.date or '',
                'status': lead.status or '',
            })

    logger.info(f"[debug-raw] By assigned_to: {by_assigned}")
    logger.info(f"[debug-raw] Sample leads: {sample_leads}")

    return {
        'total_leads': len(leads),
        'by_assigned_to': by_assigned,
        'sample_leads': sample_leads,
        'error': None
    }


@router.get("/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _lead_to_dict(lead)


@router.patch("/{lead_id}")
def patch_lead(lead_id: int, data: LeadPatch, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if data.status is not None:
        from sheets_sync import _normalize_status
        lead.status = _normalize_status(data.status)
        lead.status_raw = data.status  # keep what user typed
    if data.assigned_to is not None:
        lead.assigned_to = data.assigned_to
    if data.sheet_comments is not None:
        lead.sheet_comments = data.sheet_comments
    if data.offer_sent is not None:
        lead.offer_sent = data.offer_sent
    if data.offer_sent_date is not None:
        lead.offer_sent_date = data.offer_sent_date
    if data.offer_amount is not None:
        lead.offer_amount = data.offer_amount
    if data.success_fee is not None:
        lead.success_fee = data.success_fee
    if data.service_type is not None:
        lead.service_type = data.service_type
    if data.application_number is not None:
        lead.application_number = data.application_number
    if data.linked_case_id is not None:
        lead.linked_case_id = data.linked_case_id
    if data.name is not None:
        lead.name = data.name
    if data.phone is not None:
        lead.phone = data.phone
    if data.email is not None:
        lead.email = data.email
    if data.taxisnet_username is not None:
        lead.taxisnet_username = data.taxisnet_username
    if data.taxisnet_password is not None:
        lead.taxisnet_password = data.taxisnet_password
    if data.spouse_name is not None:
        lead.spouse_name = data.spouse_name
    if data.taxisnet_username_2 is not None:
        lead.taxisnet_username_2 = data.taxisnet_username_2
    if data.taxisnet_password_2 is not None:
        lead.taxisnet_password_2 = data.taxisnet_password_2
    if data.total_debt is not None:
        lead.total_debt = data.total_debt
    if data.phone2 is not None:
        lead.phone2 = data.phone2
    if data.app_next_call is not None:
        if data.app_next_call == "":
            lead.app_next_call = None
        else:
            try:
                lead.app_next_call = datetime.fromisoformat(data.app_next_call)
            except Exception:
                pass
    elif hasattr(data, 'app_next_call') and data.app_next_call == "":
        lead.app_next_call = None

    lead.updated_at = _now()
    db.commit()
    return _lead_to_dict(lead)


@router.post("/{lead_id}/comment")
def add_comment(lead_id: int, data: CommentAdd, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    comments = list(lead.app_comments or [])
    comments.append({
        "text": data.text,
        "author": data.author,
        "at": _now().isoformat(),
    })
    lead.app_comments = comments
    lead.updated_at = _now()
    db.commit()
    return _lead_to_dict(lead)


@router.patch("/{lead_id}/comment/{idx}")
def edit_comment(lead_id: int, idx: int, data: CommentEdit, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    comments = list(lead.app_comments or [])
    if 0 <= idx < len(comments):
        comments[idx] = {**comments[idx], "text": data.text, "edited_at": _now().isoformat()}
        lead.app_comments = comments
        lead.updated_at = _now()
        db.commit()
    return _lead_to_dict(lead)


@router.delete("/{lead_id}/comment/{idx}")
def delete_comment(lead_id: int, idx: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    comments = list(lead.app_comments or [])
    if 0 <= idx < len(comments):
        comments.pop(idx)
        lead.app_comments = comments
        lead.updated_at = _now()
        db.commit()
    return _lead_to_dict(lead)


@router.post("/{lead_id}/call-attempt")
def log_call_attempt(lead_id: int, data: CallAttemptLog, db: Session = Depends(get_db)):
    """Log a phone call attempt on a lead."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Create CallAttempt record
    call = CallAttempt(
        lead_id=lead_id,
        consultant=(lead.assigned_to or "").strip().upper(),
        answered=data.answered,
        duration_seconds=data.duration_seconds,
        notes=data.notes,
    )
    db.add(call)
    db.commit()
    db.refresh(call)

    return {
        "ok": True,
        "call_id": call.id,
        "created_at": call.created_at.isoformat(),
    }


@router.post("/{lead_id}/send-viber")
def send_viber(lead_id: int, data: ViberLeadRequest, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    phone = (lead.phone or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Δεν υπάρχει τηλέφωνο")

    ok, err = _chatwoot_send_with_retry(lead.name or "Lead", phone, data.message)
    if not ok:
        raise HTTPException(status_code=502, detail=f"Viber: {err}")

    # Log in app_comments
    comments = list(lead.app_comments or [])
    comments.append({"text": f"📱 Viber εστάλη: {data.message[:80]}…" if len(data.message) > 80 else f"📱 Viber εστάλη: {data.message}", "author": "system", "at": _now().isoformat()})
    lead.app_comments = comments
    lead.updated_at = _now()

    # Log in viber_messages table for analytics
    viber = ViberMessage(
        lead_id=lead_id,
        consultant=(lead.assigned_to or "").strip().upper(),
        message=data.message,
        success=True,
        error=""
    )
    db.add(viber)
    db.commit()
    return {"ok": True}


@router.post("/{lead_id}/send-email")
def send_email(lead_id: int, data: EmailLeadRequest, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    to = data.to or (lead.email or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Δεν υπάρχει email")

    ok, err = _send_gmail(to, data.subject, data.body)
    if not ok:
        raise HTTPException(status_code=502, detail=f"Email: {err}")

    comments = list(lead.app_comments or [])
    comments.append({"text": f"✉️ Email εστάλη: {data.subject}", "author": "system", "at": _now().isoformat()})
    lead.app_comments = comments
    lead.updated_at = _now()
    db.commit()
    return {"ok": True}


@router.get("/test-simple")
def test_simple():
    """Simple test endpoint."""
    return {"status": "OK", "message": "Test endpoint works"}


@router.get("/count-by-consultant")
def count_leads_by_consultant(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Count leads by consultant with optional date range filtering."""
    from collections import defaultdict
    import logging

    logger = logging.getLogger(__name__)

    # Parse date filters if provided (expect YYYY-MM-DD format or ISO format)
    from_boundary = None
    to_boundary = None
    if date_from:
        try:
            # Try ISO format first (with Z)
            if 'T' in date_from:
                from_boundary = datetime.fromisoformat(date_from.replace('Z', '+00:00')).replace(tzinfo=None)
            else:
                # YYYY-MM-DD format
                from_boundary = datetime.strptime(date_from, "%Y-%m-%d")
        except (ValueError, TypeError):
            logger.warning(f"Failed to parse date_from: {date_from}")

    if date_to:
        try:
            # Try ISO format first (with Z)
            if 'T' in date_to:
                to_boundary = datetime.fromisoformat(date_to.replace('Z', '+00:00')).replace(tzinfo=None)
            else:
                # YYYY-MM-DD format
                to_boundary = datetime.strptime(date_to, "%Y-%m-%d")
        except (ValueError, TypeError):
            logger.warning(f"Failed to parse date_to: {date_to}")

    # Build query with optional date filtering
    query = db.query(Lead)
    if from_boundary:
        query = query.filter(Lead.created_at >= from_boundary)
    if to_boundary:
        # Add 1 day to include the entire end date
        to_boundary_plus_one = to_boundary + timedelta(days=1)
        query = query.filter(Lead.created_at < to_boundary_plus_one)

    leads = query.all()
    logger.info(f"[count] Total leads (filtered): {len(leads)}, from={from_boundary}, to={to_boundary}")

    by_agent = defaultdict(int)

    for lead in leads:
        # Get agent name - THIS is what matters
        agent = (lead.assigned_to or "").strip().upper()
        if not agent:
            agent = "NO_ASSIGNMENT"

        by_agent[agent] += 1

    result = dict(by_agent) if by_agent else {}
    logger.info(f"[count] Final result: {result}")

    return result


@router.get("/calls/stats-by-consultant")
def get_calls_by_consultant(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get call attempt statistics by consultant with optional date filtering."""
    from collections import defaultdict
    from datetime import datetime as dt

    calls = db.query(CallAttempt).all()

    # Parse date boundaries
    from_boundary = None
    to_boundary = None
    if date_from:
        try:
            from_boundary = dt.strptime(date_from, "%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    if date_to:
        try:
            to_boundary = dt.strptime(date_to, "%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    # Aggregate by consultant
    stats = defaultdict(lambda: {
        "total_calls": 0,
        "answered": 0,
        "unanswered": 0,
        "unknown": 0,
        "total_duration": 0,
    })

    for call in calls:
        # Filter by date range
        if from_boundary and call.created_at.date() < from_boundary.date():
            continue
        if to_boundary:
            to_end = to_boundary.replace(hour=23, minute=59, second=59)
            if call.created_at > to_end:
                continue

        consultant = call.consultant or "UNKNOWN"
        stats[consultant]["total_calls"] += 1

        if call.answered is True:
            stats[consultant]["answered"] += 1
        elif call.answered is False:
            stats[consultant]["unanswered"] += 1
        else:
            stats[consultant]["unknown"] += 1

        if call.duration_seconds:
            stats[consultant]["total_duration"] += call.duration_seconds

    # Add calculated fields
    result = {}
    for consultant, data in stats.items():
        avg_duration = (
            data["total_duration"] / data["total_calls"]
            if data["total_calls"] > 0
            else 0
        )
        result[consultant] = {
            **data,
            "avg_duration_seconds": round(avg_duration, 1),
        }

    return result


@router.get("/debug/case-linking")
def debug_case_linking(db: Session = Depends(get_db)):
    """Debug endpoint to check case linking issues."""
    from collections import Counter

    leads = db.query(Lead).all()
    cases = db.query(Case).all()

    # Count leads by linked_case_id
    linked_case_ids = [lead.linked_case_id for lead in leads if lead.linked_case_id]
    case_ids = set(c.id for c in cases)

    orphaned = [cid for cid in linked_case_ids if cid not in case_ids]
    valid = [cid for cid in linked_case_ids if cid in case_ids]

    return {
        "total_leads": len(leads),
        "leads_with_linked_case_id": len(linked_case_ids),
        "total_cases": len(cases),
        "case_ids": list(case_ids)[:20],  # First 20 case IDs
        "valid_linked_cases": len(valid),
        "orphaned_linked_cases": len(orphaned),
        "orphaned_case_ids": orphaned[:20],  # First 20 orphaned IDs
        "case_id_frequency": dict(Counter(linked_case_ids).most_common(10))  # Which cases have most leads
    }


@router.get("/viber/stats-by-consultant")
def get_viber_stats_by_consultant(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get Viber message statistics by consultant with optional date filtering."""
    from collections import defaultdict
    from datetime import datetime as dt

    messages = db.query(ViberMessage).all()

    # Parse date boundaries
    from_boundary = None
    to_boundary = None
    if date_from:
        try:
            from_boundary = dt.strptime(date_from, "%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    if date_to:
        try:
            to_boundary = dt.strptime(date_to, "%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    # Aggregate by consultant
    stats = defaultdict(lambda: {
        "total_sent": 0,
        "successful": 0,
        "failed": 0,
    })

    for msg in messages:
        # Filter by date range
        if from_boundary and msg.created_at.date() < from_boundary.date():
            continue
        if to_boundary:
            to_end = to_boundary.replace(hour=23, minute=59, second=59)
            if msg.created_at > to_end:
                continue

        consultant = msg.consultant or "UNKNOWN"
        stats[consultant]["total_sent"] += 1

        if msg.success:
            stats[consultant]["successful"] += 1
        else:
            stats[consultant]["failed"] += 1

    return dict(stats)


@router.get("/performance/consultant-metrics")
def get_consultant_performance_metrics(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Comprehensive performance metrics for each consultant including:
    - Lead counts by status
    - Conversion rates (CALL→HOT, HOT→CASE, CALL→CASE)
    - Effort metrics (calls, viber messages)
    - Case conversion metrics
    """
    from collections import defaultdict
    from datetime import datetime as dt

    # Parse date boundaries first
    from_boundary = None
    to_boundary = None
    if date_from:
        try:
            from_boundary = dt.strptime(date_from, "%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    if date_to:
        try:
            to_boundary = dt.strptime(date_to, "%Y-%m-%d")
            # Extend to_boundary to end of day
            to_boundary = to_boundary.replace(hour=23, minute=59, second=59)
        except (ValueError, TypeError):
            pass

    # Build queries with date filtering at database level (for DateTime fields only)
    # Leads use string dates in mixed formats, so we'll filter those in the loop
    leads = db.query(Lead).all()

    cases_query = db.query(Case)
    calls_query = db.query(CallAttempt)
    vibersall_query = db.query(ViberMessage)

    # Apply date filtering to DateTime-based queries
    if from_boundary:
        cases_query = cases_query.filter(Case.created_at >= from_boundary)
        calls_query = calls_query.filter(CallAttempt.created_at >= from_boundary)
        vibersall_query = vibersall_query.filter(ViberMessage.created_at >= from_boundary)

    if to_boundary:
        cases_query = cases_query.filter(Case.created_at <= to_boundary)
        calls_query = calls_query.filter(CallAttempt.created_at <= to_boundary)
        vibersall_query = vibersall_query.filter(ViberMessage.created_at <= to_boundary)

    cases = cases_query.all()
    calls = calls_query.all()
    vibersall = vibersall_query.all()

    # Initialize metrics per consultant
    metrics = defaultdict(lambda: {
        "consultant": "",
        "total_leads": 0,
        "leads_by_status": defaultdict(int),
        "cases_total": 0,
        "cases_paying": 0,
        "calls_total": 0,
        "calls_answered": 0,
        "vibers_total": 0,
        "leads_with_cases": 0,  # HOT or CASE status
        "conversion_rate_to_case": 0,  # leads that became cases
    })

    # Get existing case IDs to avoid counting orphaned lead->case links
    existing_case_ids = set(c.id for c in cases)

    # Process leads (with date filtering for string date field)
    for lead in leads:
        d = parse_any_date(lead.date)
        if not d:
            continue

        # Filter by date range
        if from_boundary and d.date() < from_boundary.date():
            continue
        if to_boundary and d.date() > to_boundary.date():
            continue

        consultant = (lead.assigned_to or "").strip().upper() or "UNKNOWN"
        m = metrics[consultant]
        m["consultant"] = consultant
        m["total_leads"] += 1
        status = (lead.status or "").upper() or "UNKNOWN"
        m["leads_by_status"][status] += 1

        # If lead has a linked case that actually exists, it became a case
        if lead.linked_case_id and lead.linked_case_id in existing_case_ids:
            m["leads_with_cases"] += 1

    # Process cases
    for case in cases:
        consultant = (case.employee or "").strip().upper() or "UNKNOWN"
        if consultant not in metrics:
            metrics[consultant] = {
                "consultant": consultant,
                "total_leads": 0,
                "leads_by_status": defaultdict(int),
                "cases_total": 0,
                "cases_paying": 0,
                "calls_total": 0,
                "calls_answered": 0,
                "vibers_total": 0,
                "leads_with_cases": 0,
            }
        metrics[consultant]["cases_total"] += 1
        if case.status == "completed":
            metrics[consultant]["cases_paying"] += 1

    # Process calls
    for call in calls:
        consultant = (call.consultant or "").strip().upper() or "UNKNOWN"
        if consultant not in metrics:
            metrics[consultant] = {
                "consultant": consultant,
                "total_leads": 0,
                "leads_by_status": defaultdict(int),
                "cases_total": 0,
                "cases_paying": 0,
                "calls_total": 0,
                "calls_answered": 0,
                "vibers_total": 0,
                "leads_with_cases": 0,
            }
        metrics[consultant]["calls_total"] += 1
        if call.answered is True:
            metrics[consultant]["calls_answered"] += 1

    # Process vibersall
    for viber in vibersall:
        consultant = (viber.consultant or "").strip().upper() or "UNKNOWN"
        if consultant not in metrics:
            metrics[consultant] = {
                "consultant": consultant,
                "total_leads": 0,
                "leads_by_status": defaultdict(int),
                "cases_total": 0,
                "cases_paying": 0,
                "calls_total": 0,
                "calls_answered": 0,
                "vibers_total": 0,
                "leads_with_cases": 0,
            }
        metrics[consultant]["vibers_total"] += 1

    # Calculate conversion rates
    result = {}
    for consultant, m in metrics.items():
        total = m["total_leads"]
        leads_to_hot = m["leads_by_status"].get("HOT", 0)
        leads_to_deal = m["leads_by_status"].get("DEAL", 0)  # Use actual DEAL status count
        leads_to_cancel = m["leads_by_status"].get("CANCEL", 0)

        result[consultant] = {
            "consultant": consultant,
            "total_leads": total,
            "by_status": dict(m["leads_by_status"]),
            "cases_total": m["cases_total"],
            "cases_paying": m["cases_paying"],
            # Lead to hot conversion (% of total)
            "conversion_rate_to_hot": round(leads_to_hot / total * 100, 1) if total > 0 else 0,
            # Lead to deal conversion (% of total)
            "conversion_rate_to_case": round(leads_to_deal / total * 100, 1) if total > 0 else 0,
            # Hot to deal conversion (% of HOT)
            "conversion_hot_to_case": round(leads_to_deal / leads_to_hot * 100, 1) if leads_to_hot > 0 else 0,
            # Cancel rate
            "cancel_rate": round(leads_to_cancel / total * 100, 1) if total > 0 else 0,
            # Effort metrics
            "vibers_total": m["vibers_total"],
            "vibers_per_lead": round(m["vibers_total"] / total, 2) if total > 0 else 0,
        }

    return result


@router.post("/admin/import-bulk")
def bulk_import_calls_and_vibers(
    data: BulkImportRequest,
    db: Session = Depends(get_db)
):
    """Bulk import historical call attempts and viber messages for backfilling data."""
    from datetime import datetime as dt

    stats = {
        "calls_imported": 0,
        "calls_failed": 0,
        "vibers_imported": 0,
        "vibers_failed": 0,
        "errors": []
    }

    # Import calls
    if data.calls:
        for i, call_data in enumerate(data.calls):
            try:
                # Parse date if provided
                call_date = None
                if call_data.date:
                    try:
                        # Try YYYY-MM-DD first
                        if len(call_data.date) == 10:
                            call_date = dt.strptime(call_data.date, "%Y-%m-%d").replace(tzinfo=None)
                        else:
                            # Try ISO format
                            call_date = dt.fromisoformat(call_data.date.replace('Z', '+00:00')).replace(tzinfo=None)
                    except:
                        call_date = _now()
                else:
                    call_date = _now()

                call = CallAttempt(
                    lead_id=call_data.lead_id,
                    consultant=call_data.consultant.strip().upper(),
                    answered=call_data.answered,
                    duration_seconds=call_data.duration_seconds,
                    notes=call_data.notes,
                    created_at=call_date
                )
                db.add(call)
                stats["calls_imported"] += 1
            except Exception as e:
                stats["calls_failed"] += 1
                stats["errors"].append(f"Call {i}: {str(e)}")

    # Import vibers
    if data.vibers:
        for i, viber_data in enumerate(data.vibers):
            try:
                # Parse date if provided
                viber_date = None
                if viber_data.date:
                    try:
                        if len(viber_data.date) == 10:
                            viber_date = dt.strptime(viber_data.date, "%Y-%m-%d").replace(tzinfo=None)
                        else:
                            viber_date = dt.fromisoformat(viber_data.date.replace('Z', '+00:00')).replace(tzinfo=None)
                    except:
                        viber_date = _now()
                else:
                    viber_date = _now()

                viber = ViberMessage(
                    lead_id=viber_data.lead_id,
                    consultant=viber_data.consultant.strip().upper(),
                    message=viber_data.message,
                    success=viber_data.success,
                    created_at=viber_date
                )
                db.add(viber)
                stats["vibers_imported"] += 1
            except Exception as e:
                stats["vibers_failed"] += 1
                stats["errors"].append(f"Viber {i}: {str(e)}")

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        stats["errors"].append(f"Database commit failed: {str(e)}")
        return {"ok": False, "stats": stats}

    return {"ok": True, "stats": stats}
