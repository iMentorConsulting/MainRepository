"""
Leads management API.

Prospective clients collected via per-program Google Sheets (see cm_leads_sync.py),
pre-screened by the ΕΡΜΗΣ AI assistant (see cm_leads_ermis.py), and converted into
CMCase records once they become deals.
"""
import re
import json
import logging
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, and_, text as sa_text, func as sa_func
from sqlalchemy.orm import Session

from auth_cases import get_current_user, CMUser
from database import get_db
from models_cases import (
    CMLead, CMLeadComment, CMLeadNotificationLog, CMCase, LEAD_STATUSES,
)
from pipelines import get_all_statuses_for_program
from routes.cm_notifications import _send_viber, _send_email
from routes.cases import case_to_dict

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/leads", tags=["cm-leads"])

PAGE_SIZE = 50


def _phone_key(phone: Optional[str]) -> str:
    """Digits-only, last 10 (Greek numbers) — for duplicate comparison across
    formatting variants (+30, spaces, dashes)."""
    d = re.sub(r"\D", "", phone or "")
    return d[-10:] if len(d) >= 10 else d


def normalize_afm(afm):
    """Greek ΑΦΜ is always 9 digits; users sometimes drop the leading zero.
    Pad an 8-digit value to 9 (e.g. '56234565' -> '056234565')."""
    if afm is None:
        return None
    s = str(afm).strip()
    if s == "":
        return None
    if s.isdigit() and len(s) == 8:
        return "0" + s
    return s


# Common email domain typos → correction. 'f' is next to 'g' on the keyboard, so
# Greek webmail .gr addresses are often mistyped as .fr.
_EMAIL_DOMAIN_FIXES = {
    "yahoo.fr": "yahoo.gr",
    "yaho.gr": "yahoo.gr",
    "yahoo.gr.com": "yahoo.gr",
    "gmail.con": "gmail.com",
    "gmail.gr": "gmail.com",
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "hotmail.con": "hotmail.com",
}


def clean_email(email):
    """Trim/spaces, lowercase the domain, and fix common typos (e.g. yahoo.fr→yahoo.gr)."""
    if not email:
        return None
    s = str(email).strip().replace(" ", "")
    if s == "":
        return None
    if "@" not in s:
        return s
    local, _, domain = s.rpartition("@")
    domain = domain.lower()
    domain = _EMAIL_DOMAIN_FIXES.get(domain, domain)
    return f"{local}@{domain}" if local else None


def program_category_from_title(title):
    """Map an exact program title to one of the 4 CM categories (for filter/display)."""
    t = (title or "").upper()
    if "ΜΙΚΡΟ" in t:
        return "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"
    if "ΔΥΠΑ" in t or "ΟΑΕΔ" in t or "DYPA" in t:
        return "ΔΥΠΑ"
    if "ΑΝΑΚΑΙΝ" in t:
        return "ΑΝΑΚΑΙΝΙΖΩ"
    if "ΕΣΠΑ" in t:
        return "ΕΣΠΑ"
    return None


def find_gemi_lead(db: Session, afm, program_title=None, token=None):
    """Resolve a ΓΕΜΗ lead by token first, else by ΑΦΜ + program title. The same
    ΑΦΜ can have several leads (one per program), so ΑΦΜ alone is NOT the key.
    Prefers a LOGISTIS/ΕΡΜΗΣ lead (the one carrying the transcript)."""
    if token:
        l = db.query(CMLead).filter(CMLead.ermis_token == token).first()
        if l:
            return l
    afm = normalize_afm(afm)
    if not afm:
        return None
    q = db.query(CMLead).filter(CMLead.afm == afm)
    if program_title:
        q = q.filter(sa_func.lower(sa_func.coalesce(CMLead.program_title, "")) == program_title.strip().lower())
    leads = q.order_by(CMLead.id.asc()).all()
    if not leads:
        return None
    for l in leads:
        if (l.source or "").upper().startswith("LOGISTIS") or l.ermis_transcript or l.ermis_token:
            return l
    return leads[0]


