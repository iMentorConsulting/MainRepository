from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models_cases import CMCaseDypaHiring, CMCase
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/dypa-hiring", tags=["dypa-hiring"])


class DypaHiringUpdate(BaseModel):
    program_duration_months: Optional[int] = None   # 12 or 18
    hiring_date: Optional[str] = None               # ISO date string or null
    requests_submitted: Optional[int] = None
    periods_paid: Optional[int] = None
    notes: Optional[str] = None


def _get_or_create(case_id: int, db: Session) -> CMCaseDypaHiring:
    rec = db.query(CMCaseDypaHiring).filter(CMCaseDypaHiring.case_id == case_id).first()
    if not rec:
        rec = CMCaseDypaHiring(case_id=case_id)
        db.add(rec)
        db.flush()
    return rec


@router.get("/{case_id}")
def get_dypa_hiring(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rec = db.query(CMCaseDypaHiring).filter(CMCaseDypaHiring.case_id == case_id).first()
    if not rec:
        return {
            "case_id": case_id,
            "program_duration_months": 12,
            "hiring_date": None,
            "requests_submitted": 0,
            "periods_paid": 0,
            "notes": None,
        }
    return {
        "case_id": case_id,
        "program_duration_months": rec.program_duration_months or 12,
        "hiring_date": rec.hiring_date.isoformat() if rec.hiring_date else None,
        "requests_submitted": rec.requests_submitted or 0,
        "periods_paid": rec.periods_paid or 0,
        "notes": rec.notes,
    }


@router.put("/{case_id}")
def update_dypa_hiring(case_id: int, data: DypaHiringUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rec = _get_or_create(case_id, db)

    if data.program_duration_months is not None:
        if data.program_duration_months not in (12, 18):
            raise HTTPException(status_code=400, detail="program_duration_months must be 12 or 18")
        rec.program_duration_months = data.program_duration_months

    if data.hiring_date is not None:
        if data.hiring_date == "":
            rec.hiring_date = None
        else:
            try:
                rec.hiring_date = date.fromisoformat(data.hiring_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid hiring_date format")

    if data.requests_submitted is not None:
        max_req = (rec.program_duration_months or 12) // 2
        if not (0 <= data.requests_submitted <= max_req):
            raise HTTPException(status_code=400, detail=f"requests_submitted must be 0–{max_req}")
        rec.requests_submitted = data.requests_submitted

    if data.periods_paid is not None:
        max_pay = (rec.program_duration_months or 12) // 2
        if not (0 <= data.periods_paid <= max_pay):
            raise HTTPException(status_code=400, detail=f"periods_paid must be 0–{max_pay}")
        rec.periods_paid = data.periods_paid

    if data.notes is not None:
        rec.notes = data.notes

    rec.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    return {
        "case_id": case_id,
        "program_duration_months": rec.program_duration_months,
        "hiring_date": rec.hiring_date.isoformat() if rec.hiring_date else None,
        "requests_submitted": rec.requests_submitted,
        "periods_paid": rec.periods_paid,
        "notes": rec.notes,
    }
