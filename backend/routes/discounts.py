from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Discount, Unit
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/discounts", tags=["discounts"])


class DiscountIn(BaseModel):
    name: str
    discount_type: str = "percent"   # percent | fixed
    value: float = 0.0
    condition_type: str = "none"     # none | early_booking | long_stay | last_minute | promo
    condition_value: Optional[int] = None
    unit_id: Optional[int] = None
    unit_type: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_active: bool = True
    notes: Optional[str] = None


def _serialize(d: Discount, unit_name: str = None) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "discount_type": d.discount_type,
        "value": d.value,
        "condition_type": d.condition_type,
        "condition_value": d.condition_value,
        "unit_id": d.unit_id,
        "unit_name": unit_name or "",
        "unit_type": d.unit_type or "",
        "date_from": d.date_from.isoformat() if d.date_from else None,
        "date_to": d.date_to.isoformat() if d.date_to else None,
        "is_active": d.is_active,
        "notes": d.notes or "",
    }


@router.get("/")
def list_discounts(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    discounts = db.query(Discount).filter(Discount.tenant == tenant).order_by(Discount.name).all()
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return [_serialize(d, unit_map.get(d.unit_id) if d.unit_id else None) for d in discounts]


@router.post("/", status_code=201)
def create_discount(data: DiscountIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    d = Discount(tenant=tenant, **data.dict())
    db.add(d)
    db.commit()
    db.refresh(d)
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return _serialize(d, unit_map.get(d.unit_id) if d.unit_id else None)


@router.put("/{discount_id}")
def update_discount(discount_id: int, data: DiscountIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    d = db.query(Discount).filter(Discount.id == discount_id, Discount.tenant == tenant).first()
    if not d:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(d, k, v)
    db.commit()
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return _serialize(d, unit_map.get(d.unit_id) if d.unit_id else None)


@router.delete("/{discount_id}")
def delete_discount(discount_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    d = db.query(Discount).filter(Discount.id == discount_id, Discount.tenant == tenant).first()
    if not d:
        raise HTTPException(404)
    db.delete(d)
    db.commit()
    return {"ok": True}