def maybe_autostart_ermis(lead: CMLead, actor_name: str = "auto") -> bool:
    """If a lead has an ΑΦΜ, is an open prospect and hasn't been sent yet, kick off
    a ΕΡΜΗΣ screening in the background (LOGISTIS does the ΑΑΔΕ lookup + matching).
    Returns True if a session was started."""
    import threading
    if not (lead.afm or "").strip():
        return False
    if lead.status in ("CANCEL", "DEAL"):
        return False
    if lead.ermis_token or lead.ermis_status in ("starting", "in_progress", "eligible", "ineligible"):
        return False
    try:
        from routes.cm_leads_ermis import _process_ermis_session
    except Exception:
        return False
    threading.Thread(
        target=_process_ermis_session,
        args=(lead.id, True, "both", actor_name),
        daemon=True,
    ).start()
    return True


# ── Serialization ───────────────────────────────────────────────────────────

def _comment_to_dict(c: CMLeadComment) -> dict:
    return {
        "id": c.id,
        "content": c.content,
        "author_name": c.author_name,
        "edited": bool(c.edited),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def lead_to_dict(l: CMLead, include_comments: bool = False, last_comment: dict = None,
                 matched_programs: list = None) -> dict:
    transcript = None
    if l.ermis_transcript:
        try:
            transcript = json.loads(l.ermis_transcript)
        except (ValueError, TypeError):
            transcript = l.ermis_transcript
    # Display name for the consultant: prefer the raw sheet name, else the linked user
    consultant = l.assigned_name or (l.assigned_agent.full_name if l.assigned_agent else None)
    data = {
        "id": l.id,
        "name": l.name,
        "phone": l.phone,
        "phone2": l.phone2,
        "email": l.email,
        "afm": l.afm,
        "program": l.program,
        "program_title": getattr(l, "program_title", None),
        "service_type": l.service_type,
        "total_amount": l.total_amount or 0,
        "status": l.status,
        "assigned_agent_id": l.assigned_agent_id,
        "assigned_agent_name": l.assigned_agent.full_name if l.assigned_agent else None,
        "assigned_name": l.assigned_name,
        "consultant": consultant,
        "source": l.source,
        "notes": l.notes,
        "next_call_date": l.next_call_date.isoformat() if l.next_call_date else None,
        "linked_case_id": l.linked_case_id,
        "portal_case_number": getattr(l, "portal_case_number", None),
        "portal_case_link": getattr(l, "portal_case_link", None),
        "ermis_token": l.ermis_token,
        "ermis_chat_url": l.ermis_chat_url,
        "ermis_status": l.ermis_status,
        "ermis_error": l.ermis_error,
        "ermis_transcript": transcript,
        "ermis_started_at": l.ermis_started_at.isoformat() if l.ermis_started_at else None,
        "ermis_completed_at": l.ermis_completed_at.isoformat() if l.ermis_completed_at else None,
        "program_fields": l.program_fields or {},
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
        "last_comment": last_comment,
        "matched_programs": matched_programs or [],
    }
    if include_comments:
        data["comments"] = [_comment_to_dict(c) for c in sorted(l.comments, key=lambda x: x.created_at or datetime.min)]
    return data


# ── Pydantic ────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    email: Optional[str] = None
    afm: Optional[str] = None
    program: Optional[str] = None
    service_type: Optional[str] = None
    total_amount: Optional[float] = 0
    status: Optional[str] = "NEW LEAD"
    assigned_agent_id: Optional[int] = None
    assigned_name: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    next_call_date: Optional[date] = None
    program_fields: Optional[dict] = None
    send_ermis: Optional[bool] = True   # auto-start ΕΡΜΗΣ on create (if ΑΦΜ present)


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    email: Optional[str] = None
    afm: Optional[str] = None
    program: Optional[str] = None
    service_type: Optional[str] = None
    total_amount: Optional[float] = None
    status: Optional[str] = None
    assigned_agent_id: Optional[int] = None
    assigned_name: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    next_call_date: Optional[date] = None
    program_fields: Optional[dict] = None


class CommentIn(BaseModel):
    content: str


class SendIn(BaseModel):
    notification_type: str  # viber | email | both
    message: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


# ── List / filter ───────────────────────────────────────────────────────────

@router.get("/")
def list_leads(
    status: Optional[str] = None,
    exclude_status: Optional[str] = None,
    agent_id: Optional[int] = None,
    consultant: Optional[str] = None,
    program: Optional[str] = None,
    reminder: Optional[str] = None,   # overdue | today | week | none
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    sort: Optional[str] = "created_at",
    direction: Optional[str] = "desc",
    page: int = 1,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CMLead)
    if status:
        query = query.filter(CMLead.status.in_([s.strip() for s in status.split(",") if s.strip()]))
    if exclude_status:
        query = query.filter(~CMLead.status.in_([s.strip() for s in exclude_status.split(",") if s.strip()]))
    if agent_id is not None:
        query = query.filter(CMLead.assigned_agent_id == agent_id)
    if consultant:
        query = query.filter(CMLead.assigned_name == consultant)
    if program:
        query = query.filter(CMLead.program == program)
    if reminder:
        today = date.today()
        if reminder == "overdue":
            query = query.filter(CMLead.next_call_date != None, CMLead.next_call_date < today)  # noqa: E711
        elif reminder == "today":
            query = query.filter(CMLead.next_call_date == today)
        elif reminder == "week":
            from datetime import timedelta
            query = query.filter(CMLead.next_call_date >= today, CMLead.next_call_date <= today + timedelta(days=7))
        elif reminder == "none":
            query = query.filter(CMLead.next_call_date == None)  # noqa: E711
    if date_from:
        query = query.filter(CMLead.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(CMLead.created_at <= datetime.combine(date_to, datetime.max.time()))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            CMLead.name.ilike(like),
            CMLead.phone.ilike(like),
            CMLead.phone2.ilike(like),
            CMLead.email.ilike(like),
            CMLead.afm.ilike(like),
        ))

    total = query.count()

    sort_col = {
        "name": CMLead.name,
        "phone": CMLead.phone,
        "email": CMLead.email,
        "status": CMLead.status,
        "next_call_date": CMLead.next_call_date,
        "total_amount": CMLead.total_amount,
        "created_at": CMLead.created_at,
        "consultant": CMLead.assigned_name,
        "assigned_agent_id": CMLead.assigned_agent_id,
    }.get(sort, CMLead.created_at)
    sort_col = sort_col.desc() if (direction or "desc").lower() == "desc" else sort_col.asc()

    page = max(1, page)
    rows = query.order_by(sort_col).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).all()

    # Build a last-comment map for the page in one query (avoids N+1).
    last_map: dict = {}
    lead_ids = [l.id for l in rows]
    if lead_ids:
        comments = (
            db.query(CMLeadComment)
            .filter(CMLeadComment.lead_id.in_(lead_ids))
            .order_by(CMLeadComment.lead_id, CMLeadComment.created_at.desc())
            .all()
        )
        for c in comments:
            if c.lead_id not in last_map:  # first per lead = newest (desc order)
                last_map[c.lead_id] = {
                    "content": c.content,
                    "author_name": c.author_name,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }

    # Matched programs per lead (by ΑΦΜ), from the cached AADE business profiles.
    prog_map: dict = {}
    afms = list({(l.afm or "").strip() for l in rows if (l.afm or "").strip()})
    if afms:
        from models_cases import CMBusinessProfile, CMBusinessMatchedProgram
        q = (
            db.query(CMBusinessProfile.afm, CMBusinessMatchedProgram.title, CMBusinessMatchedProgram.status)
            .join(CMBusinessMatchedProgram, CMBusinessMatchedProgram.business_id == CMBusinessProfile.id)
            .filter(CMBusinessProfile.afm.in_(afms))
        )
        for afm, title, status in q:
            prog_map.setdefault(afm, []).append({"title": title, "status": status})

    return {
        "items": [
            lead_to_dict(l, last_comment=last_map.get(l.id),
                         matched_programs=prog_map.get((l.afm or "").strip()))
            for l in rows
        ],
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
    }


