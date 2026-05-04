from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db
from models_cases import CMCase, CMUser, CMTask, CMPayment, CMMessage, CMDocument, CMBudgetCategory, CMStatusSLA
from auth_cases import get_current_user
from pipelines import TERMINAL_STATUSES

router = APIRouter(prefix="/api/cm/cases", tags=["cm-cases"])


class CaseCreate(BaseModel):
    client_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    afm: Optional[str] = None
    accountant: Optional[str] = None
    sale_date: Optional[date] = None
    service_type: Optional[str] = None
    status: Optional[str] = "ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ"
    program_category: Optional[str] = None
    approved_budget: Optional[float] = 0
    subsidy_percent: Optional[float] = 0
    project_deadline: Optional[date] = None
    approval_date: Optional[date] = None
    follow_up_date: Optional[date] = None
    dypa_start_date: Optional[date] = None
    agreed_fee_application: Optional[float] = 0
    agreed_fee_implementation: Optional[float] = 0
    total_paid: Optional[float] = 0
    assigned_agent_id: Optional[int] = None
    notes: Optional[str] = None


class CaseUpdate(BaseModel):
    client_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    afm: Optional[str] = None
    accountant: Optional[str] = None
    sale_date: Optional[date] = None
    service_type: Optional[str] = None
    status: Optional[str] = None
    program_category: Optional[str] = None
    approved_budget: Optional[float] = None
    subsidy_percent: Optional[float] = None
    project_deadline: Optional[date] = None
    approval_date: Optional[date] = None
    follow_up_date: Optional[date] = None
    dypa_start_date: Optional[date] = None
    agreed_fee_application: Optional[float] = None
    agreed_fee_implementation: Optional[float] = None
    total_paid: Optional[float] = None
    assigned_agent_id: Optional[int] = None
    portal_active: Optional[bool] = None
    drive_folder_url: Optional[str] = None
    risk_score: Optional[int] = None
    notes: Optional[str] = None


def _last_note(c: CMCase) -> tuple[str | None, str | None]:
    if not c.messages:
        return None, None
    latest = max(c.messages, key=lambda m: m.created_at or datetime.min)
    text = (latest.content or '').replace('\n', ' ')
    preview = text[:120] + ('…' if len(text) > 120 else '')
    at = latest.created_at.isoformat() if latest.created_at else None
    return preview, at


def case_to_dict(c: CMCase, include_related: bool = False, sla_map: dict = None) -> dict:
    agent_name = c.assigned_agent.full_name if c.assigned_agent else None
    total_agreed = (c.agreed_fee_application or 0) + (c.agreed_fee_implementation or 0)
    balance = total_agreed - (c.total_paid or 0)

    # Days until deadline
    days_to_deadline = None
    if c.project_deadline:
        days_to_deadline = (c.project_deadline - date.today()).days

    # SLA overdue tracking
    status_age_days = None
    sla_days_for_status = (sla_map or {}).get(c.status)
    sla_overdue_days = None
    if c.status_changed_at:
        status_age_days = (datetime.utcnow() - c.status_changed_at).days
        if sla_days_for_status and status_age_days > sla_days_for_status:
            sla_overdue_days = status_age_days - sla_days_for_status

    data = {
        "id": c.id,
        "client_name": c.client_name,
        "phone": c.phone,
        "email": c.email,
        "afm": c.afm,
        "accountant": c.accountant,
        "sale_date": c.sale_date.isoformat() if c.sale_date else None,
        "service_type": c.service_type,
        "status": c.status,
        "program_category": c.program_category,
        "approved_budget": c.approved_budget or 0,
        "subsidy_percent": c.subsidy_percent or 0,
        "project_deadline": c.project_deadline.isoformat() if c.project_deadline else None,
        "approval_date": c.approval_date.isoformat() if c.approval_date else None,
        "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
        "dypa_start_date": c.dypa_start_date.isoformat() if c.dypa_start_date else None,
        "agreed_fee_application": c.agreed_fee_application or 0,
        "agreed_fee_implementation": c.agreed_fee_implementation or 0,
        "total_agreed": total_agreed,
        "total_paid": c.total_paid or 0,
        "balance": balance,
        "assigned_agent_id": c.assigned_agent_id,
        "assigned_agent_name": agent_name,
        "portal_active": c.portal_active,
        "drive_folder_url": c.drive_folder_url,
        "share_token": c.share_token,
        "portal_visit_count": c.portal_visit_count or 0,
        "portal_nps_score": c.portal_nps_score,
        "portal_nps_at": c.portal_nps_at.isoformat() if c.portal_nps_at else None,
        "portal_review_clicked": c.portal_review_clicked or False,
        "risk_score": c.risk_score or 0,
        "notes": c.notes,
        "sheet_import_ref": c.sheet_import_ref,
        "days_to_deadline": days_to_deadline,
        "status_changed_at": c.status_changed_at.isoformat() if c.status_changed_at else None,
        "status_age_days": status_age_days,
        "sla_days": sla_days_for_status,
        "sla_overdue_days": sla_overdue_days,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "open_tasks": 0,
        "pending_count": len(c.pending_items) if c.pending_items is not None else 0,
        "pending_items_text": [pi.item_text for pi in (c.pending_items or [])],
        "open_task_titles": [],
        "last_note_preview": (_ln := _last_note(c))[0],
        "last_note_at": _ln[1],
    }

    if include_related:
        tasks = c.tasks or []
        data["tasks"] = [task_to_dict(t) for t in tasks]
        data["payments"] = [pay_to_dict(p) for p in (c.payments or [])]
        data["messages"] = [msg_to_dict(m) for m in (c.messages or [])]
        data["documents"] = [doc_to_dict(d) for d in (c.documents or [])]
        data["budget_categories"] = [bc_to_dict(b) for b in (c.budget_categories or [])]
        data["open_tasks"] = sum(1 for t in tasks if t.status != "done")
    return data


