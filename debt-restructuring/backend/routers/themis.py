import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Lead, ThemisSession, AppConfig
from auth_utils import get_current_user
from themis_ai import themis_enabled, get_reply, parse_verdict
from routers.notifications import create_notification, ADMIN_RECIPIENT

router = APIRouter(prefix="/themis", tags=["themis"])

_ATHENS = ZoneInfo("Europe/Athens")


def _now_iso() -> str:
    return datetime.now(_ATHENS).replace(tzinfo=None).isoformat()


def _greeting(lead: Lead) -> str:
    name = lead.name or "εκεί"
    return (
        f"Γεια σου {name}! Είμαι η Θέμις, η ψηφιακή βοηθός της I MENTOR Consulting. "
        "Πριν σε καλέσει ο σύμβουλός σου, θα ήθελα να σου κάνω μερικές σύντομες ερωτήσεις "
        "ώστε να ετοιμάσουμε καλύτερα την υπόθεσή σου. Μπορούμε να ξεκινήσουμε;"
    )


def _get_settings(db: Session) -> tuple:
    row = db.query(AppConfig).filter(AppConfig.key == "themis_settings").first()
    data = json.loads(row.value) if row and row.value else {}
    return data.get("questions", []), data.get("instructions", "")


def _get_lead_or_404(db: Session, token: str) -> Lead:
    if not themis_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    lead = db.query(Lead).filter(Lead.themis_token == token).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Not found")
    return lead


@router.get("/{lead_token}")
def get_session(lead_token: str, db: Session = Depends(get_db)):
    lead = _get_lead_or_404(db, lead_token)
    session = db.query(ThemisSession).filter(ThemisSession.lead_id == lead.id).order_by(ThemisSession.id.desc()).first()
    if not session:
        session = ThemisSession(
            lead_id=lead.id,
            transcript=[{"role": "themis", "text": _greeting(lead), "at": _now_iso()}],
            status="in_progress",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    return {
        "transcript": session.transcript or [],
        "status": session.status,
        "done": session.status != "in_progress",
    }


class ThemisMessageIn(BaseModel):
    text: str


@router.post("/{lead_token}/message")
async def post_message(lead_token: str, data: ThemisMessageIn, db: Session = Depends(get_db)):
    lead = _get_lead_or_404(db, lead_token)
    session = db.query(ThemisSession).filter(ThemisSession.lead_id == lead.id).order_by(ThemisSession.id.desc()).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found — call GET first")
    if session.status != "in_progress":
        return {"reply": "", "status": session.status, "done": True}

    transcript = list(session.transcript or [])
    transcript.append({"role": "lead", "text": data.text, "at": _now_iso()})

    questions, instructions = _get_settings(db)
    raw_reply = await get_reply(lead, questions, instructions, transcript)
    clean_reply, verdict = parse_verdict(raw_reply)

    transcript.append({"role": "themis", "text": clean_reply, "at": _now_iso()})
    session.transcript = transcript

    if verdict:
        session.status = verdict
        session.verdict_reason = clean_reply
        comments = list(lead.app_comments or [])
        if verdict == "eligible":
            lead.status = "hot"
            comments.append({
                "text": f"🤖 Η Θέμις ολοκλήρωσε τον προκαταρκτικό έλεγχο — ΕΠΙΛΕΞΙΜΟΣ. {clean_reply}",
                "author": "ΘΕΜΙΣ",
                "at": _now_iso(),
            })
            lead.app_comments = comments
            recipient = lead.assigned_to or ADMIN_RECIPIENT
            create_notification(
                db, recipient, "themis_eligible",
                "Νέο επιλέξιμο lead από τη Θέμις",
                f"Η Θέμις ολοκλήρωσε τον έλεγχο για τον/την {lead.name or 'lead'} — φαίνεται επιλέξιμος/η.",
                link="/leads",
            )
        else:
            lead.status = "cancelled"
            comments.append({
                "text": f"🤖 Η Θέμις ολοκλήρωσε τον προκαταρκτικό έλεγχο — ΜΗ ΕΠΙΛΕΞΙΜΟΣ. {clean_reply}",
                "author": "ΘΕΜΙΣ",
                "at": _now_iso(),
            })
            lead.app_comments = comments
        lead.updated_at = datetime.now(_ATHENS).replace(tzinfo=None)

    db.commit()
    return {"reply": clean_reply, "status": session.status, "done": session.status != "in_progress"}


@router.get("/lead/{lead_id}/transcript")
def get_transcript(lead_id: int, _: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Staff-only transcript viewer (auth required) — surfaced as a link from the Leads page."""
    session = db.query(ThemisSession).filter(ThemisSession.lead_id == lead_id).order_by(ThemisSession.id.desc()).first()
    if not session:
        raise HTTPException(status_code=404, detail="No Θέμις session for this lead")
    return {
        "transcript": session.transcript or [],
        "status": session.status,
        "verdict_reason": session.verdict_reason or "",
    }
