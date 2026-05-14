from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
import os, smtplib, json, base64
import requests as http_requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from database import get_db
from models import Case

router = APIRouter(prefix="/public", tags=["public"])

EXCLUDED_IPS = {"5.59.243.16", "2001:4860:7:1511::fe"}


@router.get("/case/{token}")
def get_public_case(token: str, request: Request, vat: str = Query(default=None), notrack: bool = Query(default=False), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="not_found")

    if case.portal_active is False:
        raise HTTPException(status_code=403, detail="portal_disabled")

    if case.client_vat:
        if not vat:
            raise HTTPException(status_code=403, detail="vat_required")
        if vat.strip() != (case.client_vat or "").strip():
            raise HTTPException(status_code=403, detail="vat_invalid")

    # Log portal visit (skip staff IPs and notrack requests)
    try:
        ip = request.client.host if request.client else "unknown"
        if not notrack and ip not in EXCLUDED_IPS:
            now = datetime.utcnow().isoformat()
            visits = list(case.portal_visits or [])
            visits.append({"at": now, "ip": ip})
            case.portal_visits = visits
            case.portal_visit_count = len(visits)
            db.commit()
    except Exception:
        db.rollback()

    return {
        "id": case.id,
        "client_name": case.client_name,
        "client_phone": case.client_phone or "",
        "client_email": case.client_email or "",
        "debtor_type": case.debtor_type,
        "status": case.status,
        "employee": case.employee,
        "debts": case.debts,
        "assets": case.assets,
        "income_data": case.income_data or {},
        "estimates": case.estimates,
        "actual_results": case.actual_results,
        "notes": case.notes or "",
        "has_vat": bool(case.client_vat),
        "commercial_offer": case.commercial_offer or {},
        "portal_visit_count": case.portal_visit_count or 0,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "completed_at": case.completed_at.isoformat() if case.completed_at else None,
    }


STAGE_ORDER = ['Νέα Ανάλυση', 'Εστάλη Σύνδεσμος', 'Θετική Ανταπόκριση', 'Σε Διαπραγμάτευση', 'Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης', 'Δεν Ενδιαφέρεται']


