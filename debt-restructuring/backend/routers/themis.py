import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Lead, ThemisSession, AppConfig
from auth_utils import get_current_user
from themis_ai import themis_enabled, get_reply, get_followup_reply, parse_verdict
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


# Rough claude-sonnet-4-5 pricing ($/1M tokens) + USD→EUR — see _session_cost_eur.
_PRICE_INPUT_PER_M = 3.00
_PRICE_OUTPUT_PER_M = 15.00
_PRICE_CACHE_WRITE_PER_M = 3.75   # 1.25x base input (5-min ephemeral cache)
_PRICE_CACHE_READ_PER_M = 0.30    # 0.1x base input
_USD_TO_EUR = 0.92                # approximate — adjust if needed


def _session_cost_eur(s) -> float:
    usd = (
        (s.input_tokens or 0) / 1_000_000 * _PRICE_INPUT_PER_M
        + (s.output_tokens or 0) / 1_000_000 * _PRICE_OUTPUT_PER_M
        + (s.cache_creation_tokens or 0) / 1_000_000 * _PRICE_CACHE_WRITE_PER_M
        + (s.cache_read_tokens or 0) / 1_000_000 * _PRICE_CACHE_READ_PER_M
    )
    return round(usd * _USD_TO_EUR, 4)


@router.get("/sessions")
def list_sessions(_: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Staff-only list of all Θέμις conversations, newest first — backs the
    'Συζητήσεις με Θέμις' menu page. Must be declared before the /{lead_token}
    catch-all route below, otherwise that route would shadow it."""
    sessions = db.query(ThemisSession).order_by(ThemisSession.id.desc()).all()
    leads = {}
    if sessions:
        lead_ids = [s.lead_id for s in sessions]
        leads = {l.id: l for l in db.query(Lead).filter(Lead.id.in_(lead_ids)).all()}

    out = []
    for s in sessions:
        lead = leads.get(s.lead_id)
        transcript = s.transcript or []
        last = transcript[-1] if transcript else None
        total_tokens = (s.input_tokens or 0) + (s.output_tokens or 0) + (s.cache_creation_tokens or 0) + (s.cache_read_tokens or 0)
        out.append({
            "lead_id": s.lead_id,
            "lead_name": lead.name if lead else "",
            "assigned_to": lead.assigned_to if lead else "",
            "status": s.status,
            "message_count": len(transcript),
            "last_message": (last or {}).get("text", ""),
            "last_message_at": (last or {}).get("at"),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "total_tokens": total_tokens,
            "cost_eur": _session_cost_eur(s),
        })
    return out


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
        # Eligibility screening is done — allow a few free-form follow-up
        # questions about how the εξωδικαστικός system works, instead of
        # locking the chat entirely.
        transcript = list(session.transcript or [])
        transcript.append({"role": "lead", "text": data.text, "at": _now_iso()})
        reply, usage = await get_followup_reply(lead, transcript)
        transcript.append({"role": "themis", "text": reply, "at": _now_iso()})
        session.transcript = transcript
        session.input_tokens = (session.input_tokens or 0) + usage["input_tokens"]
        session.output_tokens = (session.output_tokens or 0) + usage["output_tokens"]
        session.cache_creation_tokens = (session.cache_creation_tokens or 0) + usage["cache_creation_input_tokens"]
        session.cache_read_tokens = (session.cache_read_tokens or 0) + usage["cache_read_input_tokens"]
        db.commit()
        return {"reply": reply, "status": session.status, "done": True}

    transcript = list(session.transcript or [])
    transcript.append({"role": "lead", "text": data.text, "at": _now_iso()})

    questions, instructions = _get_settings(db)
    raw_reply, usage = await get_reply(lead, questions, instructions, transcript)
    clean_reply, verdict = parse_verdict(raw_reply)

    transcript.append({"role": "themis", "text": clean_reply, "at": _now_iso()})
    session.transcript = transcript
    session.input_tokens = (session.input_tokens or 0) + usage["input_tokens"]
    session.output_tokens = (session.output_tokens or 0) + usage["output_tokens"]
    session.cache_creation_tokens = (session.cache_creation_tokens or 0) + usage["cache_creation_input_tokens"]
    session.cache_read_tokens = (session.cache_read_tokens or 0) + usage["cache_read_input_tokens"]

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
