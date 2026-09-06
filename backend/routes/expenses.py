from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Expense, Unit
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional
from datetime import date

router = APIRouter(prefix="/expenses", tags=["expenses"])

DEFAULT_CATEGORIES = [
    "WEBSITE", "ΠΡΟΜΗΘΕΙΕΣ ΚΡΑΤΗΣΕΩΝ", "ΣΥΝΤΗΡΗΣΕΙΣ", "ΣΥΝΤΗΡΗΣΗ ΚΗΠΩΝ",
    "ΚΑΤΑΣΚΕΥΕΣ", "ΝΕΡΟ", "ΛΕΥΚΑ ΕΙΔΗ", "ΛΟΓΙΣΤΙΚΕΣ ΥΠΗΡΕΣΙΕΣ", "INTERNET",
    "ΕΙΔΗ ΚΑΘΑΡΙΣΜΟΥ", "ΕΠΙΠΛΑ", "ΡΕΥΜΑ", "ΜΙΚΡΟΣΥΣΚΕΥΕΣ", "ΕΡΓΑΛΕΙΑ",
    "ΓΡΑΦΕΙΟΚΡΑΤΙΚΑ", "ΑΠΟΛΥΜΑΝΣΕΙΣ", "ΑΣΤΙΚΗ ΕΥΘΥΝΗ", "WELCOME",
    "ΑΝΑΛΩΣΙΜΑ", "ΕΙΔΗ ΜΠΑΝΙΟΥ", "ΚΑΘΑΡΙΣΜΟΙ", "ΠΛΥΣΙΜΟ ΛΙΝΩΝ", "ΦΟΡΟΙ",
]


class ExpenseIn(BaseModel):
    date: date
    category: str
    item: str
    vendor: Optional[str] = None
    amount: float
    unit_id: Optional[int] = None
    unit_type: Optional[str] = None
    notes: Optional[str] = None


def _serialize(e: Expense) -> dict:
    return {
        "id": e.id,
        "date": e.date.isoformat(),
        "month_year": f"{e.date.month:02d} - {e.date.year}",
        "category": e.category,
        "item": e.item,
        "vendor": e.vendor or "",
        "amount": e.amount,
        "unit_id": e.unit_id,
        "unit_type": e.unit_type,
        "notes": e.notes or "",
    }


@router.get("/categories")
def get_categories(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    existing = db.query(Expense.category).filter(Expense.tenant == tenant).distinct().all()
    custom = [r[0] for r in existing if r[0] not in DEFAULT_CATEGORIES]
    return DEFAULT_CATEGORIES + sorted(custom)


@router.get("/unit-types")
def get_unit_types(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    types = db.query(Unit.type).filter(Unit.tenant == tenant).distinct().all()
    return sorted(set(r[0] for r in types if r[0]))


@router.get("/")
def list_expenses(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    category: Optional[str] = None,
    unit_id: Optional[int] = None,
    unit_type: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    q = db.query(Expense).filter(Expense.tenant == tenant)
    if from_date:
        q = q.filter(Expense.date >= from_date)
    if to_date:
        q = q.filter(Expense.date <= to_date)
    if category:
        q = q.filter(Expense.category == category)
    if unit_id:
        q = q.filter(Expense.unit_id == unit_id)
    if unit_type:
        q = q.filter(Expense.unit_type == unit_type)

    expenses = q.order_by(Expense.date.desc(), Expense.id.desc()).all()
    total = round(sum(e.amount for e in expenses), 2)
    return {"expenses": [_serialize(e) for e in expenses], "total": total}


@router.post("/")
def create_expense(data: ExpenseIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    e = Expense(tenant=tenant, **data.dict())
    db.add(e)
    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.put("/{expense_id}")
def update_expense(expense_id: int, data: ExpenseIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.tenant == tenant).first()
    if not e:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(e, k, v)
    db.commit()
    return _serialize(e)


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.tenant == tenant).first()
    if not e:
        raise HTTPException(404)
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def expense_summary(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    expenses = db.query(Expense).filter(
        Expense.tenant == tenant,
        Expense.date >= from_date,
        Expense.date <= to_date,
    ).all()

    by_cat: dict = {}
    for e in expenses:
        by_cat[e.category] = round(by_cat.get(e.category, 0.0) + e.amount, 2)

    return {
        "total": round(sum(e.amount for e in expenses), 2),
        "count": len(expenses),
        "by_category": [
            {"category": k, "amount": v}
            for k, v in sorted(by_cat.items(), key=lambda x: -x[1])
        ],
    }