def _send_interested_email(case: Case) -> bool:
    """Send notification email via Gmail API (Service Account). Returns True on success."""
    try:
        sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
        sender = os.getenv("SMTP_USER", "").strip()
        notify_to = os.getenv("NOTIFY_EMAIL", "info@i-mentor.gr")

        if not sa_json or not sender:
            return False

        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_service_account_info(
            json.loads(sa_json),
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        ).with_subject(sender)
        svc = build("gmail", "v1", credentials=creds, cache_discovery=False)

        body = (
            f"Ο/Η πελάτης {case.client_name or '(άγνωστος)'} "
            f"(ΑΦΜ: {case.client_vat or '-'}) "
            f"έκανε κλικ στο κουμπί «Θέλω να Προχωρήσω» στο portal.\n\n"
            f"Υπόθεση ID: {case.id}\n"
            f"Υπεύθυνος: {case.employee or '-'}\n"
            f"Ώρα: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC\n"
        )
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[i-Mentor] Ενδιαφέρον πελάτη: {case.client_name or case.id}"
        msg["From"] = sender
        msg["To"] = notify_to
        msg.attach(MIMEText(body, "plain", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        svc.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception:
        return False


def _notify_team_via_chatwoot(case: Case):
    """Notify team when client clicks interested.
    Strategy 1: send Viber to NOTIFY_PHONE (team number).
    Strategy 2 (fallback, no extra config needed): post internal note on client's existing conversation."""
    try:
        cw_url = os.getenv("CHATWOOT_URL", "").strip().rstrip("/")
        cw_token = os.getenv("CHATWOOT_API_TOKEN", "").strip()
        cw_account = os.getenv("CHATWOOT_ACCOUNT_ID", "").strip()
        cw_inbox = os.getenv("CHATWOOT_INBOX_ID", "").strip()

        if not all([cw_url, cw_token, cw_account, cw_inbox]):
            return

        headers = {"api_access_token": cw_token, "Content-Type": "application/json"}
        base = f"{cw_url}/api/v1/accounts/{cw_account}"

        notify_msg = (
            f"🔔 *Νέο ενδιαφέρον πελάτη!*\n\n"
            f"Ο/Η *{case.client_name or '(άγνωστος)'}* έκανε κλικ στο «Θέλω να Προχωρήσω» στο portal.\n"
            f"Υπεύθυνος: {case.employee or '-'}\n"
            f"ΑΦΜ: {case.client_vat or '-'}"
        )

        # ── Strategy 1: Viber to team phone (NOTIFY_PHONE) ───────────────────
        notify_phone = os.getenv("NOTIFY_PHONE", "").strip()
        if notify_phone:
            contact_id = None
            r = http_requests.get(f"{base}/contacts/search", params={"q": notify_phone}, headers=headers, timeout=8)
            if r.status_code == 200:
                payload = r.json().get("payload", [])
                contacts = payload if isinstance(payload, list) else payload.get("contacts", [])
                if contacts:
                    contact_id = contacts[0]["id"]
            if not contact_id:
                r = http_requests.post(f"{base}/contacts",
                    json={"name": "i-Mentor Team", "phone_number": notify_phone},
                    headers=headers, timeout=8)
                if r.status_code in (200, 201):
                    contact_id = r.json().get("id")
            if contact_id:
                r = http_requests.post(f"{base}/conversations",
                    json={"inbox_id": int(cw_inbox), "contact_id": contact_id},
                    headers=headers, timeout=8)
                if r.status_code in (200, 201):
                    conv_id = r.json().get("id")
                    if conv_id:
                        http_requests.post(
                            f"{base}/conversations/{conv_id}/messages",
                            json={"content": notify_msg, "message_type": "outgoing", "private": False},
                            headers=headers, timeout=8,
                        )
                        return  # success

        # ── Strategy 2: internal note on client's conversation ────────────────
        # Find client's contact by phone or name
        client_phone = (case.client_phone or "").strip()
        contact_id = None
        if client_phone:
            r = http_requests.get(f"{base}/contacts/search", params={"q": client_phone}, headers=headers, timeout=8)
            if r.status_code == 200:
                payload = r.json().get("payload", [])
                contacts = payload if isinstance(payload, list) else payload.get("contacts", [])
                if contacts:
                    contact_id = contacts[0]["id"]
        if not contact_id and case.client_name:
            r = http_requests.get(f"{base}/contacts/search", params={"q": case.client_name}, headers=headers, timeout=8)
            if r.status_code == 200:
                payload = r.json().get("payload", [])
                contacts = payload if isinstance(payload, list) else payload.get("contacts", [])
                if contacts:
                    contact_id = contacts[0]["id"]

        if not contact_id:
            return

        # Find the most recent conversation for this contact
        r = http_requests.get(f"{base}/contacts/{contact_id}/conversations", headers=headers, timeout=8)
        if r.status_code != 200:
            return
        convs = r.json().get("payload", [])
        if not convs:
            return
        # Sort by id descending, pick most recent
        conv_id = sorted(convs, key=lambda c: c.get("id", 0), reverse=True)[0].get("id")
        if not conv_id:
            return

        # Post internal note — only visible to agents in Chatwoot, not sent to client
        http_requests.post(
            f"{base}/conversations/{conv_id}/messages",
            json={"content": notify_msg, "message_type": "outgoing", "private": True},
            headers=headers, timeout=8,
        )
    except Exception:
        pass


@router.post("/case/{token}/interested")
def mark_interested(token: str, db: Session = Depends(get_db)):
    """Client clicked 'I want to proceed' in the portal."""
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="not_found")
    current = case.contact_stage or 'Νέα Ανάλυση'
    try:
        current_idx = STAGE_ORDER.index(current)
    except ValueError:
        current_idx = 0
    interested_idx = STAGE_ORDER.index('Θετική Ανταπόκριση')
    if current_idx < interested_idx:
        case.contact_stage = 'Θετική Ανταπόκριση'
        case.last_contacted_at = datetime.utcnow()
        case.updated_at = datetime.utcnow()
        db.commit()
        email_sent = _send_interested_email(case)
        if not email_sent:
            # SMTP not configured — fall back to Viber notification via Chatwoot
            _notify_team_via_chatwoot(case)
    return {"ok": True, "contact_stage": case.contact_stage}

@router.get("/stats")
def get_public_stats(db: Session = Depends(get_db)):
    """Aggregate stats shown in client portal (no PII)."""
    cases = db.query(Case).all()
    total = len(cases)
    total_debt = sum(float((c.estimates or {}).get("sumDebt") or 0) for c in cases)
    total_writeoff = sum(float((c.estimates or {}).get("sumWr") or 0) for c in cases)
    completed = sum(1 for c in cases if c.actual_results)
    return {
        "total_cases": total,
        "total_debt_analyzed": round(total_debt),
        "total_estimated_writeoff": round(total_writeoff),
        "completed_cases": completed,
    }
