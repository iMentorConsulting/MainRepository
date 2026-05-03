import os
import json
import base64
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from models_cases import CMCase, CMNotificationLog, CMUser, CMStatusSLA
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/notifications", tags=["cm-notifications"])


class SendNotificationRequest(BaseModel):
    case_ids: List[int]
    notification_type: str  # email, viber, both
    subject: Optional[str] = None
    message: str


class SingleNotificationRequest(BaseModel):
    notification_type: str  # email, viber, both
    subject: Optional[str] = None
    message: str
    recipient_override: Optional[str] = None  # override email or phone


def _infobip_auth(api_key: str) -> str:
    """Return correct Authorization header value, stripping double 'App ' if user pasted full header."""
    key = api_key.strip()
    if key.startswith("App "):
        key = key[4:]
    return f"App {key}"


def _send_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    sender = os.getenv("SMTP_USER", "info@i-mentor.gr")

    if not sa_json:
        return False, "GOOGLE_SERVICE_ACCOUNT_JSON δεν έχει ρυθμιστεί"

    _app_base = os.getenv("PORTAL_BASE_URL", "").rstrip("/")
    _logo_url = f"{_app_base}/logo-white.png" if _app_base else ""
    _header_content = (
        f'<img src="{_logo_url}" alt="iMentor Consulting" style="height:60px;width:auto;display:block;" />'
        if _logo_url else
        '<h2 style="color:white;margin:0;font-family:Arial,sans-serif;">iMentor Consulting</h2>'
    )
    html_body = f"""<html><body style="font-family:Arial,sans-serif;padding:20px;color:#333;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#1e3a5f;padding:20px 25px;border-radius:8px 8px 0 0;text-align:center;">
    {_header_content}
  </div>
  <div style="background:#f9f9f9;padding:25px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
    <p style="white-space:pre-wrap;">{body}</p>
    <hr style="margin:20px 0;border:none;border-top:1px solid #eee;"/>
    <p style="font-size:12px;color:#999;">iMentor Consulting | Αυτόματο μήνυμα.</p>
  </div>
</div></body></html>"""

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds_data = json.loads(sa_json)
        credentials = Credentials.from_service_account_info(
            creds_data,
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        ).with_subject(sender)

        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"iMentor Consulting <{sender}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True, "OK"
    except Exception as e:
        return False, str(e)


def _send_viber(phone: str, message: str, client_name: str = "", agent_name: str = "", service_type: str = "") -> tuple[bool, str]:
    bridge_url = os.getenv("VIBER_BRIDGE_URL", "https://viber-bridge.i-mentor.gr")

    # Normalize phone to international format without +
    phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone.startswith("0"):
        phone = "30" + phone[1:]
    elif phone.startswith("+"):
        phone = phone[1:]
    elif not phone.startswith("30"):
        phone = "30" + phone

    payload = {
        "to": phone,
        "text": message,
        "name": client_name or phone,
    }
    if agent_name:
        payload["agent"] = agent_name
    if service_type:
        payload["service_tag"] = service_type

    try:
        resp = requests.post(f"{bridge_url}/send", json=payload, timeout=10)
        if resp.status_code in (200, 201):
            return True, "OK"
        return False, f"Bridge HTTP {resp.status_code} — {resp.text[:500]}"
    except Exception as e:
        return False, str(e)


def _log_notification(
    db: Session,
    case_id: Optional[int],
    ntype: str,
    recipient_name: str,
    recipient_contact: str,
    subject: str,
    content: str,
    status: str,
    sent_by: str,
):
    log = CMNotificationLog(
        case_id=case_id,
        notification_type=ntype,
        recipient_name=recipient_name,
        recipient_contact=recipient_contact,
        subject=subject,
        content=content,
        status=status,
        sent_by=sent_by,
    )
    db.add(log)


