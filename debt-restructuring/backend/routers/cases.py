from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os
import requests as http_requests

from database import get_db
from models import Case
from schemas import CaseCreate, CaseUpdate, CaseResponse, CaseListItem, ActualResultsUpdate, ContactUpdate

router = APIRouter(prefix="/cases", tags=["cases"])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


class ViberSendRequest(BaseModel):
    message: str
    msg_type: str = "initial"  # initial / reminder1 / reminder2 / final
    is_initial: bool = False
    is_reminder: bool = False


@router.get("/", response_model=List[CaseListItem])
def list_cases(
    employee: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Case)
    if employee:
        q = q.filter(Case.employee == employee)
    if status:
        q = q.filter(Case.status == status)
    if search:
        q = q.filter(Case.client_name.ilike(f"%{search}%"))
    return q.order_by(Case.created_at.desc()).all()


@router.post("/", response_model=CaseResponse, status_code=201)
def create_case(data: CaseCreate, db: Session = Depends(get_db)):
    if data.employee not in EMPLOYEES:
        raise HTTPException(status_code=400, detail="Μη έγκυρος υπάλληλος")
    case = Case(**data.model_dump())
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/{id}", response_model=CaseResponse)
def get_case(id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    return case


@router.put("/{id}", response_model=CaseResponse)
def update_case(id: int, data: CaseUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    if data.employee and data.employee not in EMPLOYEES:
        raise HTTPException(status_code=400, detail="Μη έγκυρος υπάλληλος")

    updates = data.model_dump(exclude_none=True)

    # Auto-set timestamps for status transitions
    if "status" in updates:
        if updates["status"] == "submitted" and case.status != "submitted":
            case.submitted_at = datetime.utcnow()
        if updates["status"] == "completed" and case.status != "completed":
            case.completed_at = datetime.utcnow()

    for k, v in updates.items():
        setattr(case, k, v)

    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/actual", response_model=CaseResponse)
def save_actual_results(id: int, data: ActualResultsUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    case.actual_results = data.actual_results
    case.updated_at = datetime.utcnow()
    if case.status not in ("completed", "cancelled"):
        case.status = "completed"
        case.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/contact", response_model=CaseResponse)
def update_contact(id: int, data: ContactUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    if data.contact_stage:
        case.contact_stage = data.contact_stage
    if data.increment_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    case.last_contacted_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.delete("/{id}")
def delete_case(id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    db.delete(case)
    db.commit()
    return {"ok": True}


@router.post("/{id}/send-viber", response_model=CaseResponse)
def send_viber_message(id: int, data: ViberSendRequest, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")

    phone = (case.client_phone or "").strip().replace(" ", "").replace("-", "")
    if phone and not phone.startswith("+"):
        if phone.startswith("00"):
            phone = "+" + phone[2:]
        elif phone.startswith("0"):
            phone = "+30" + phone[1:]
        else:
            phone = "+30" + phone

    bridge_url = os.getenv("BRIDGE_URL", "http://localhost:3100")
    try:
        http_requests.post(
            f"{bridge_url}/send",
            json={"phone": phone, "message": data.message, "caseId": id, "clientName": case.client_name},
            timeout=10,
        )
    except Exception:
        pass  # bridge unavailable — still update contact tracking

    case.last_contacted_at = datetime.utcnow()
    if data.is_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    if data.is_initial and (case.contact_stage or "Νέα Ανάλυση") == "Νέα Ανάλυση":
        case.contact_stage = "Εστάλη Σύνδεσμος"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{id}/duplicate", response_model=CaseResponse, status_code=201)
def duplicate_case(id: int, db: Session = Depends(get_db)):
    original = db.query(Case).filter(Case.id == id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    new_case = Case(
        client_name=f"{original.client_name} (αντίγραφο)",
        client_phone=original.client_phone,
        client_email=original.client_email,
        employee=original.employee,
        status="draft",
        debtor_type=original.debtor_type,
        debts=original.debts,
        assets=original.assets,
        income_data=original.income_data,
        estimates=original.estimates,
        notes=original.notes,
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)
    return new_case
