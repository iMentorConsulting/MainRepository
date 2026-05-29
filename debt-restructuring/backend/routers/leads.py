from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
import os, json, base64, time

from database import get_db
from models import Lead

router = APIRouter(prefix="/leads", tags=["leads"])

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


class CommentAdd(BaseModel):
    text: str
    author: str


class ViberLeadRequest(BaseModel):
    message: str


class EmailLeadRequest(BaseModel):
    to: str
    subject: str
    body: str


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

    # Find or create contact
    contact_id = None
    try:
        r = _req.post(f"{cw_url}/api/v1/accounts/{cw_account}/contacts",
                      headers=hdrs, json={"name": client_name, "phone_number": phone}, timeout=10)
        if r.status_code in (200, 201):
            contact_id = r.json().get("id")
        elif r.status_code == 422:
            time.sleep(2)
            r2 = _req.get(f"{cw_url}/api/v1/accounts/{cw_account}/contacts/search",
                          headers=hdrs, params={"q": phone, "include_contacts": True}, timeout=10)
            if r2.status_code == 200:
                items = r2.json().get("payload", {})
                if isinstance(items, dict):
                    items = items.get("contacts", [])
                if items:
                    contact_id = items[0]["id"]
    except Exception as e:
        return False, f"create_contact exception: {e}"

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


def _send_gmail(to: str, subject: str, body: str) -> tuple:
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
        msg.attach(MIMEText(body, "plain", "utf-8"))
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
        "assigned_to": lead.assigned_to or "",
        "date": lead.date or "",
        "name": lead.name or "",
        "sheet_comments": lead.sheet_comments or "",
        "next_call_sheet": lead.next_call_sheet or "",
        "total_debt": lead.total_debt or "",
        "phone": lead.phone or "",
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
        "app_comments": lead.app_comments or [],
        "app_next_call": lead.app_next_call.isoformat() if lead.app_next_call else None,
        "linked_case_id": lead.linked_case_id,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_leads(
    search: Optional[str] = None,
    status: Optional[List[str]] = Query(default=None),
    assigned_to: Optional[List[str]] = Query(default=None),
    years: Optional[List[str]] = Query(default=None),
    has_next_call: Optional[bool] = None,
    max_years: int = 3,
    db: Session = Depends(get_db),
):
    q = db.query(Lead)

    # Limit to last N years by sync date for performance
    cutoff = datetime.utcnow() - timedelta(days=365 * max_years)
    q = q.filter(Lead.created_at >= cutoff)

    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            Lead.name.ilike(term),
            Lead.phone.ilike(term),
            Lead.email.ilike(term),
            Lead.sheet_comments.ilike(term),
            Lead.total_debt.ilike(term),
            Lead.referrer.ilike(term),
        ))
    if status:
        normalized = [s.lower() for s in status]
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
    """Debug endpoint: returns raw sheet headers and their field mapping."""
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise HTTPException(status_code=503, detail="GOOGLE_SHEET_ID not configured")
    try:
        from sheets_sync import fetch_raw_headers
        return fetch_raw_headers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        lead.status = data.status.lower()
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

    lead.updated_at = datetime.utcnow()
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
        "at": datetime.utcnow().isoformat(),
    })
    lead.app_comments = comments
    lead.updated_at = datetime.utcnow()
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
        lead.updated_at = datetime.utcnow()
        db.commit()
    return _lead_to_dict(lead)


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
    comments.append({"text": f"📱 Viber εστάλη: {data.message[:80]}…" if len(data.message) > 80 else f"📱 Viber εστάλη: {data.message}", "author": "system", "at": datetime.utcnow().isoformat()})
    lead.app_comments = comments
    lead.updated_at = datetime.utcnow()
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
    comments.append({"text": f"✉️ Email εστάλη: {data.subject}", "author": "system", "at": datetime.utcnow().isoformat()})
    lead.app_comments = comments
    lead.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