@router.get("/filter-options")
def filter_options(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from models_cases import CMUser as _U
    agents = db.query(_U.id, _U.full_name).all()
    programs = [p[0] for p in db.query(CMLead.program).distinct().all() if p[0]]
    consultants = [c[0] for c in db.query(CMLead.assigned_name).distinct().all() if c[0]]
    # Status counts across all leads (for the filter chips)
    status_counts = {s: c for s, c in db.query(CMLead.status, sa_func.count(CMLead.id)).group_by(CMLead.status).all()}
    return {
        "statuses": LEAD_STATUSES,
        "agents": [{"id": a[0], "name": a[1]} for a in agents],
        "programs": programs,
        "consultants": sorted(consultants),
        "status_counts": status_counts,
        "total": sum(status_counts.values()),
    }


@router.get("/reports/daily-volume")
def report_daily_volume(
    days: int = 30,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(sa_func.date(CMLead.created_at).label("d"), sa_func.count(CMLead.id))
        .group_by("d").order_by("d").all()
    )
    return [{"date": str(r[0]), "count": r[1]} for r in rows][-days:]


@router.get("/reports/status-distribution")
def report_status_distribution(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(CMLead.status, sa_func.count(CMLead.id)).group_by(CMLead.status).all()
    by_status = {r[0]: r[1] for r in rows}
    total = sum(by_status.values())
    deals = by_status.get("DEAL", 0)
    return {
        "by_status": by_status,
        "total": total,
        "conversion_rate": (deals / total) if total else 0,
    }


@router.get("/reports/employee-performance")
def report_employee_performance(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from models_cases import CMUser as _U
    rows = (
        db.query(CMLead.assigned_agent_id, CMLead.status, sa_func.count(CMLead.id))
        .group_by(CMLead.assigned_agent_id, CMLead.status).all()
    )
    names = {u.id: u.full_name for u in db.query(_U).all()}
    agg: dict = {}
    for agent_id, status, cnt in rows:
        key = agent_id or 0
        entry = agg.setdefault(key, {"agent_id": agent_id, "agent_name": names.get(agent_id, "—"), "total": 0, "deals": 0})
        entry["total"] += cnt
        if status == "DEAL":
            entry["deals"] += cnt
    return list(agg.values())


# ── CRUD ────────────────────────────────────────────────────────────────────

@router.get("/{lead_id}")
def get_lead(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    data = lead_to_dict(l, include_comments=True)
    # Attach the cached AADE business profile + program matching (by AFM)
    data["business"] = None
    if l.afm:
        from models_cases import CMBusinessProfile
        from routes.cm_portal_integration import _business_profile_to_dict
        b = db.query(CMBusinessProfile).filter(CMBusinessProfile.afm == l.afm.strip()).first()
        if b:
            data["business"] = _business_profile_to_dict(b)

    # Program-specific questions for this program (from the sheet config), merged
    # with the lead's stored answers — so the questions show even when unanswered.
    data["program_questions"] = []
    stored = l.program_fields or {}
    if l.program:
        from models_cases import CMLeadSheetConfig
        cfg = db.query(CMLeadSheetConfig).filter(CMLeadSheetConfig.program == l.program).first()
        if cfg and cfg.program_field_map:
            for ref, meta in cfg.program_field_map.items():
                key = (meta.get("key") if isinstance(meta, dict) else None) or ref
                label = (meta.get("label") if isinstance(meta, dict) else None) or key
                sv = stored.get(key)
                if sv is None:
                    sv = stored.get(ref)
                ans = sv.get("value") if isinstance(sv, dict) else sv
                data["program_questions"].append({"key": key, "label": label, "answer": ans})
    if not data["program_questions"] and stored:
        for k, v in stored.items():
            data["program_questions"].append({
                "key": k,
                "label": (v.get("label") if isinstance(v, dict) else k),
                "answer": (v.get("value") if isinstance(v, dict) else v),
            })
    return data


@router.post("/")
def create_lead(
    req: LeadCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = CMLead(
        name=req.name,
        phone=req.phone,
        phone2=req.phone2,
        email=clean_email(req.email),
        afm=normalize_afm(req.afm),
        program=req.program,
        service_type=req.service_type,
        total_amount=req.total_amount or 0,
        status=req.status or "NEW LEAD",
        assigned_agent_id=req.assigned_agent_id,
        assigned_name=req.assigned_name,
        source=req.source,
        notes=req.notes,
        next_call_date=req.next_call_date,
        program_fields=req.program_fields,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    # New lead with an ΑΦΜ → auto-start ΕΡΜΗΣ immediately (unless toggled off)
    if req.send_ermis:
        maybe_autostart_ermis(lead, actor_name=current_user.full_name)
    return lead_to_dict(lead, include_comments=True)


@router.put("/{lead_id}")
def update_lead(
    lead_id: int,
    req: LeadUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    for field, val in req.dict(exclude_unset=True).items():
        if field == "afm":
            val = normalize_afm(val)
        elif field == "email":
            val = clean_email(val)
        setattr(l, field, val)
    db.commit()
    db.refresh(l)
    return lead_to_dict(l, include_comments=True)


@router.delete("/{lead_id}")
def delete_lead(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    db.delete(l)
    db.commit()
    return {"ok": True}


# ── Comments ────────────────────────────────────────────────────────────────

@router.get("/{lead_id}/comments")
def list_comments(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    return [_comment_to_dict(c) for c in sorted(l.comments, key=lambda x: x.created_at or datetime.min)]


@router.post("/{lead_id}/comments")
def add_comment(
    lead_id: int,
    req: CommentIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    c = CMLeadComment(
        lead_id=lead_id,
        user_id=current_user.id,
        content=req.content,
        author_name=current_user.full_name,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _comment_to_dict(c)


@router.put("/{lead_id}/comments/{comment_id}")
def edit_comment(
    lead_id: int,
    comment_id: int,
    req: CommentIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMLeadComment).filter(
        CMLeadComment.id == comment_id, CMLeadComment.lead_id == lead_id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Το σχόλιο δεν βρέθηκε")
    c.content = req.content
    c.edited = True
    db.commit()
    db.refresh(c)
    return _comment_to_dict(c)


@router.delete("/{lead_id}/comments/{comment_id}")
def delete_comment(
    lead_id: int,
    comment_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMLeadComment).filter(
        CMLeadComment.id == comment_id, CMLeadComment.lead_id == lead_id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Το σχόλιο δεν βρέθηκε")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ── Outreach (reuses Infobip/Viber + Gmail from cm_notifications) ────────────

def _log_lead_notification(db: Session, lead_id: int, ntype: str, name: str,
                           contact: str, subject: str, content: str,
                           status: str, sent_by: str) -> None:
    db.add(CMLeadNotificationLog(
        lead_id=lead_id,
        notification_type=ntype,
        recipient_name=name,
        recipient_contact=contact,
        subject=subject,
        content=content,
        status=status,
        sent_by=sent_by,
    ))
    db.commit()


@router.post("/{lead_id}/send")
def send_to_lead(
    lead_id: int,
    req: SendIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    results = []
    if req.notification_type in ("viber", "both"):
        if l.phone and req.message:
            ok, err = _send_viber(l.phone, req.message, l.name or "", current_user.full_name, l.service_type or "")
            _log_lead_notification(db, l.id, "viber", l.name or "", l.phone, "", req.message,
                                   "sent" if ok else "failed", current_user.full_name)
            results.append({"type": "viber", "to": l.phone, "status": "sent" if ok else "failed",
                            "error": err if not ok else None})
        else:
            results.append({"type": "viber", "status": "skipped", "error": "Λείπει τηλέφωνο ή μήνυμα"})
    if req.notification_type in ("email", "both"):
        if l.email and (req.body or req.message):
            body = req.body or req.message
            subject = req.subject or "i-Mentor Consulting"
            ok, err = _send_email(l.email, subject, body)
            _log_lead_notification(db, l.id, "email", l.name or "", l.email, subject, body,
                                   "sent" if ok else "failed", current_user.full_name)
            results.append({"type": "email", "to": l.email, "status": "sent" if ok else "failed",
                            "error": err if not ok else None})
        else:
            results.append({"type": "email", "status": "skipped", "error": "Λείπει email ή περιεχόμενο"})
    return {"results": results}


# ── Lead → Case conversion ──────────────────────────────────────────────────

@router.post("/{lead_id}/convert-to-case")
def convert_to_case(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    l = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")
    if l.linked_case_id:
        existing = db.query(CMCase).filter(CMCase.id == l.linked_case_id).first()
        if existing:
            return {"created": False, **case_to_dict(existing)}

    program = l.program
    statuses = get_all_statuses_for_program(program) if program else []
    first_status = statuses[0] if statuses else "ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ"

    case = CMCase(
        client_name=l.name,
        phone=l.phone,
        email=l.email,
        afm=l.afm,
        service_type=l.service_type or program,
        program_category=program,
        status=first_status,
        assigned_agent_id=l.assigned_agent_id,
        notes=l.notes,
        status_changed_at=datetime.utcnow(),
    )
    db.add(case)
    db.flush()
    l.linked_case_id = case.id
    if l.status != "DEAL":
        l.status = "DEAL"
    db.commit()
    db.refresh(case)
    return {"created": True, **case_to_dict(case)}


# ── Duplicate detection & merge ─────────────────────────────────────────────

@router.get("/{lead_id}/duplicates")
def lead_duplicates(
    lead_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Other leads that share this lead's phone (digit-normalized) or email."""
    lead = db.query(CMLead).filter(CMLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")

    pkey = _phone_key(lead.phone)
    email_l = (lead.email or "").strip().lower()

    conds = []
    if len(pkey) >= 8:
        # right(regexp_replace(phone,'\D','','g'), 10) == pkey  (Postgres)
        digits = sa_func.regexp_replace(CMLead.phone, r"[^0-9]", "", "g")
        conds.append(and_(CMLead.phone.isnot(None), CMLead.phone != "",
                          sa_func.right(digits, 10) == pkey))
    if email_l:
        conds.append(and_(CMLead.email.isnot(None), CMLead.email != "",
                          sa_func.lower(sa_func.trim(CMLead.email)) == email_l))
    if not conds:
        return {"count": 0, "items": []}

    rows = db.query(CMLead).filter(CMLead.id != lead.id, or_(*conds)).limit(50).all()
    items = []
    for r in rows:
        same_phone = len(pkey) >= 8 and _phone_key(r.phone) == pkey
        same_email = bool(email_l) and (r.email or "").strip().lower() == email_l
        items.append({
            "id": r.id,
            "name": r.name,
            "consultant": r.assigned_name or (r.assigned_agent.full_name if r.assigned_agent else None),
            "status": r.status,
            "phone": r.phone,
            "email": r.email,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "same_phone": bool(same_phone),
            "same_email": bool(same_email),
        })
    return {"count": len(items), "items": items}


@router.post("/{lead_id}/merge/{other_id}")
def merge_leads(
    lead_id: int,
    other_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Merge `other_id` into `lead_id`: move its comments, fill empty fields on
    the primary, then delete the duplicate. Keeps the primary's own data."""
    if lead_id == other_id:
        raise HTTPException(status_code=400, detail="Επίλεξε δύο διαφορετικά leads")
    primary = db.query(CMLead).filter(CMLead.id == lead_id).first()
    dup = db.query(CMLead).filter(CMLead.id == other_id).first()
    if not primary or not dup:
        raise HTTPException(status_code=404, detail="Το lead δεν βρέθηκε")

    # Move the duplicate's comments onto the primary (before delete cascades them)
    db.execute(sa_text("UPDATE cm_lead_comments SET lead_id = :p WHERE lead_id = :d"),
               {"p": primary.id, "d": dup.id})
    db.execute(sa_text("UPDATE cm_lead_notification_logs SET lead_id = :p WHERE lead_id = :d"),
               {"p": primary.id, "d": dup.id})

    # Fill empty primary fields from the duplicate
    for f in ["phone", "phone2", "email", "afm", "service_type", "program",
              "assigned_name", "assigned_agent_id", "source", "notes",
              "next_call_date", "total_amount", "program_fields",
              "ermis_token", "ermis_chat_url", "ermis_status", "ermis_transcript",
              "linked_case_id"]:
        if not getattr(primary, f) and getattr(dup, f):
            setattr(primary, f, getattr(dup, f))

    db.delete(dup)
    db.commit()
    db.refresh(primary)
    return lead_to_dict(primary, include_comments=True)
