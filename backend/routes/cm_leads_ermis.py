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
import threading
from datetime import datetime
from typing import Optional, List

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user, CMUser
from database import get_db, SessionLocal
from models_cases import CMLead, CMLeadNotificationLog
from routes.cm_portal_integration import _shared_secret, _verify_portal_key, _upsert_business_profile
from routes.cm_notifications import _send_viber, _send_email

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/leads", tags=["cm-leads-ermis"])

ERMIS_SESSION_URL = os.getenv(
    "LOGISTIS_ERMIS_SESSION_URL", "https://logistis.i-mentor.gr/api/external/ermis-sessions"
)
# Public base of THIS app, used to build the webhook callback URL we hand LOGISTIS.
SELF_BASE_URL = os.getenv("SELF_PUBLIC_BASE_URL", "https://consult.i-mentor.gr")


class ErmisStartIn(BaseModel):
    send_link: Optional[bool] = True
    channel: Optional[str] = "both"  # viber | email | both | none


def _build_ermis_body(l: CMLead) -> dict:
    # Flatten program-specific fields to {label: value} for easy prompt injection
    extra_fields = {}
    for k, v in (l.program_fields or {}).items():
        if isinstance(v, dict):
            extra_fields[v.get("label") or k] = v.get("value")
        else:
            extra_fields[k] = v

    # A ready-to-inject, human-readable summary of everything we already know —
    # ΕΡΜΗΣ should treat these as ALREADY ANSWERED and never re-ask them.
    summary_lines = ["ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (μην τα ξαναρωτήσεις — θεώρησέ τα δεδομένα):"]
    if l.name: summary_lines.append(f"- Ονοματεπώνυμο/Επωνυμία: {l.name}")
    if l.afm: summary_lines.append(f"- ΑΦΜ: {l.afm}")
    if l.phone: summary_lines.append(f"- Τηλέφωνο: {l.phone}")
    if l.email: summary_lines.append(f"- Email: {l.email}")
    if l.program: summary_lines.append(f"- Πρόγραμμα ενδιαφέροντος: {l.program}")
    if l.service_type: summary_lines.append(f"- Υπηρεσία: {l.service_type}")
    if l.total_amount: summary_lines.append(f"- Ποσό: {l.total_amount}")
    if l.source: summary_lines.append(f"- Πηγή: {l.source}")
    if l.notes: summary_lines.append(f"- Σχόλια φόρμας: {l.notes}")
    for k, v in extra_fields.items():
        if v not in (None, ""):
            summary_lines.append(f"- {k}: {v}")
    if l.assigned_name:
        summary_lines.append(
            f"- Υπεύθυνος σύμβουλος: {l.assigned_name} "
            f"(ενημέρωσε τον πελάτη ότι ο/η {l.assigned_name} θα επικοινωνήσει μαζί του σύντομα)."
        )
    context_summary = "\n".join(summary_lines)

    return {
        "leadRef": str(l.id),
        "afm": l.afm,                     # VAT → LOGISTIS runs the ΑΑΔΕ lookup + program matching
        "program": l.program,
        "serviceType": l.service_type,
        "consultant": l.assigned_name,    # ΕΡΜΗΣ tells the client this person will call shortly
        "callbackUrl": f"{SELF_BASE_URL.rstrip('/')}/api/cm/leads/ermis/webhook",
        "contextSummary": context_summary,
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
            "contextSummary": context_summary,
        },
    }


