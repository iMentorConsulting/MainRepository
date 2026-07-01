"""
ΕΡΜΗΣ AI pre-screening integration.

ΕΡΜΗΣ is hosted in the sibling LOGISTIS app. We spawn a screening session per
lead (outbound POST), send the client the returned chat link, and receive the
transcript + eligibility back via an inbound webhook. Mirrors the shared-secret
x-api-key pattern in cm_portal_integration.py.

Contract (LOGISTIS dev implements their side):
  Outbound  us → LOGISTIS: POST {LOGISTIS_ERMIS_SESSION_URL}
    headers {x-api-key: IMENTOR_PORTAL_API_KEY}
    body    {leadRef, name, phone, email, afm, program, callbackUrl}
    → 200   {token, chatUrl}
  Inbound   LOGISTIS → us: POST /api/cm/leads/ermis/webhook
    headers {x-api-key: IMENTOR_PORTAL_API_KEY}
    body    {event:"ermis.completed", token, leadRef, eligibility, transcript, completedAt}
            (interim event "ermis.progress" also accepted)
"""
import os
import json
import logging
from datetime import datetime
from typing import Optional, List

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user, CMUser
from database import get_db
from models_cases import CMLead, CMLeadNotificationLog
from routes.cm_portal_integration import _shared_secret, _verify_portal_key
from routes.cm_notifications import _send_viber, _send_email

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/leads", tags=["cm-leads-ermis"])

ERMIS_SESSION_URL = os.getenv(
    "LOGISTIS_ERMIS_SESSION_URL", "https://logistis.i-mentor.gr/api/external/ermis-sessions"
)
# Public base of THIS app, used to build the webhook callback URL we hand LOGISTIS.
SELF_BASE_URL = os.getenv("SELF_PUBLIC_BASE_URL", "https://case.i-mentor.gr")


class ErmisStartIn(BaseModel):
    send_link: Optional[bool] = True
    channel: Optional[str] = "viber"  # viber | email | both | none


@router.post("/{lead_id}/ermis/start")
def start_ermis(
    lead_id: int,
    req: ErmisStartIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")

    secret = _shared_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί")

    # Flatten program-specific fields to {label: value} for easy prompt injection
    extra_fields = {}
    for k, v in (l.program_fields or {}).items():
        if isinstance(v, dict):
            extra_fields[v.get("label") or k] = v.get("value")
        else:
            extra_fields[k] = v

    # Full lead context so ΕΡΜΗΣ can use it in the conversation; `program`/
    # `serviceType` let LOGISTIS pick the right ΕΡΜΗΣ profile (prompt + knowledge).
    body = {
        "leadRef": str(l.id),
        "program": l.program,
        "serviceType": l.service_type,
        "callbackUrl": f"{SELF_BASE_URL.rstrip('/')}/api/cm/leads/ermis/webhook",
        "lead": {
            "id": l.id,
            "name": l.name,
            "phone": l.phone,
            "phone2": l.phone2,
            "email": l.email,
            "afm": l.afm,
            "program": l.program,
            "serviceType": l.service_type,
            "totalAmount": l.total_amount,
            "status": l.status,
            "consultant": l.assigned_name,
            "source": l.source,
            "notes": l.notes,
            "extraFields": extra_fields,
        },
    }
    try:
        resp = requests.post(ERMIS_SESSION_URL, json=body, headers={"x-api-key": secret}, timeout=15)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Σφάλμα επικοινωνίας με ΕΡΜΗΣ (LOGISTIS): {exc}")
    if not resp.ok:
        log.error("ΕΡΜΗΣ session create failed %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail=f"ΕΡΜΗΣ HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    token = data.get("token")
    chat_url = data.get("chatUrl") or data.get("chat_url")
    if not token or not chat_url:
        raise HTTPException(status_code=502, detail="Μη έγκυρη απάντηση ΕΡΜΗΣ (χωρίς token/chatUrl)")

    l.ermis_token = token
    l.ermis_chat_url = chat_url
    l.ermis_status = "in_progress"
    l.ermis_started_at = datetime.utcnow()
    db.commit()

    sent = []
    if req.send_link and (req.channel or "viber") != "none":
        msg = f"Καλησπέρα! Πατήστε εδώ για μια σύντομη προαξιολόγηση από τον βοηθό μας ΕΡΜΗ: {chat_url}"
        if req.channel in ("viber", "both") and l.phone:
            ok, err = _send_viber(l.phone, msg, l.name or "", current_user.full_name, l.service_type or "")
            db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                         recipient_name=l.name or "", recipient_contact=l.phone,
                                         subject="ΕΡΜΗΣ link", content=msg,
                                         status="sent" if ok else "failed", sent_by=current_user.full_name))
            sent.append({"channel": "viber", "status": "sent" if ok else "failed", "error": err if not ok else None})
        if req.channel in ("email", "both") and l.email:
            ok, err = _send_email(l.email, "Προαξιολόγηση i-Mentor (ΕΡΜΗΣ)", msg)
            db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                         recipient_name=l.name or "", recipient_contact=l.email,
                                         subject="ΕΡΜΗΣ link", content=msg,
                                         status="sent" if ok else "failed", sent_by=current_user.full_name))
            sent.append({"channel": "email", "status": "sent" if ok else "failed", "error": err if not ok else None})
        db.commit()

    return {"ok": True, "token": token, "chat_url": chat_url, "sent": sent}


