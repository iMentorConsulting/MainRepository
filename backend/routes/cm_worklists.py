from datetime import datetime, date as _date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, fmt_dt
from models_cases import CMCase, CMTask, CMUser, CMWorkList
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/worklists", tags=["cm-worklists"])


class WorkListCreate(BaseModel):
    name: str
    description: Optional[str] = None
    programs: List[str] = []
    service_types: List[str] = []
    statuses: List[str] = []
    min_days_in_status: Optional[int] = None
    max_days_in_status: Optional[int] = None
    sort_order: int = 0


class WorkListUpdate(WorkListCreate):
    pass


def _wl_to_dict(wl: CMWorkList) -> dict:
    return {
        "id": wl.id,
        "name": wl.name,
        "description": wl.description,
        "programs": wl.programs or [],
        "service_types": wl.service_types or [],
        "statuses": wl.statuses or [],
        "min_days_in_status": wl.min_days_in_status,
        "max_days_in_status": wl.max_days_in_status,
        "sort_order": wl.sort_order,
        "created_at": fmt_dt(wl.created_at),
    }


def _days_in_status(c: CMCase) -> int:
    if not c.status_changed_at:
        return 0
    return (datetime.utcnow() - c.status_changed_at).days


def _case_summary(c: CMCase, days: int) -> dict:
    return {
        "id": c.id,
        "client_name": c.client_name,
        "phone": c.phone,
        "email": c.email,
        "afm": c.afm,
        "service_type": c.service_type,
        "program_category": c.program_category,
        "status": c.status,
        "days_in_status": days,
        "status_changed_at": fmt_dt(c.status_changed_at),
        "assigned_name": c.assigned_agent.full_name if c.assigned_agent else None,
        "total_paid": c.total_paid or 0,
        "agreed_fee_application": c.agreed_fee_application or 0,
        "agreed_fee_implementation": c.agreed_fee_implementation or 0,
    }


@router.get("")
def list_work_lists(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wls = db.query(CMWorkList).order_by(CMWorkList.sort_order, CMWorkList.name).all()
    return [_wl_to_dict(w) for w in wls]


@router.post("")
def create_work_list(
    req: WorkListCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = CMWorkList(
        name=req.name,
        description=req.description,
        programs=req.programs,
        service_types=req.service_types,
        statuses=req.statuses,
        min_days_in_status=req.min_days_in_status,
        max_days_in_status=req.max_days_in_status,
        sort_order=req.sort_order,
        created_by_id=current_user.id,
    )
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _wl_to_dict(wl)


@router.put("/{wl_id}")
def update_work_list(
    wl_id: int,
    req: WorkListUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(CMWorkList).filter(CMWorkList.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    wl.name = req.name
    wl.description = req.description
    wl.programs = req.programs
    wl.service_types = req.service_types
    wl.statuses = req.statuses
    wl.min_days_in_status = req.min_days_in_status
    wl.max_days_in_status = req.max_days_in_status
    wl.sort_order = req.sort_order
    wl.updated_at = datetime.utcnow()
    db.commit()
    return _wl_to_dict(wl)


@router.delete("/{wl_id}")
def delete_work_list(
    wl_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(CMWorkList).filter(CMWorkList.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    db.delete(wl)
    db.commit()
    return {"ok": True}


@router.get("/{wl_id}/cases")
def get_work_list_cases(
    wl_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(CMWorkList).filter(CMWorkList.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")

    from pipelines import TERMINAL_STATUSES
    q = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(
        ~CMCase.status.in_(list(TERMINAL_STATUSES))
    )
    if wl.programs:
        q = q.filter(CMCase.program_category.in_(wl.programs))
    if wl.service_types:
        q = q.filter(CMCase.service_type.in_(wl.service_types))
    if wl.statuses:
        q = q.filter(CMCase.status.in_(wl.statuses))

    cases = q.all()

    results = []
    for c in cases:
        days = _days_in_status(c)
        if wl.min_days_in_status is not None and days < wl.min_days_in_status:
            continue
        if wl.max_days_in_status is not None and days > wl.max_days_in_status:
            continue
        results.append(_case_summary(c, days))

    results.sort(key=lambda x: x["days_in_status"], reverse=True)
    return results


@router.get("/all-tasks/list")
def get_all_tasks(
    status: Optional[str] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all open tasks across all cases with case info."""
    q = (
        db.query(CMTask)
        .options(joinedload(CMTask.assigned_user), joinedload(CMTask.case))
        .filter(CMTask.status != "done")
    )
    if status:
        q = q.filter(CMTask.status == status)
    tasks = q.order_by(CMTask.due_date.asc().nullslast(), CMTask.created_at.desc()).all()

    result = []
    for t in tasks:
        result.append({
            "id": t.id,
            "case_id": t.case_id,
            "case_name": t.case.client_name if t.case else None,
            "case_status": t.case.status if t.case else None,
            "case_service": t.case.service_type if t.case else None,
            "case_program": t.case.program_category if t.case else None,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "assigned_to": t.assigned_to,
            "assigned_name": t.assigned_user.full_name if t.assigned_user else None,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "notes": t.notes,
            "created_at": fmt_dt(t.created_at),
        })
    return result
