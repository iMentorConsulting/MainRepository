"""
Leads management API.

Prospective clients collected via per-program Google Sheets (see cm_leads_sync.py),
pre-screened by the ΕΡΜΗΣ AI assistant (see cm_leads_ermis.py), and converted into
CMCase records once they become deals.
"""
import json
import logging
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, func as sa_func
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


def lead_to_dict(l: CMLead, include_comments: bool = False) -> dict:
    transcript = None
    if l.ermis_transcript:
        try:
            transcript = json.loads(l.ermis_transcript)
        except (ValueError, TypeError):
            transcript = l.ermis_transcript
    data = {
        "id": l.id,
        "name": l.name,
        "phone": l.phone,
        "phone2": l.phone2,
        "email": l.email,
        "afm": l.afm,
        "program": l.program,
        "service_type": l.service_type,
        "total_amount": l.total_amount or 0,
        "status": l.status,
        "assigned_agent_id": l.assigned_agent_id,
        "assigned_agent_name": l.assigned_agent.full_name if l.assigned_agent else None,
        "source": l.source,
        "notes": l.notes,
        "next_call_date": l.next_call_date.isoformat() if l.next_call_date else None,
        "linked_case_id": l.linked_case_id,
        "ermis_token": l.ermis_token,
        "ermis_chat_url": l.ermis_chat_url,
        "ermis_status": l.ermis_status,
        "ermis_transcript": transcript,
        "ermis_started_at": l.ermis_started_at.isoformat() if l.ermis_started_at else None,
        "ermis_completed_at": l.ermis_completed_at.isoformat() if l.ermis_completed_at else None,
        "program_fields": l.program_fields or {},
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
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
    source: Optional[str] = None
    notes: Optional[str] = None
    next_call_date: Optional[date] = None
    program_fields: Optional[dict] = None


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
    agent_id: Optional[int] = None,
    program: Optional[str] = None,
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
    if agent_id is not None:
        query = query.filter(CMLead.assigned_agent_id == agent_id)
    if program:
        query = query.filter(CMLead.program == program)
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
        "assigned_agent_id": CMLead.assigned_agent_id,
    }.get(sort, CMLead.created_at)
    sort_col = sort_col.desc() if (direction or "desc").lower() == "desc" else sort_col.asc()

    page = max(1, page)
    rows = query.order_by(sort_col).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).all()
    return {
        "items": [lead_to_dict(l) for l in rows],
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
    return {
        "statuses": LEAD_STATUSES,
        "agents": [{"id": a[0], "name": a[1]} for a in agents],
        "programs": programs,
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
    return lead_to_dict(l, include_comments=True)


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
        email=req.email,
        afm=req.afm,
        program=req.program,
        service_type=req.service_type,
        total_amount=req.total_amount or 0,
        status=req.status or "NEW LEAD",
        assigned_agent_id=req.assigned_agent_id,
        source=req.source,
        notes=req.notes,
        next_call_date=req.next_call_date,
        program_fields=req.program_fields,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
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
