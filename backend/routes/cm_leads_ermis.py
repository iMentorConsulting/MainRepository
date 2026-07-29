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
from datetime import datetime, date
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

# Grammatical gender of consultants → correct Greek article (Ο/Η)
_FEMININE_CONSULTANTS = {"ELEFTHERIA", "STELLA", "VALLIA", "SOFIA", "ΕΛΕΥΘΕΡΙΑ", "ΣΤΕΛΛΑ", "ΒΑΛΙΑ", "ΒΑΛΛΙΑ", "ΣΟΦΙΑ"}
_MASCULINE_CONSULTANTS = {"HARIS", "CHRISTOS", "ΧΑΡΗΣ", "ΧΡΗΣΤΟΣ"}


def _consultant_article(name: Optional[str]) -> str:
    if not name:
        return "ο/η"
    n = name.strip().upper()
    if n in _FEMININE_CONSULTANTS:
        return "η"
    if n in _MASCULINE_CONSULTANTS:
        return "ο"
    return "ο/η"


# Greek display names for consultants (LOGISTIS/ΕΡΜΗΣ + client messages use these)
_CONSULTANT_GR = {
    "ELEFTHERIA": "Ελευθερία", "CHRISTOS": "Χρήστος", "VALLIA": "Βάλλια",
    "STELLA": "Στέλλα", "SOFIA": "Σοφία", "HARIS": "Χάρης",
}


