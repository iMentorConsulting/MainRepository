from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Loan
from auth_utils import get_tenant
from typing import Optional
from datetime import date
from calendar import monthrange
from pydantic import BaseModel

router = APIRouter(prefix="/loans", tags=["loans"])


class LoanIn(BaseModel):
    name: str
    lender: Optional[str] = None
    original_amount: float
    interest_rate: Optional[float] = None
    monthly_installment: float
    start_date: date
    end_date: Optional[date] = None
    notes: Optional[str] = None


def _serialize(l: Loan) -> dict:
    return {
        "id": l.id,
        "name": l.name,
        "lender": l.lender or "",
        "original_amount": l.original_amount,
        "interest_rate": l.interest_rate,
        "monthly_installment": l.monthly_installment,
        "start_date": l.start_date.isoformat(),
        "end_date": l.end_date.isoformat() if l.end_date else None,
        "notes": l.notes or "",
    }


def _calc_by_month(loans, from_date: date, to_date: date) -> dict:
    result = {}
    d = from_date.replace(day=1)
    while d <= to_date:
        _, last = monthrange(d.year, d.month)
        month_end = date(d.year, d.month, last)
        key = d.strftime("%Y-%m")
        total = 0.0
        for loan in loans:
            sd = loan.start_date if isinstance(loan.start_date, date) else date.fromisoformat(str(loan.start_date))
            ed = loan.end_date if (loan.end_date is None or isinstance(loan.end_date, date)) else date.fromisoformat(str(loan.end_date))
            if sd <= month_end and (ed is None or ed >= d):
                total += loan.monthly_installment
        result[key] = round(total, 2)
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)
    return result


@router.get("/")
def list_loans(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    loans = db.query(Loan).filter(Loan.tenant == tenant).order_by(Loan.start_date).all()
    return {"loans": [_serialize(l) for l in loans]}


@router.get("/total")
def loan_total(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    loans = db.query(Loan).filter(Loan.tenant == tenant).all()
    by_month = _calc_by_month(loans, from_date, to_date)
    return {"total": round(sum(by_month.values()), 2), "by_month": by_month}


@router.post("/")
def create_loan(body: LoanIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    l = Loan(tenant=tenant, **body.dict())
    db.add(l)
    db.commit()
    db.refresh(l)
    return _serialize(l)


@router.put("/{loan_id}")
def update_loan(loan_id: int, body: LoanIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    l = db.query(Loan).filter(Loan.id == loan_id, Loan.tenant == tenant).first()
    if not l:
        raise HTTPException(404)
    for k, v in body.dict().items():
        setattr(l, k, v)
    db.commit()
    db.refresh(l)
    return _serialize(l)


@router.delete("/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    l = db.query(Loan).filter(Loan.id == loan_id, Loan.tenant == tenant).first()
    if not l:
        raise HTTPException(404)
    db.delete(l)
    db.commit()
    return {"ok": True}
