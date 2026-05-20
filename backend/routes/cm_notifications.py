import os
import json
import base64
import logging
import threading
import requests

logger = logging.getLogger(__name__)
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, fmt_dt
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


def _send_email(to_email: str, subject: str, body: str, html_override: str = None) -> tuple[bool, str]:
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    sender = os.getenv("SMTP_USER", "info@i-mentor.gr")

    if not sa_json:
        return False, "GOOGLE_SERVICE_ACCOUNT_JSON δεν έχει ρυθμιστεί"

    if html_override:
        html_body = html_override
    else:
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


def _get_status_neighbors(program_category: str, current_status: str, db) -> tuple:
    """Return (prev_status, next_status, descriptions_dict) for a given status in a program pipeline."""
    from routes.cm_pipeline import get_pipeline_config
    config = get_pipeline_config(program_category, db)
    phases = config.get("phases", [])
    extra_statuses = config.get("extra_statuses", [])
    descriptions = config.get("status_descriptions", {})

    # Build flat list of all statuses (from phases only, not extra_statuses)
    flat_statuses = []
    for phase in phases:
        for s in phase.get("statuses", []):
            flat_statuses.append(s)

    # If current status is in extra_statuses, return no neighbors
    if current_status in extra_statuses:
        return None, None, descriptions

    try:
        idx = flat_statuses.index(current_status)
    except ValueError:
        return None, None, descriptions

    prev_status = flat_statuses[idx - 1] if idx > 0 else None
    next_status = flat_statuses[idx + 1] if idx < len(flat_statuses) - 1 else None
    return prev_status, next_status, descriptions