def task_to_dict(t: CMTask) -> dict:
    assigned_name = t.assigned_user.full_name if t.assigned_user else None
    return {
        "id": t.id,
        "case_id": t.case_id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "assigned_to": t.assigned_to,
        "assigned_name": assigned_name,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "notes": t.notes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def pay_to_dict(p: CMPayment) -> dict:
    return {
        "id": p.id,
        "case_id": p.case_id,
        "amount": p.amount,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "payment_type": p.payment_type,
        "description": p.description,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def msg_to_dict(m: CMMessage) -> dict:
    return {
        "id": m.id,
        "case_id": m.case_id,
        "content": m.content,
        "is_internal": m.is_internal,
        "author_name": m.author_name,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def doc_to_dict(d: CMDocument) -> dict:
    return {
        "id": d.id,
        "case_id": d.case_id,
        "name": d.name,
        "document_type": d.document_type,
        "status": d.status,
        "uploaded_by": d.uploaded_by,
        "notes": d.notes,
        "file_url": d.file_url,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def bc_to_dict(b: CMBudgetCategory) -> dict:
    total_certified = (b.certified_request1 or 0) + (b.certified_request2 or 0) + (b.certified_final or 0)
    remaining = (b.approved_amount or 0) - total_certified
    return {
        "id": b.id,
        "case_id": b.case_id,
        "category_name": b.category_name,
        "approved_amount": b.approved_amount or 0,
        "percent_of_budget": b.percent_of_budget or 0,
        "certified_request1": b.certified_request1 or 0,
        "certified_request2": b.certified_request2 or 0,
        "certified_final": b.certified_final or 0,
        "total_certified": total_certified,
        "remaining": remaining,
        "notes": b.notes,
    }


@router.get("/")
def list_cases(
    status: Optional[str] = Query(None),
    program_category: Optional[str] = Query(None),
    agent_id: Optional[int] = Query(None),
    service_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    deadline_alert: Optional[bool] = Query(None),
    include_terminal: Optional[bool] = Query(False),
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(CMCase).options(
        joinedload(CMCase.assigned_agent),
        joinedload(CMCase.messages).joinedload(CMMessage.user),
        joinedload(CMCase.pending_items),
    )

    if status:
        q = q.filter(CMCase.status == status)
    elif not include_terminal:
        q = q.filter(~CMCase.status.in_(list(TERMINAL_STATUSES)))

    if program_category:
        q = q.filter(CMCase.program_category == program_category)

    if agent_id:
        q = q.filter(CMCase.assigned_agent_id == agent_id)

    if service_type:
        q = q.filter(CMCase.service_type.ilike(f"%{service_type}%"))

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                CMCase.client_name.ilike(term),
                CMCase.afm.ilike(term),
                CMCase.email.ilike(term),
                CMCase.phone.ilike(term),
            )
        )

    if deadline_alert:
        today = date.today()
        from sqlalchemy import and_
        q = q.filter(
            and_(
                CMCase.project_deadline != None,
                CMCase.project_deadline <= date.fromordinal(today.toordinal() + 30),
            )
        )

    cases = q.order_by(CMCase.updated_at.desc()).all()
    sla_map = {r.status: r.sla_days for r in db.query(CMStatusSLA).all()}
    result = []
    for c in cases:
        d = case_to_dict(c, sla_map=sla_map)
        open_task_rows = db.query(CMTask).filter(
            CMTask.case_id == c.id, CMTask.status != "done"
        ).all()
        d["open_tasks"] = len(open_task_rows)
        d["open_task_titles"] = [t.title for t in open_task_rows]
        result.append(d)
    return result


@router.get("/{case_id}")
def get_case(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = (
        db.query(CMCase)
        .options(
            joinedload(CMCase.assigned_agent),
            joinedload(CMCase.tasks).joinedload(CMTask.assigned_user),
            joinedload(CMCase.payments),
            joinedload(CMCase.messages).joinedload(CMMessage.user),
            joinedload(CMCase.documents),
            joinedload(CMCase.budget_categories),
        )
        .filter(CMCase.id == case_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    sla_map = {r.status: r.sla_days for r in db.query(CMStatusSLA).all()}
    return case_to_dict(c, include_related=True, sla_map=sla_map)


@router.post("/")
def create_case(
    req: CaseCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _status = req.status or "ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ"
    case = CMCase(
        client_name=req.client_name,
        phone=req.phone,
        email=req.email,
        afm=req.afm,
        accountant=req.accountant,
        sale_date=req.sale_date,
        service_type=req.service_type,
        status=_status,
        program_category=req.program_category,
        approved_budget=req.approved_budget or 0,
        subsidy_percent=req.subsidy_percent or 0,
        project_deadline=req.project_deadline,
        approval_date=req.approval_date,
        follow_up_date=req.follow_up_date,
        agreed_fee_application=req.agreed_fee_application or 0,
        agreed_fee_implementation=req.agreed_fee_implementation or 0,
        total_paid=req.total_paid or 0,
        assigned_agent_id=req.assigned_agent_id,
        notes=req.notes,
        status_changed_at=datetime.utcnow(),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case_to_dict(case)


@router.put("/{case_id}")
def update_case(
    case_id: int,
    req: CaseUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")

    data = req.dict(exclude_none=True)
    for field, val in data.items():
        setattr(c, field, val)
    if 'status' in data:
        c.status_changed_at = datetime.utcnow()
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return case_to_dict(c)


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    db.delete(c)
    db.commit()
    return {"message": "Η υπόθεση διαγράφηκε"}


# ── Tasks ──────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "pending"
    priority: Optional[str] = "normal"
    assigned_to: Optional[int] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


@router.get("/{case_id}/tasks")
def list_tasks(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(CMTask)
        .options(joinedload(CMTask.assigned_user))
        .filter(CMTask.case_id == case_id)
        .order_by(CMTask.created_at.desc())
        .all()
    )
    return [task_to_dict(t) for t in tasks]


@router.post("/{case_id}/tasks")
def create_task(
    case_id: int,
    req: TaskCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(CMCase).filter(CMCase.id == case_id).first():
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    task = CMTask(
        case_id=case_id,
        title=req.title,
        description=req.description,
        status=req.status or "pending",
        priority=req.priority or "normal",
        assigned_to=req.assigned_to,
        due_date=req.due_date,
        notes=req.notes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_to_dict(task)


@router.put("/{case_id}/tasks/{task_id}")
def update_task(
    case_id: int,
    task_id: int,
    req: TaskUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(CMTask).filter(CMTask.id == task_id, CMTask.case_id == case_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(task, field, val)
    if req.status == "done" and not task.completed_at:
        task.completed_at = datetime.utcnow()
    elif req.status and req.status != "done":
        task.completed_at = None
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_dict(task)


@router.delete("/{case_id}/tasks/{task_id}")
def delete_task(
    case_id: int,
    task_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(CMTask).filter(CMTask.id == task_id, CMTask.case_id == case_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task δεν βρέθηκε")
    db.delete(task)
    db.commit()
    return {"message": "Task διαγράφηκε"}


# ── Payments ───────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    amount: float
    payment_date: Optional[date] = None
    payment_type: Optional[str] = "partial"
    description: Optional[str] = None


@router.get("/{case_id}/payments")
def list_payments(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payments = db.query(CMPayment).filter(CMPayment.case_id == case_id).order_by(CMPayment.payment_date.desc()).all()
    return [pay_to_dict(p) for p in payments]


@router.post("/{case_id}/payments")
def create_payment(
    case_id: int,
    req: PaymentCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    payment = CMPayment(
        case_id=case_id,
        amount=req.amount,
        payment_date=req.payment_date or date.today(),
        payment_type=req.payment_type or "partial",
        description=req.description,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return pay_to_dict(payment)


@router.delete("/{case_id}/payments/{payment_id}")
def delete_payment(
    case_id: int,
    payment_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(CMPayment).filter(CMPayment.id == payment_id, CMPayment.case_id == case_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Πληρωμή δεν βρέθηκε")
    db.delete(p)
    db.commit()
    return {"message": "Πληρωμή διαγράφηκε"}


# ── Messages ───────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    is_internal: Optional[bool] = True


@router.get("/{case_id}/messages")
def list_messages(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    messages = (
        db.query(CMMessage)
        .filter(CMMessage.case_id == case_id)
        .order_by(CMMessage.created_at.asc())
        .all()
    )
    return [msg_to_dict(m) for m in messages]


@router.post("/{case_id}/messages")
def create_message(
    case_id: int,
    req: MessageCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(CMCase).filter(CMCase.id == case_id).first():
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    msg = CMMessage(
        case_id=case_id,
        user_id=current_user.id,
        content=req.content,
        is_internal=req.is_internal if req.is_internal is not None else True,
        author_name=current_user.full_name,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg_to_dict(msg)


@router.delete("/{case_id}/messages/{message_id}")
def delete_message(
    case_id: int,
    message_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.query(CMMessage).filter(CMMessage.id == message_id, CMMessage.case_id == case_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Μήνυμα δεν βρέθηκε")
    db.delete(m)
    db.commit()
    return {"message": "Μήνυμα διαγράφηκε"}


# ── Documents ──────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    name: str
    document_type: Optional[str] = None
    status: Optional[str] = "pending"
    notes: Optional[str] = None


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    document_type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("/{case_id}/documents")
def list_documents(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = db.query(CMDocument).filter(CMDocument.case_id == case_id).order_by(CMDocument.created_at.desc()).all()
    return [doc_to_dict(d) for d in docs]


@router.post("/{case_id}/documents")
def create_document(
    case_id: int,
    req: DocumentCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(CMCase).filter(CMCase.id == case_id).first():
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    doc = CMDocument(
        case_id=case_id,
        name=req.name,
        document_type=req.document_type,
        status=req.status or "pending",
        uploaded_by=current_user.full_name,
        notes=req.notes,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc_to_dict(doc)


@router.put("/{case_id}/documents/{doc_id}")
def update_document(
    case_id: int,
    doc_id: int,
    req: DocumentUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    d = db.query(CMDocument).filter(CMDocument.id == doc_id, CMDocument.case_id == case_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Έγγραφο δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(d, field, val)
    db.commit()
    db.refresh(d)
    return doc_to_dict(d)


@router.delete("/{case_id}/documents/{doc_id}")
def delete_document(
    case_id: int,
    doc_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    d = db.query(CMDocument).filter(CMDocument.id == doc_id, CMDocument.case_id == case_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Έγγραφο δεν βρέθηκε")
    db.delete(d)
    db.commit()
    return {"message": "Έγγραφο διαγράφηκε"}


# ── Budget Categories ──────────────────────────────────────────────────

class BudgetCategoryCreate(BaseModel):
    category_name: str
    approved_amount: Optional[float] = 0
    percent_of_budget: Optional[float] = 0
    notes: Optional[str] = None


class BudgetCategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    approved_amount: Optional[float] = None
    percent_of_budget: Optional[float] = None
    certified_request1: Optional[float] = None
    certified_request2: Optional[float] = None
    certified_final: Optional[float] = None
    notes: Optional[str] = None


@router.get("/{case_id}/budget-categories")
def list_budget_categories(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cats = db.query(CMBudgetCategory).filter(CMBudgetCategory.case_id == case_id).all()
    return [bc_to_dict(c) for c in cats]


@router.post("/{case_id}/budget-categories")
def create_budget_category(
    case_id: int,
    req: BudgetCategoryCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(CMCase).filter(CMCase.id == case_id).first():
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    cat = CMBudgetCategory(
        case_id=case_id,
        category_name=req.category_name,
        approved_amount=req.approved_amount or 0,
        percent_of_budget=req.percent_of_budget or 0,
        notes=req.notes,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return bc_to_dict(cat)


@router.put("/{case_id}/budget-categories/{cat_id}")
def update_budget_category(
    case_id: int,
    cat_id: int,
    req: BudgetCategoryUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(CMBudgetCategory).filter(CMBudgetCategory.id == cat_id, CMBudgetCategory.case_id == case_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Κατηγορία δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(cat, field, val)
    db.commit()
    db.refresh(cat)
    return bc_to_dict(cat)


@router.delete("/{case_id}/budget-categories/{cat_id}")
def delete_budget_category(
    case_id: int,
    cat_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(CMBudgetCategory).filter(CMBudgetCategory.id == cat_id, CMBudgetCategory.case_id == case_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Κατηγορία δεν βρέθηκε")
    db.delete(cat)
    db.commit()
    return {"message": "Κατηγορία διαγράφηκε"}
