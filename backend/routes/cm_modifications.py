from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime as _dt, date as _date
from database import get_db, fmt_dt
from models_cases import CMCase, CMCaseModification
from auth_cases import get_current_user
from models_cases import CMUser

router = APIRouter(tags=["cm-modifications"])


class ModificationCreate(BaseModel):
    modification_date: _date
    title: str
    justification: Optional[str] = None
    approval_date: Optional[_date] = None


class ModificationUpdate(BaseModel):
    modification_date: Optional[_date] = None
    title: Optional[str] = None
    justification: Optional[str] = None
    approval_date: Optional[_date] = None


def _to_dict(m: CMCaseModification) -> dict:
    return {
        "id": m.id,
        "case_id": m.case_id,
        "modification_date": m.modification_date.isoformat() if m.modification_date else None,
        "title": m.title,
        "justification": m.justification,
        "approval_date": m.approval_date.isoformat() if m.approval_date else None,
        "created_at": fmt_dt(m.created_at),
    }


@router.get("/api/cm/cases/{case_id}/modifications")
def list_modifications(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mods = (
        db.query(CMCaseModification)
        .filter(CMCaseModification.case_id == case_id)
        .order_by(CMCaseModification.modification_date)
        .all()
    )
    return [_to_dict(m) for m in mods]


@router.post("/api/cm/cases/{case_id}/modifications")
def create_modification(
    case_id: int,
    req: ModificationCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    m = CMCaseModification(
        case_id=case_id,
        modification_date=req.modification_date,
        title=req.title,
        justification=req.justification,
        approval_date=req.approval_date,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_dict(m)


@router.put("/api/cm/cases/{case_id}/modifications/{mod_id}")
def update_modification(
    case_id: int,
    mod_id: int,
    req: ModificationUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.query(CMCaseModification).filter(
        CMCaseModification.id == mod_id, CMCaseModification.case_id == case_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Τροποποίηση δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(m, field, val)
    m.updated_at = _dt.utcnow()
    db.commit()
    db.refresh(m)
    return _to_dict(m)


@router.delete("/api/cm/cases/{case_id}/modifications/{mod_id}")
def delete_modification(
    case_id: int,
    mod_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.query(CMCaseModification).filter(
        CMCaseModification.id == mod_id, CMCaseModification.case_id == case_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Τροποποίηση δεν βρέθηκε")
    db.delete(m)
    db.commit()
    return {"message": "Διαγράφηκε"}