@router.post("/send/{case_id}")
def send_notification_to_case(
    case_id: int,
    req: SingleNotificationRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")

    results = []
    subject = req.subject or f"Ενημέρωση υπόθεσης - {c.client_name}"

    if req.notification_type in ("email", "both"):
        email = req.recipient_override or c.email
        if email:
            ok, err = _send_email(email, subject, req.message)
            status = "sent" if ok else "failed"
            _log_notification(db, c.id, "email", c.client_name, email, subject, req.message, status, current_user.full_name)
            results.append({"type": "email", "to": email, "status": status, "error": err if not ok else None})
        else:
            results.append({"type": "email", "status": "skipped", "error": "Δεν υπάρχει email"})

    if req.notification_type in ("viber", "both"):
        phone = req.recipient_override or c.phone
        if phone:
            ok, err = _send_viber(phone, req.message, c.client_name, current_user.full_name, c.service_type or "")
            status = "sent" if ok else "failed"
            _log_notification(db, c.id, "viber", c.client_name, phone, subject, req.message, status, current_user.full_name)
            results.append({"type": "viber", "to": phone, "status": status, "error": err if not ok else None})
        else:
            results.append({"type": "viber", "status": "skipped", "error": "Δεν υπάρχει τηλέφωνο"})

    db.commit()
    return {"results": results}


@router.post("/send-bulk")
def send_bulk_notifications(
    req: SendNotificationRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send same message to multiple cases."""
    cases = db.query(CMCase).filter(CMCase.id.in_(req.case_ids)).all()
    if not cases:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκαν υποθέσεις")

    all_results = []
    for c in cases:
        subject = req.subject or f"Ενημέρωση υπόθεσης - {c.client_name}"

        if req.notification_type in ("email", "both"):
            if c.email:
                ok, err = _send_email(c.email, subject, req.message)
                status = "sent" if ok else "failed"
                _log_notification(db, c.id, "email", c.client_name, c.email, subject, req.message, status, current_user.full_name)
                all_results.append({"case_id": c.id, "client": c.client_name, "type": "email", "status": status})

        if req.notification_type in ("viber", "both"):
            if c.phone:
                ok, err = _send_viber(c.phone, req.message, c.client_name, current_user.full_name, c.service_type or "")
                status = "sent" if ok else "failed"
                _log_notification(db, c.id, "viber", c.client_name, c.phone, subject, req.message, status, current_user.full_name)
                all_results.append({"case_id": c.id, "client": c.client_name, "type": "viber", "status": status})

    db.commit()
    sent = sum(1 for r in all_results if r["status"] == "sent")
    return {
        "total_attempted": len(all_results),
        "sent": sent,
        "failed": len(all_results) - sent,
        "details": all_results,
    }


class SLANotifyRequest(BaseModel):
    status: str
    notification_type: str = "email"

@router.post("/send-sla")
def send_sla_notifications(
    req: SLANotifyRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send configured SLA notification message to all overdue cases for a given status."""
    sla = db.query(CMStatusSLA).filter(CMStatusSLA.status == req.status).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA entry not found")
    if not sla.notification_message:
        raise HTTPException(status_code=400, detail="Δεν έχει ρυθμιστεί μήνυμα για αυτή την κατάσταση")

    from datetime import datetime as _dt
    from pipelines import TERMINAL_STATUSES
    now = _dt.utcnow()
    cases = db.query(CMCase).filter(
        ~CMCase.status.in_(list(TERMINAL_STATUSES)),
        CMCase.status == req.status,
        CMCase.status_changed_at != None,
    ).all()

    overdue = [(c, (now - c.status_changed_at).days - sla.sla_days)
               for c in cases if (now - c.status_changed_at).days > sla.sla_days]

    results = []
    for c, overdue_days in overdue:
        msg = (sla.notification_message
               .replace("{client_name}", c.client_name or "")
               .replace("{service_type}", c.service_type or "")
               .replace("{status}", c.status or "")
               .replace("{days_overdue}", str(overdue_days))
               .replace("{sla_days}", str(sla.sla_days)))
        subject = f"Απαιτείται ενέργεια από εσάς - {c.client_name}"

        if req.notification_type in ("email", "both") and c.email:
            ok, err = _send_email(c.email, subject, msg)
            s = "sent" if ok else "failed"
            _log_notification(db, c.id, "email", c.client_name, c.email, subject, msg, s, current_user.full_name)
            results.append({"case_id": c.id, "client": c.client_name, "type": "email", "status": s, "error": err if not ok else None})

        if req.notification_type in ("viber", "both") and c.phone:
            ok, err = _send_viber(c.phone, msg, c.client_name, current_user.full_name, c.service_type or "")
            s = "sent" if ok else "failed"
            _log_notification(db, c.id, "viber", c.client_name, c.phone, subject, msg, s, current_user.full_name)
            results.append({"case_id": c.id, "client": c.client_name, "type": "viber", "status": s, "error": err if not ok else None})

    db.commit()
    sent = sum(1 for r in results if r["status"] == "sent")
    return {
        "total_overdue": len(overdue),
        "notifications_attempted": len(results),
        "sent": sent,
        "failed": len(results) - sent,
        "details": results,
    }


@router.get("/logs")
def list_notification_logs(
    case_id: Optional[int] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(CMNotificationLog)
    if case_id:
        q = q.filter(CMNotificationLog.case_id == case_id)
    logs = q.order_by(CMNotificationLog.created_at.desc()).limit(100).all()
    return [
        {
            "id": l.id,
            "case_id": l.case_id,
            "notification_type": l.notification_type,
            "recipient_name": l.recipient_name,
            "recipient_contact": l.recipient_contact,
            "subject": l.subject,
            "content": l.content,
            "status": l.status,
            "sent_by": l.sent_by,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


# ── Notification Templates (DB-backed) ────────────────────────────────

from models_cases import CMNotificationTemplate


class TemplateCreate(BaseModel):
    key: str
    label: str
    subject: Optional[str] = None
    content: str
    notification_type: Optional[str] = "both"


class TemplateUpdate(BaseModel):
    label: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    notification_type: Optional[str] = None
    is_active: Optional[bool] = None


def _tmpl_to_dict(t: CMNotificationTemplate) -> dict:
    return {
        "id": t.id,
        "key": t.key,
        "label": t.label,
        "subject": t.subject,
        "content": t.content,
        "notification_type": t.notification_type,
        "is_active": t.is_active,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/templates")
def list_templates(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_tmpl_to_dict(t) for t in db.query(CMNotificationTemplate).filter(CMNotificationTemplate.is_active == True).order_by(CMNotificationTemplate.label).all()]


@router.post("/templates")
def create_template(
    req: TemplateCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == req.key).first():
        raise HTTPException(status_code=400, detail="Το key υπάρχει ήδη")
    t = CMNotificationTemplate(key=req.key, label=req.label, subject=req.subject, content=req.content, notification_type=req.notification_type or "both")
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tmpl_to_dict(t)


@router.put("/templates/{tmpl_id}")
def update_template(
    tmpl_id: int,
    req: TemplateUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import datetime as _dt
    t = db.query(CMNotificationTemplate).filter(CMNotificationTemplate.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Πρότυπο δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(t, field, val)
    t.updated_at = _dt.utcnow()
    db.commit()
    db.refresh(t)
    return _tmpl_to_dict(t)


@router.delete("/templates/{tmpl_id}")
def delete_template(
    tmpl_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(CMNotificationTemplate).filter(CMNotificationTemplate.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Πρότυπο δεν βρέθηκε")
    db.delete(t)
    db.commit()
    return {"message": "Διαγράφηκε"}