def _consultant_display(name: Optional[str]) -> Optional[str]:
    if not name:
        return name
    return _CONSULTANT_GR.get(name.strip().upper(), name)


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
    if l.total_amount: summary_lines.append(f"- Ποσό: {l.total_amount}")
    if l.source: summary_lines.append(f"- Referrer / Πηγή: {l.source}")
    if l.notes: summary_lines.append(f"- Σχόλια φόρμας: {l.notes}")
    for k, v in extra_fields.items():
        if v not in (None, ""):
            summary_lines.append(f"- {k}: {v}")

    # In-app consultant comments — ΕΡΜΗΣ should read and use these in the conversation.
    comments = sorted(l.comments, key=lambda c: c.created_at or datetime.min)
    comment_list = [
        {"author": c.author_name, "text": c.content,
         "ts": c.created_at.isoformat() if c.created_at else None}
        for c in comments if (c.content or "").strip()
    ]
    if comment_list:
        summary_lines.append("ΣΧΟΛΙΑ ΣΥΜΒΟΥΛΩΝ (λάβε τα υπόψη στη συζήτηση):")
        for c in comment_list:
            summary_lines.append(f"  • {c['author'] or 'σύμβουλος'}: {c['text']}")

    consultant_gr = _consultant_display(l.assigned_name)
    if l.assigned_name:
        art = _consultant_article(l.assigned_name)
        summary_lines.append(
            f"- Υπεύθυνος σύμβουλος: {consultant_gr} "
            f"(ενημέρωσε τον πελάτη ότι {art} {consultant_gr} θα επικοινωνήσει μαζί του σύντομα)."
        )
    context_summary = "\n".join(summary_lines)

    return {
        "leadRef": str(l.id),
        "afm": l.afm,                     # VAT → LOGISTIS runs the ΑΑΔΕ lookup + program matching
        "program": l.program,
        "serviceType": l.service_type,
        "consultant": consultant_gr,      # Greek name; ΕΡΜΗΣ tells the client this person will call shortly
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
            "consultant": consultant_gr,
            "source": l.source,          # Referrer
            "notes": l.notes,
            "extraFields": extra_fields,
            "comments": comment_list,    # consultant comments for ΕΡΜΗΣ to use
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
        # Reflect progress immediately in the UI
        if l.ermis_status not in ("in_progress", "eligible", "ineligible"):
            l.ermis_status = "starting"
            l.ermis_started_at = l.ermis_started_at or datetime.utcnow()
            db.commit()
        secret = _shared_secret()
        if not secret:
            log.error("ΕΡΜΗΣ: IMENTOR_PORTAL_API_KEY not set")
            l.ermis_status = "error"; l.ermis_error = "IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί στο CM"; db.commit(); return

        try:
            resp = requests.post(ERMIS_SESSION_URL, json=_build_ermis_body(l),
                                 headers={"x-api-key": secret}, timeout=(6, 60))
        except requests.Timeout:
            log.error("ΕΡΜΗΣ session create timed out")
            l.ermis_status = "error"; l.ermis_error = f"Timeout προς LOGISTIS ({ERMIS_SESSION_URL})"; db.commit(); return
        except Exception as exc:
            log.exception("ΕΡΜΗΣ session create failed: %s", exc)
            l.ermis_status = "error"; l.ermis_error = f"Σφάλμα σύνδεσης: {exc}"[:500]; db.commit(); return

        if not resp.ok:
            log.error("ΕΡΜΗΣ session create HTTP %s: %s", resp.status_code, resp.text[:300])
            l.ermis_status = "error"; l.ermis_error = f"LOGISTIS HTTP {resp.status_code}: {resp.text[:300]}"[:500]; db.commit(); return

        try:
            data = resp.json()
        except Exception:
            l.ermis_status = "error"; l.ermis_error = f"Μη-JSON απάντηση LOGISTIS: {resp.text[:300]}"[:500]; db.commit(); return

        token = data.get("token")
        chat_url = data.get("chatUrl") or data.get("chat_url")
        if not token or not chat_url:
            log.error("ΕΡΜΗΣ invalid response (no token/chatUrl): %s", str(data)[:300])
            l.ermis_status = "error"; l.ermis_error = f"Λείπει token/chatUrl στην απάντηση: {str(data)[:300]}"[:500]; db.commit(); return

        l.ermis_token = token
        l.ermis_chat_url = chat_url
        l.ermis_status = "in_progress"
        l.ermis_error = None
        l.ermis_started_at = datetime.utcnow()
        db.commit()

        if send_link and (channel or "both") != "none":
            name = l.name or "συνεργάτη"
            prog = l.program or "την υπηρεσία που σας ενδιαφέρει"
            prog_label = f"«{l.program}»" if l.program else "που σας ενδιαφέρει"
            _art = _consultant_article(l.assigned_name).capitalize()  # Ο / Η / Ο/Η
            _consultant_gr = _consultant_display(l.assigned_name)
            consultant_line = (f"📞 {_art} {_consultant_gr} από την i-Mentor θα επικοινωνήσει σύντομα μαζί σας.\n"
                               if l.assigned_name else "")

            # ── Viber (emoji + Unicode dividers; Viber ignores markdown bold) ──
            viber_msg = (
                f"Αγαπητέ/ή {name},\n\n"
                f"📩 Λάβαμε το ενδιαφέρον σας για το πρόγραμμα {prog_label}.\n"
                "━━━━━━━━━━━━━━━\n"
                "🤖 Μιλήστε τώρα με τον «ΕΡΜΗ», τον ψηφιακό μας σύμβουλο, που κάνει\n"
                "✅ ΔΩΡΕΑΝ έλεγχο επιλεξιμότητας\n"
                "⏱️ σε δευτερόλεπτα (~2 λεπτά)\n"
                "━━━━━━━━━━━━━━━\n"
                f"👉 Ξεκινήστε εδώ: {chat_url}\n\n"
                f"{consultant_line}"
                "i-Mentor Consulting"
            )

            # ── Email (rich HTML: bold, dividers, icons, CTA button) ──
            email_subject = f"i-Mentor Consulting — Προαξιολόγηση για {prog_label} με τον ΕΡΜΗ"
            consultant_html = (
                f'<p style="margin:0 0 10px;color:#374151;">📞 {_art} <b>{_consultant_gr}</b> '
                f'από την i-Mentor θα επικοινωνήσει σύντομα μαζί σας.</p>' if l.assigned_name else ""
            )
            email_html = f"""<html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#1e3a5f;padding:22px 24px;border-radius:10px 10px 0 0;text-align:center;">
    <h2 style="color:#ffffff;margin:0;">i-Mentor Consulting</h2>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:26px 24px;">
    <p style="font-size:16px;margin:0 0 14px;">Αγαπητέ/ή <b>{name}</b>,</p>
    <p style="margin:0 0 16px;font-size:15px;">📩 Λάβαμε το ενδιαφέρον σας για το πρόγραμμα
       <b style="color:#1e3a5f;">{prog_label}</b>.</p>
    <hr style="border:none;border-top:2px solid #eef2f7;margin:18px 0;">
    <div style="background:#f0f7ff;border-radius:8px;padding:16px 18px;">
      <p style="margin:0 0 8px;font-size:16px;">🤖 <b>Μιλήστε τώρα με τον «ΕΡΜΗ»</b></p>
      <p style="margin:0;color:#374151;">τον ψηφιακό μας σύμβουλο, που κάνει <b>✅ ΔΩΡΕΑΝ έλεγχο επιλεξιμότητας</b> ⏱️ σε δευτερόλεπτα (περίπου 2 λεπτά).</p>
    </div>
    <div style="text-align:center;margin:26px 0;">
      <a href="{chat_url}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;">▶️ Ξεκινήστε την προαξιολόγηση</a>
    </div>
    {consultant_html}
    <hr style="border:none;border-top:1px solid #eee;margin:18px 0;">
    <p style="font-size:12px;color:#9ca3af;margin:0;">i-Mentor Consulting · Λάβατε αυτό το μήνυμα επειδή συμπληρώσατε φόρμα ενδιαφέροντος.</p>
  </div>
</div></body></html>"""

            ch = channel or "both"
            if ch in ("viber", "both") and l.phone:
                ok, err = _send_viber(l.phone, viber_msg, l.name or "", actor_name, l.service_type or "")
                db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                             recipient_name=l.name or "", recipient_contact=l.phone,
                                             subject="ΕΡΜΗΣ link", content=viber_msg,
                                             status="sent" if ok else "failed", sent_by=actor_name))
            if ch in ("email", "both") and l.email:
                ok, err = _send_email(l.email, email_subject, viber_msg, html_override=email_html)
                db.add(CMLeadNotificationLog(lead_id=l.id, notification_type="ermis_link",
                                             recipient_name=l.name or "", recipient_contact=l.email,
                                             subject=email_subject, content=email_subject,
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

    # LOGISTIS requires ΑΦΜ (for the ΑΑΔΕ lookup) + program. Fail fast with a clear
    # message so the consultant can fill them in (Επεξεργασία) and retry.
    missing = []
    if not (l.afm or "").strip():
        missing.append("ΑΦΜ")
    if not (l.program or "").strip():
        missing.append("Πρόγραμμα")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Λείπει {' και '.join(missing)} από το lead. Συμπληρώστε το (Επεξεργασία) πριν την έναρξη ΕΡΜΗΣ.",
        )

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
    # Optional contact fields (ΓΕΜΗ prospects that we auto-create)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    program: Optional[str] = None
    serviceType: Optional[str] = None
    eligibility: Optional[str] = None       # eligible | ineligible
    transcript: Optional[object] = None     # list[{role,text,ts}] or markdown string
    # AADE business data LOGISTIS fetched + created (regdate, address, ΚΑΔ list…)
    business: Optional[dict] = None
    # Automatic program matching result [{title, status}]
    matchedPrograms: Optional[list] = None
    completedAt: Optional[str] = None


# ── In-memory ring buffer for ΕΡΜΗΣ webhook hits (diagnostic; lost on restart) ──
_recent_ermis_hits: list = []


def _record_ermis_hit(**kw) -> None:
    from datetime import datetime as _dt
    kw["at"] = _dt.utcnow().isoformat() + "Z"
    _recent_ermis_hits.insert(0, kw)
    del _recent_ermis_hits[100:]


@router.get("/ermis/webhook-log")
def ermis_webhook_log(current_user: CMUser = Depends(get_current_user)):
    """Last 100 inbound ermis webhook hits — event, token, afm, leadRef, resolved lead_id, outcome."""
    return {"hits": _recent_ermis_hits}


@router.post("/ermis/webhook")
def ermis_webhook(
    payload: ErmisWebhookIn,
    _key: None = Depends(_verify_portal_key),
    db: Session = Depends(get_db),
):
    from routes.cm_leads import normalize_afm, clean_email, clean_phone, find_gemi_lead, program_category_from_title
    biz_data = payload.business or {}
    afm = normalize_afm(payload.afm or biz_data.get("afm"))

    # Resolve lead: token → leadRef → ΑΦΜ. If none, auto-create (ΓΕΜΗ prospect that
    # completed ΕΡΜΗΣ via email campaign — no leadRef of ours).
    lead = None
    if payload.leadRef:
        try:
            lead = db.query(CMLead).filter(CMLead.id == int(payload.leadRef)).first()
        except (ValueError, TypeError):
            lead = None
    # ΓΕΜΗ: resolve by token, else by ΑΦΜ + program (NOT ΑΦΜ alone — the same client
    # can have one lead per program).
    if lead is None:
        lead = find_gemi_lead(db, afm, program_title=payload.program,
                              program_category=program_category_from_title(payload.program),
                              token=payload.token)

    created = False
    if lead is None:
        if not afm:
            raise HTTPException(status_code=404, detail="Δεν βρέθηκε lead και λείπει ΑΦΜ για δημιουργία")
        # Auto-create a HOT lead from the ΓΕΜΗ prospect. No Viber/Email/link is sent
        # (the ΕΡΜΗΣ conversation is already done) — only a consultant call is needed.
        # ΓΕΜΗ leads are auto-assigned to ELEFTHERIA.
        from models_cases import CMUser as _CMUser
        _agent = db.query(_CMUser).filter(_CMUser.full_name.ilike("%Ελευθερία%")).first()
        lead = CMLead(
            name=payload.name or biz_data.get("onomasia") or f"ΓΕΜΗ {afm}",
            afm=afm,
            phone=clean_phone(payload.phone),
            email=clean_email(payload.email),
            program=program_category_from_title(payload.program),
            program_title=(payload.program or "").strip() or None,
            service_type=payload.serviceType or None,
            status="HOT",
            source="LOGISTIS ΓΕΜΗ",
            assigned_agent_id=_agent.id if _agent else None,
            assigned_name="ELEFTHERIA",
            ermis_token=payload.token or None,
            next_call_date=date.today(),
        )
        db.add(lead)
        db.flush()
        created = True
    else:
        # Backfill program_title/token on an existing lead so future events match it.
        if payload.program and not lead.program_title:
            lead.program_title = payload.program.strip()
        if payload.token and not lead.ermis_token:
            lead.ermis_token = payload.token

    # Store the AADE business profile + program matching LOGISTIS returned.
    # Keyed by AFM in the shared CMBusinessProfile cache (reused across the app).
    afm = afm or (lead.afm or "").strip()
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

        # Rescue: if the transcript landed on the wrong lead, copy it to a better one.
        # Cases covered:
        # 1. Landed on low-status (CANCEL/CALL/NEW LEAD) but a HOT lead exists → copy up
        # 2. Landed on auto-created ΓΕΜΗ lead (no portal link, ELEFTHERIA) but the real
        #    accepted lead (has portal_case_number, different consultant) also exists for
        #    same AFM+program — handles the race where accept_assignment fires AFTER webhook
        if lead.ermis_transcript and afm:
            _prog_cat = (lead.program or "").strip()
            from routes.cm_leads import _GEMI_STATUS_RANK, _is_logistis_lead
            rival_cands = db.query(CMLead).filter(
                CMLead.afm == afm, CMLead.id != lead.id,
            ).all()
            _my_rank = _GEMI_STATUS_RANK.get(lead.status or "", 0)
            better = [
                l for l in rival_cands
                if _is_logistis_lead(l)
                and (l.program or "") == _prog_cat
                and not l.ermis_transcript
                and (
                    # higher status → always prefer
                    _GEMI_STATUS_RANK.get(l.status or "", 0) > _my_rank
                    # same status but has a portal case link (was accepted) and we don't
                    or (
                        _GEMI_STATUS_RANK.get(l.status or "", 0) == _my_rank
                        and l.portal_case_number
                        and not lead.portal_case_number
                    )
                )
            ]
            if better:
                target = max(better, key=lambda l: (
                    _GEMI_STATUS_RANK.get(l.status or "", 0),
                    1 if l.portal_case_number else 0,
                    l.id,
                ))
                target.ermis_transcript = lead.ermis_transcript
                target.ermis_status = lead.ermis_status
                target.ermis_completed_at = lead.ermis_completed_at
                if payload.token and not target.ermis_token:
                    target.ermis_token = payload.token
                log.info(
                    "ΕΡΜΗΣ rescue: transcript from lead %s (status=%s, portal=%s) → lead %s (status=%s, portal=%s)",
                    lead.id, lead.status, lead.portal_case_number,
                    target.id, target.status, target.portal_case_number,
                )

    elif payload.event in ("ermis.progress", "ermis.business_ready"):
        if not lead.ermis_status:
            lead.ermis_status = "in_progress"

    db.commit()
    _record_ermis_hit(
        event=payload.event,
        token=payload.token,
        afm=afm,
        leadRef=payload.leadRef,
        program=payload.program,
        eligibility=payload.eligibility,
        resolved_lead_id=lead.id,
        created=created,
        outcome=f"lead #{lead.id} ermis_status={lead.ermis_status}",
    )
    return {"ok": True, "lead_id": lead.id, "ermis_status": lead.ermis_status, "created": created}


@router.get("/{lead_id}/ermis/debug")
def ermis_debug(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Diagnostic: show all ΕΡΜΗΣ-related fields on this lead plus any same-AFM leads
    that have a transcript (to find where a missing conversation ended up)."""
    from routes.cm_leads import _is_logistis_lead
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")

    siblings = []
    if l.afm:
        others = db.query(CMLead).filter(CMLead.afm == l.afm, CMLead.id != l.id).all()
        for o in others:
            siblings.append({
                "id": o.id,
                "name": o.name,
                "status": o.status,
                "source": o.source,
                "program": o.program,
                "program_title": o.program_title,
                "ermis_token": o.ermis_token,
                "ermis_status": o.ermis_status,
                "ermis_transcript_len": len(o.ermis_transcript or ""),
                "is_logistis_lead": _is_logistis_lead(o),
                "created_at": o.created_at.isoformat() if o.created_at else None,
            })

    # Last 20 hits from the ring buffer that mention this lead or its AFM
    related_hits = [
        h for h in _recent_ermis_hits
        if str(lead_id) in str(h.get("resolved_lead_id", ""))
        or (l.afm and h.get("afm") == l.afm)
    ][:20]

    return {
        "lead": {
            "id": l.id,
            "name": l.name,
            "afm": l.afm,
            "status": l.status,
            "source": l.source,
            "program": l.program,
            "program_title": l.program_title,
            "ermis_token": l.ermis_token,
            "ermis_chat_url": l.ermis_chat_url,
            "ermis_status": l.ermis_status,
            "ermis_error": l.ermis_error,
            "ermis_started_at": l.ermis_started_at.isoformat() if l.ermis_started_at else None,
            "ermis_completed_at": l.ermis_completed_at.isoformat() if l.ermis_completed_at else None,
            "ermis_transcript_len": len(l.ermis_transcript or ""),
            "ermis_transcript_preview": (l.ermis_transcript or "")[:300] or None,
        },
        "same_afm_leads": siblings,
        "recent_ermis_hits_for_afm": related_hits,
    }