def _process_ermis_session(lead_id: int, send_link: bool, channel: str, actor_name: str):
    """Runs in a background thread (own DB session): call LOGISTIS, store the
    token/chatUrl, and send the client the link. Kept off the request path so a
    slow LOGISTIS never causes a gateway timeout / Cloudflare 520."""
    db = SessionLocal()
    try:
        l = db.query(CMLead).filter(CMLead.id == lead_id).first()
        if not l:
            return
        secret = _shared_secret()
        if not secret:
            log.error("ΕΡΜΗΣ: IMENTOR_PORTAL_API_KEY not set")
            l.ermis_status = "error"; db.commit(); return

        try:
            resp = requests.post(ERMIS_SESSION_URL, json=_build_ermis_body(l),
                                 headers={"x-api-key": secret}, timeout=(6, 60))
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            log.exception("ΕΡΜΗΣ session create failed: %s", exc)
            l.ermis_status = "error"; db.commit(); return

        token = data.get("token")
        chat_url = data.get("chatUrl") or data.get("chat_url")
        if not token or not chat_url:
            log.error("ΕΡΜΗΣ invalid response (no token/chatUrl): %s", str(data)[:300])
            l.ermis_status = "error"; db.commit(); return

        l.ermis_token = token
        l.ermis_chat_url = chat_url
        l.ermis_status = "in_progress"
        l.ermis_started_at = datetime.utcnow()
        db.commit()

        if send_link and (channel or "both") != "none":
            greeting = f"Καλησπέρα {l.name}," if l.name else "Καλησπέρα,"
            viber_msg = (
                f"{greeting}\n\n"
                "λάβαμε τη φόρμα ενδιαφέροντος που συμπληρώσατε προς την i-Mentor Consulting. "
                "Μπορούμε να κάνουμε άμεσα μια σύντομη & δωρεάν προαξιολόγηση και ενημέρωση για το "
                "πρόγραμμα που σας ενδιαφέρει, μέσω του ψηφιακού μας βοηθού «ΕΡΜΗΣ».\n\n"
                f"Ξεκινήστε εδώ (2 λεπτά): {chat_url}\n\n"
                "i-Mentor Consulting"
            )
            email_subject = "i-Mentor Consulting — Γρήγορη προαξιολόγηση με τον βοηθό ΕΡΜΗ"
            email_msg = (
                f"{greeting}\n\n"
                "Λάβαμε τη φόρμα ενδιαφέροντος που συμπληρώσατε προς την i-Mentor Consulting. "
                "Ο ψηφιακός μας βοηθός «ΕΡΜΗΣ» μπορεί να σας κάνει άμεσα μια σύντομη και δωρεάν "
                "προαξιολόγηση για το πρόγραμμα που σας ενδιαφέρει και να σας ενημερώσει για τα επόμενα βήματα.\n\n"
                f"Πατήστε εδώ για να ξεκινήσετε (διαρκεί περίπου 2 λεπτά):\n{chat_url}\n\n"
                "Με εκτίμηση,\ni-Mentor Consulting"
            )
            ch = channel or "both"
            if ch in ("viber", "both") and l.phone:
                ok, err = _send_viber(l.phone, viber_msg, l.name or "", actor_name, l.service_type or "")
                db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                             recipient_name=l.name or "", recipient_contact=l.phone,
                                             subject="ΕΡΜΗΣ link", content=viber_msg,
                                             status="sent" if ok else "failed", sent_by=actor_name))
            if ch in ("email", "both") and l.email:
                ok, err = _send_email(l.email, email_subject, email_msg)
                db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                             recipient_name=l.name or "", recipient_contact=l.email,
                                             subject=email_subject, content=email_msg,
                                             status="sent" if ok else "failed", sent_by=actor_name))
            db.commit()
    finally:
        db.close()


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
    if not _shared_secret():
        raise HTTPException(status_code=500, detail="IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί")

    # Mark as starting and return immediately; the LOGISTIS call + link send run in
    # a background thread so the web request never blocks on a slow upstream.
    l.ermis_status = "starting"
    l.ermis_started_at = datetime.utcnow()
    db.commit()

    threading.Thread(
        target=_process_ermis_session,
        args=(l.id, bool(req.send_link), req.channel or "both", current_user.full_name),
        daemon=True,
    ).start()

    return {"ok": True, "status": "starting"}


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
    afm: Optional[str] = None
    eligibility: Optional[str] = None       # eligible | ineligible
    transcript: Optional[object] = None     # list[{role,text,ts}] or markdown string
    # AADE business data LOGISTIS fetched + created (regdate, address, ΚΑΔ list…)
    business: Optional[dict] = None
    # Automatic program matching result [{title, status}]
    matchedPrograms: Optional[list] = None
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

    # Store the AADE business profile + program matching LOGISTIS returned.
    # Keyed by AFM in the shared CMBusinessProfile cache (reused across the app).
    afm = (payload.afm or (payload.business or {}).get("afm") or lead.afm or "").strip()
    if (payload.business is not None or payload.matchedPrograms is not None) and afm:
        biz = dict(payload.business or {})
        biz["afm"] = afm
        if payload.matchedPrograms is not None:
            biz["matchedPrograms"] = payload.matchedPrograms
        try:
            _upsert_business_profile(db, biz)
        except Exception as exc:
            log.exception("ΕΡΜΗΣ business upsert failed: %s", exc)
        if not lead.afm:
            lead.afm = afm

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
    elif payload.event in ("ermis.progress", "ermis.business_ready"):
        if not lead.ermis_status:
            lead.ermis_status = "in_progress"

    db.commit()
    return {"ok": True, "lead_id": lead.id, "ermis_status": lead.ermis_status}
