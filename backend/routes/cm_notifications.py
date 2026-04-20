import os
import smtplib
import json
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from models_cases import CMCase, CMNotificationLog, CMUser
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


def _send_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    from_email = os.getenv("SMTP_FROM", smtp_user)

    if not smtp_host or not smtp_user:
        return False, "SMTP δεν έχει ρυθμιστεί (SMTP_HOST, SMTP_USER, SMTP_PASS)"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"iMentor Consulting <{from_email}>"
        msg["To"] = to_email

        html_body = f"""
        <html><body style="font-family:Arial,sans-serif;padding:20px;color:#333;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="background:#1e3a5f;padding:15px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">iMentor Consulting</h2>
          </div>
          <div style="background:#f9f9f9;padding:25px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
            <p style="white-space:pre-wrap;">{body}</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee;"/>
            <p style="font-size:12px;color:#999;">
              iMentor Consulting | Αυτό το μήνυμα στάλθηκε αυτόματα από το σύστημα διαχείρισης υποθέσεων.
            </p>
          </div>
        </div>
        </body></html>
        """
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, to_email, msg.as_string())

        return True, "OK"
    except Exception as e:
        return False, str(e)


def _send_viber(phone: str, message: str) -> tuple[bool, str]:
    viber_token = os.getenv("VIBER_TOKEN", "")
    if not viber_token:
        return False, "VIBER_TOKEN δεν έχει ρυθμιστεί"

    # Normalize phone number
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("0"):
        phone = "+30" + phone[1:]
    elif not phone.startswith("+"):
        phone = "+30" + phone

    try:
        payload = {
            "receiver": phone,
            "min_api_version": 1,
            "sender": {"name": "iMentor Consulting", "avatar": ""},
            "tracking_data": "case_notification",
            "type": "text",
            "text": message,
        }
        resp = requests.post(
            "https://chatapi.viber.com/pa/send_message",
            json=payload,
            headers={"X-Viber-Auth-Token": viber_token},
            timeout=10,
        )
        data = resp.json()
        if data.get("status") == 0:
            return True, "OK"
        return False, data.get("status_message", "Viber error")
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
            ok, err = _send_viber(phone, req.message)
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
                ok, err = _send_viber(c.phone, req.message)
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


# ── Notification Templates ─────────────────────────────────────────────

TEMPLATES = {
    "deadline_reminder": {
        "label": "Υπενθύμιση Προθεσμίας",
        "subject": "Υπενθύμιση Προθεσμίας Έργου - {client_name}",
        "message": "Αγαπητέ/ή {client_name},\n\nΣας υπενθυμίζουμε ότι η προθεσμία ολοκλήρωσης του έργου σας πλησιάζει ({deadline}).\n\nΠαρακαλούμε επικοινωνήστε μαζί μας για τα επόμενα βήματα.\n\nΜε εκτίμηση,\niMentor Consulting",
    },
    "payment_reminder": {
        "label": "Υπενθύμιση Πληρωμής",
        "subject": "Υπενθύμιση Εκκρεμούς Οφειλής - {client_name}",
        "message": "Αγαπητέ/ή {client_name},\n\nΣας υπενθυμίζουμε ότι υπάρχει εκκρεμής οφειλή {balance}€ για την υπηρεσία {service_type}.\n\nΠαρακαλούμε επικοινωνήστε μαζί μας για τη διευθέτηση.\n\nΜε εκτίμηση,\niMentor Consulting",
    },
    "documents_needed": {
        "label": "Αίτημα Εγγράφων",
        "subject": "Απαιτούμενα Έγγραφα - {client_name}",
        "message": "Αγαπητέ/ή {client_name},\n\nΓια την υπόθεσή σας ({service_type}) απαιτείται η προσκόμιση εγγράφων.\n\nΠαρακαλούμε επικοινωνήστε μαζί μας το συντομότερο δυνατό.\n\nΜε εκτίμηση,\niMentor Consulting",
    },
    "status_update": {
        "label": "Ενημέρωση Κατάστασης",
        "subject": "Ενημέρωση για την Υπόθεσή σας - {client_name}",
        "message": "Αγαπητέ/ή {client_name},\n\nΘέλουμε να σας ενημερώσουμε για την πρόοδο της υπόθεσής σας.\n\nΤρέχουσα κατάσταση: {status}\n\nΓια οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας.\n\nΜε εκτίμηση,\niMentor Consulting",
    },
    "google_review": {
        "label": "Αίτημα Google Review",
        "subject": "Η γνώμη σας μετράει! - iMentor Consulting",
        "message": "Αγαπητέ/ή {client_name},\n\nΕυχαριστούμε για την εμπιστοσύνη σας στην iMentor Consulting!\n\nΘα μας βοηθούσε πολύ αν αφήνατε μια κριτική στο Google:\nhttps://g.page/r/YOUR_GOOGLE_REVIEW_LINK\n\nΜε εκτίμηση,\niMentor Consulting",
    },
}


@router.get("/templates")
def list_templates(current_user: CMUser = Depends(get_current_user)):
    return [{"key": k, **v} for k, v in TEMPLATES.items()]