@router.get("/{lead_id}/ermis/transcript")
def get_transcript(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    transcript = None
    if l.ermis_transcript:
        try:
            transcript = json.loads(l.ermis_transcript)
        except (ValueError, TypeError):
            transcript = l.ermis_transcript
    return {
        "lead_id": l.id,
        "ermis_status": l.ermis_status,
        "chat_url": l.ermis_chat_url,
        "transcript": transcript,
        "started_at": l.ermis_started_at.isoformat() if l.ermis_started_at else None,
        "completed_at": l.ermis_completed_at.isoformat() if l.ermis_completed_at else None,
    }


class ErmisWebhookIn(BaseModel):
    event: str
    token: Optional[str] = None
    leadRef: Optional[str] = None
    eligibility: Optional[str] = None       # eligible | ineligible
    transcript: Optional[object] = None     # list[{role,text,ts}] or markdown string
    completedAt: Optional[str] = None


@router.post("/ermis/webhook")
def ermis_webhook(
    payload: ErmisWebhookIn,
    _key: None = Depends(_verify_portal_key),
    db: Session = Depends(get_db),
):
    # Resolve lead by token first, then leadRef
    lead = None
    if payload.token:
        lead = db.query(CMLead).filter(CMLead.ermis_token == payload.token).first()
    if lead is None and payload.leadRef:
        try:
            lead = db.query(CMLead).filter(CMLead.id == int(payload.leadRef)).first()
        except (ValueError, TypeError):
            lead = None
    if lead is None:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε lead για αυτό το token/leadRef")

    if payload.transcript is not None:
        if isinstance(payload.transcript, str):
            lead.ermis_transcript = payload.transcript
        else:
            lead.ermis_transcript = json.dumps(payload.transcript, ensure_ascii=False)

    if payload.event == "ermis.completed":
        elig = (payload.eligibility or "").strip().lower()
        lead.ermis_status = "eligible" if elig == "eligible" else ("ineligible" if elig == "ineligible" else lead.ermis_status)
        lead.ermis_completed_at = datetime.utcnow()
        # Nudge a completed-eligible lead up the pipeline if still fresh
        if lead.ermis_status == "eligible" and lead.status in ("NEW LEAD", "CALL"):
            lead.status = "HOT"
    elif payload.event == "ermis.progress":
        if not lead.ermis_status:
            lead.ermis_status = "in_progress"

    db.commit()
    return {"ok": True, "lead_id": lead.id, "ermis_status": lead.ermis_status}