def _build_status_change_html(case, from_status: str, to_status: str, descriptions: dict,
                               portal_url: str, review_url: str) -> str:
    """Build a complete beautiful HTML email for status change notification."""
    _app_base = os.getenv("PORTAL_BASE_URL", "").rstrip("/")
    _logo_url = f"{_app_base}/logo-white.png" if _app_base else ""
    _header_content = (
        f'<img src="{_logo_url}" alt="iMentor Consulting" style="height:55px;width:auto;display:block;margin:0 auto;" />'
        if _logo_url else
        '<h2 style="color:white;margin:0;font-family:Arial,sans-serif;font-size:22px;">iMentor Consulting</h2>'
    )

    client_name = case.client_name or "Πελάτη"
    service_type = case.service_type or ""
    current_desc = descriptions.get(to_status, "")

    # Get neighbors from descriptions
    prev_status = from_status if from_status and from_status != to_status else None
    # We pass neighbors via the call, but here we use from_status as "previous"
    # The actual prev/next are determined in _send_status_change_notification
    # This function receives them via the call context, so we use a different approach:
    # We store them as attributes added by _send_status_change_notification via the call
    next_status = getattr(case, '_next_status_temp', None)
    real_prev = getattr(case, '_prev_status_temp', from_status)

    prev_desc = descriptions.get(real_prev, "") if real_prev else ""
    next_desc = descriptions.get(next_status, "") if next_status else ""

    # Build timeline columns
    timeline_cells = []

    # Previous status column
    if real_prev:
        timeline_cells.append(f"""
        <td style="text-align:center;padding:0 8px;vertical-align:top;width:150px;">
          <div style="width:44px;height:44px;border-radius:50%;background:#10b981;margin:0 auto 8px auto;
               display:flex;align-items:center;justify-content:center;font-size:20px;color:white;
               line-height:44px;text-align:center;">
            <span style="font-size:20px;">&#10003;</span>
          </div>
          <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;
               letter-spacing:0.5px;line-height:1.3;">{real_prev}</div>
          {f'<div style="font-size:10px;color:#9ca3af;margin-top:4px;line-height:1.3;">{prev_desc[:60]}{"..." if len(prev_desc) > 60 else ""}</div>' if prev_desc else ''}
        </td>
        <td style="text-align:center;vertical-align:middle;padding:0 4px;width:24px;">
          <span style="color:#d1d5db;font-size:18px;">&#8594;</span>
        </td>
        """)

    # Current (active) status column
    timeline_cells.append(f"""
    <td style="text-align:center;padding:0 8px;vertical-align:top;width:160px;">
      <div style="width:54px;height:54px;border-radius:50%;background:#2563eb;margin:0 auto 8px auto;
           display:flex;align-items:center;justify-content:center;
           line-height:54px;text-align:center;box-shadow:0 4px 12px rgba(37,99,235,0.4);">
        <span style="font-size:22px;color:white;">&#9733;</span>
      </div>
      <div style="font-size:12px;color:#1e3a5f;font-weight:700;text-transform:uppercase;
           letter-spacing:0.5px;line-height:1.3;">{to_status}</div>
      {f'<div style="font-size:10px;color:#3b82f6;margin-top:4px;line-height:1.3;">{current_desc[:60]}{"..." if len(current_desc) > 60 else ""}</div>' if current_desc else ''}
    </td>
    """)

    # Next status column
    if next_status:
        timeline_cells.append(f"""
        <td style="text-align:center;vertical-align:middle;padding:0 4px;width:24px;">
          <span style="color:#d1d5db;font-size:18px;">&#8594;</span>
        </td>
        <td style="text-align:center;padding:0 8px;vertical-align:top;width:150px;">
          <div style="width:44px;height:44px;border-radius:50%;border:2px dashed #d1d5db;background:#f9fafb;
               margin:0 auto 8px auto;line-height:40px;text-align:center;">
            <span style="font-size:18px;color:#9ca3af;">&#9675;</span>
          </div>
          <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;
               letter-spacing:0.5px;line-height:1.3;">{next_status}</div>
          {f'<div style="font-size:10px;color:#d1d5db;margin-top:4px;line-height:1.3;">{next_desc[:60]}{"..." if len(next_desc) > 60 else ""}</div>' if next_desc else ''}
        </td>
        """)
    else:
        timeline_cells.append(f"""
        <td style="text-align:center;vertical-align:middle;padding:0 4px;width:24px;">
          <span style="color:#d1d5db;font-size:18px;">&#8594;</span>
        </td>
        <td style="text-align:center;padding:0 8px;vertical-align:top;width:150px;">
          <div style="width:44px;height:44px;border-radius:50%;background:#10b981;
               margin:0 auto 8px auto;line-height:44px;text-align:center;">
            <span style="font-size:18px;color:white;">&#10003;</span>
          </div>
          <div style="font-size:11px;color:#10b981;font-weight:700;text-transform:uppercase;
               letter-spacing:0.5px;line-height:1.3;">&#79;&#955;&#959;&#954;&#955;&#942;&#961;&#969;&#963;&#951;!</div>
        </td>
        """)

    timeline_html = "".join(timeline_cells)

    # Description box
    desc_box = ""
    if current_desc:
        desc_box = f"""
        <tr>
          <td style="padding:20px 30px 10px 30px;">
            <div style="background:#eff6ff;border-left:4px solid #1e40af;padding:16px 20px;border-radius:0 6px 6px 0;">
              <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:6px;">
                &#128203; Τι σημαίνει αυτό το στάδιο:
              </div>
              <div style="font-size:14px;color:#1e3a5f;line-height:1.6;">{current_desc}</div>
            </div>
          </td>
        </tr>
        """

    # Action buttons
    buttons_html = ""
    portal_btn = ""
    review_btn = ""

    if portal_url:
        portal_btn = f"""
        <a href="{portal_url}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;
           padding:14px 28px;border-radius:8px;font-size:14px;font-weight:700;margin:0 8px 8px 0;
           font-family:Arial,sans-serif;">
          &#128279; ΔΕΙΤΕ ΤΟ PORTAL ΣΑΣ
        </a>
        """

    if review_url:
        review_btn = f"""
        <a href="{review_url}" style="display:inline-block;background:#f59e0b;color:white;text-decoration:none;
           padding:14px 28px;border-radius:8px;font-size:14px;font-weight:700;margin:0 8px 8px 0;
           font-family:Arial,sans-serif;">
          &#11088; ΑΞΙΟΛΟΓΗΣΤΕ ΜΑΣ
        </a>
        """

    if portal_btn or review_btn:
        buttons_html = f"""
        <tr>
          <td style="padding:10px 30px 20px 30px;text-align:center;">
            {portal_btn}{review_btn}
          </td>
        </tr>
        """

    service_line = f" ({service_type})" if service_type else ""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12);">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:24px 30px;text-align:center;">
            {_header_content}
            <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:8px;letter-spacing:1px;">
              ΕΝΗΜΕΡΩΣΗ ΥΠΟΘΕΣΗΣ
            </div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="background:#ffffff;padding:28px 30px 16px 30px;">
            <p style="margin:0 0 10px 0;font-size:16px;color:#1e3a5f;font-weight:700;">
              Αγαπητέ/ή {client_name},
            </p>
            <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">
              Η υπόθεσή σας{service_line} μπήκε σε νέο στάδιο επεξεργασίας.
            </p>
          </td>
        </tr>

        <!-- Timeline Section -->
        <tr>
          <td style="background:#ffffff;padding:16px 30px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;">
              <div style="text-align:center;font-size:12px;font-weight:700;color:#6b7280;
                   text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
                ΕΞΕΛΙΞΗ ΥΠΟΘΕΣΗΣ
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr style="vertical-align:top;">
                  {timeline_html}
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Description box -->
        {desc_box}

        <!-- Action buttons -->
        {buttons_html}

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 30px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
              Αυτό είναι αυτόματο μήνυμα από το σύστημα iMentor Consulting.<br/>
              Παρακαλώ μην απαντάτε σε αυτό το email.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>"""

    return html


def _send_status_change_notification(case, from_status: str, to_status: str, db) -> None:
    """Send a status change notification email if configured for to_status."""
    try:
        from models_cases import CMStatusNotificationConfig
        config = db.query(CMStatusNotificationConfig).filter(
            CMStatusNotificationConfig.status == to_status
        ).first()
        if not config or not config.enabled:
            return

        if not case.email:
            return

        portal_url = ""
        if case.share_token and getattr(case, 'portal_active', False):
            base_url = os.getenv("PORTAL_BASE_URL", "").rstrip("/")
            if base_url:
                portal_url = f"{base_url}/portal/{case.share_token}"

        review_url = os.getenv("REVIEW_URL", "")

        prev_status, next_status, descriptions = _get_status_neighbors(
            case.program_category or "ΕΣΠΑ", to_status, db
        )

        # Temporarily attach neighbors to case object for HTML builder
        case._prev_status_temp = prev_status if prev_status else from_status
        case._next_status_temp = next_status

        html = _build_status_change_html(
            case=case,
            from_status=from_status,
            to_status=to_status,
            descriptions=descriptions,
            portal_url=portal_url,
            review_url=review_url,
        )

        # Clean up temporary attributes
        try:
            del case._prev_status_temp
            del case._next_status_temp
        except Exception:
            pass

        subject = f"Ενημέρωση Υπόθεσης: {to_status}"
        ok, err = _send_email(case.email, subject, body="", html_override=html)
        status_str = "sent" if ok else "failed"
        _log_notification(
            db=db,
            case_id=case.id,
            ntype="email",
            recipient_name=case.client_name or "",
            recipient_contact=case.email,
            subject=subject,
            content=f"[Status change: {from_status} → {to_status}]",
            status=status_str,
            sent_by="system",
        )
        db.commit()
        if not ok:
            logger.warning("[status notification] email failed for case %s: %s", case.id, err)
    except Exception as e:
        logger.exception("[status notification] error for case %s: %s", getattr(case, 'id', '?'), e)


def _chatwoot_log_outbound_viber(phone_normalized: str, message: str = "", contact_name: str = "") -> None:
    """Find-or-create a Chatwoot contact+conversation for the Viber inbox,
    post the sent message as an outbound note so agents can see it, then
    resolve the conversation.  Never raises — all errors are silently ignored."""
    base = os.getenv("CHATWOOT_URL", "https://chat.i-mentor.gr").rstrip("/")
    token = os.getenv("CHATWOOT_API_TOKEN", "")
    account_id = os.getenv("CHATWOOT_ACCOUNT_ID", "1")
    inbox_id = int(os.getenv("CHATWOOT_VIBER_INBOX_ID", "1"))

    if not token:
        return

    headers = {"api_access_token": token, "Content-Type": "application/json"}
    api = f"{base}/api/v1/accounts/{account_id}"

    try:
        # 1. Find or create contact
        contact_id = None
        for q in [phone_normalized, f"+{phone_normalized}"]:
            r = requests.get(f"{api}/contacts/search",
                             params={"q": q, "include_contacts": "true"},
                             headers=headers, timeout=8)
            if r.ok:
                hits = r.json().get("payload", {}).get("contacts", [])
                if hits:
                    contact_id = hits[0]["id"]
                    break

        if not contact_id:
            phone_e164 = f"+{phone_normalized}" if not phone_normalized.startswith("+") else phone_normalized
            r = requests.post(f"{api}/contacts", json={
                "name": contact_name or phone_normalized,
                "phone_number": phone_e164,
            }, headers=headers, timeout=8)
            if r.ok:
                body = r.json()
                # Chatwoot returns the contact directly or nested under "id"
                contact_id = body.get("id") or (body.get("contact", {}) or {}).get("id")
            else:
                logger.warning("Chatwoot create contact failed %s: %s", r.status_code, r.text[:300])

        if not contact_id:
            logger.warning("Chatwoot: could not find or create contact for %s", phone_normalized)
            return

        # 2. Find existing conversation in this inbox (any status)
        conv_id = None
        r = requests.get(f"{api}/contacts/{contact_id}/conversations",
                         headers=headers, timeout=8)
        if r.ok:
            payload = r.json().get("payload", [])
            for conv in payload:
                # inbox_id may be int or str from the API
                if str(conv.get("inbox_id")) == str(inbox_id):
                    conv_id = conv["id"]
                    if conv.get("status") == "resolved":
                        requests.patch(f"{api}/conversations/{conv_id}",
                                       json={"status": "open"},
                                       headers=headers, timeout=8)
                    break

        # 3. Create conversation if none exists
        if not conv_id:
            r = requests.post(f"{api}/conversations", json={
                "inbox_id": inbox_id,
                "contact_id": contact_id,
                "status": "open",
            }, headers=headers, timeout=8)
            if r.ok:
                body = r.json()
                conv_id = body.get("id")
            else:
                logger.warning("Chatwoot create conversation failed %s: %s", r.status_code, r.text[:300])

        if not conv_id:
            logger.warning("Chatwoot: could not find or create conversation for contact %s", contact_id)
            return

        # 4. Log the sent message as a private outbound note
        if message:
            r = requests.post(f"{api}/conversations/{conv_id}/messages", json={
                "content": message,
                "message_type": "outgoing",
                "private": True,
            }, headers=headers, timeout=10)
            if not r.ok:
                logger.warning("Chatwoot post message failed %s: %s", r.status_code, r.text[:300])

        # 5. Resolve the conversation
        requests.patch(f"{api}/conversations/{conv_id}",
                       json={"status": "resolved"},
                       headers=headers, timeout=8)

    except Exception as exc:
        logger.exception("Chatwoot outbound Viber log failed for %s: %s", phone_normalized, exc)


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
            # Run Chatwoot logging in background so bulk sends don't time out
            threading.Thread(
                target=_chatwoot_log_outbound_viber,
                args=(phone, message, client_name),
                daemon=True,
            ).start()
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
            "created_at": fmt_dt(l.created_at),
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
        "updated_at": fmt_dt(t.updated_at),
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


# ── Status Notification Configs ────────────────────────────────────────

from models_cases import CMStatusNotificationConfig
from datetime import datetime as _dt_cls


class StatusConfigBulkItem(BaseModel):
    status: str
    enabled: bool


class StatusConfigBulkRequest(BaseModel):
    configs: List[StatusConfigBulkItem]


@router.get("/status-configs")
def list_status_configs(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(CMStatusNotificationConfig).all()
    return {
        "configs": [
            {"status": r.status, "enabled": r.enabled}
            for r in rows
        ]
    }


@router.post("/status-configs/bulk")
def save_status_configs_bulk(
    req: StatusConfigBulkRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for item in req.configs:
        existing = db.query(CMStatusNotificationConfig).filter(
            CMStatusNotificationConfig.status == item.status
        ).first()
        if existing:
            existing.enabled = item.enabled
            existing.updated_at = _dt_cls.utcnow()
        else:
            db.add(CMStatusNotificationConfig(
                status=item.status,
                enabled=item.enabled,
                updated_at=_dt_cls.utcnow(),
            ))
    db.commit()
    return {"message": "Αποθηκεύτηκε", "count": len(req.configs)}
