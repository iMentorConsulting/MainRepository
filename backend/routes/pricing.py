from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import SeasonalRate, Unit, Discount
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/pricing", tags=["pricing"])


def _best_rate(unit_id: int, unit: Unit, check_in: date, tenant: str, db) -> Optional[SeasonalRate]:
    rates = (
        db.query(SeasonalRate)
        .filter(
            SeasonalRate.tenant == tenant,
            SeasonalRate.date_from <= check_in,
            SeasonalRate.date_to >= check_in,
        )
        .all()
    )
    specific = [r for r in rates if r.unit_id == unit_id]
    by_type = [r for r in rates if not r.unit_id and r.unit_type == unit.type]
    general = [r for r in rates if not r.unit_id and not r.unit_type]
    matched = specific or by_type or general
    return matched[0] if matched else None


def get_applicable_discounts(unit_id: int, unit_type: str, check_in: date, check_out: date,
                              booking_date: date, tenant: str, db, subtotal: float) -> list:
    """Return list of applicable discount dicts with savings, picking the best per-discount."""
    nights = (check_out - check_in).days
    days_ahead = (check_in - booking_date).days

    all_discounts = db.query(Discount).filter(Discount.tenant == tenant, Discount.is_active == True).all()
    applicable = []
    for d in all_discounts:
        if d.unit_id and d.unit_id != unit_id:
            continue
        if d.unit_type and d.unit_type != unit_type:
            continue
        if d.date_from and check_in < d.date_from:
            continue
        if d.date_to and check_in > d.date_to:
            continue
        if d.condition_type == 'early_booking':
            if not d.condition_value or days_ahead < d.condition_value:
                continue
        elif d.condition_type == 'long_stay':
            if not d.condition_value or nights < d.condition_value:
                continue
        elif d.condition_type == 'last_minute':
            if not d.condition_value or days_ahead > d.condition_value:
                continue
        savings = round(subtotal * d.value / 100, 2) if d.discount_type == 'percent' else round(min(d.value, subtotal), 2)
        applicable.append({
            "id": d.id, "name": d.name, "discount_type": d.discount_type,
            "value": d.value, "condition_type": d.condition_type,
            "condition_value": d.condition_value, "savings": savings,
        })
    return applicable


def get_suggested_price(unit_id: int, check_in: date, check_out: date, tenant: str, db) -> float:
    """Return suggested total price based on seasonal rates + discounts, falling back to unit base_price."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        return 0.0
    matched = _best_rate(unit_id, unit, check_in, tenant, db)
    nights = max((check_out - check_in).days, 1)
    price_per_night = matched.price_per_night if matched else unit.base_price
    subtotal = round(price_per_night * nights, 2)
    discounts = get_applicable_discounts(unit_id, unit.type, check_in, check_out, date.today(), tenant, db, subtotal)
    total_savings = sum(d["savings"] for d in discounts)
    return round(max(0, subtotal - total_savings), 2)


class RateIn(BaseModel):
    name: str
    unit_id: Optional[int] = None
    unit_type: Optional[str] = None
    date_from: date
    date_to: date
    price_per_night: float
    min_stay: int = 1
    notes: Optional[str] = None


def _serialize(r: SeasonalRate, unit_name: str = None) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "unit_id": r.unit_id,
        "unit_name": unit_name or "",
        "unit_type": r.unit_type or "",
        "date_from": r.date_from.isoformat(),
        "date_to": r.date_to.isoformat(),
        "price_per_night": r.price_per_night,
        "min_stay": r.min_stay,
        "notes": r.notes or "",
    }


@router.get("/rates")
def list_rates(
    year: Optional[int] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    q = db.query(SeasonalRate).filter(SeasonalRate.tenant == tenant)
    if year:
        q = q.filter(
            SeasonalRate.date_from <= date(year, 12, 31),
            SeasonalRate.date_to >= date(year, 1, 1),
        )
    if unit_id:
        q = q.filter(or_(SeasonalRate.unit_id == unit_id, SeasonalRate.unit_id.is_(None)))
    rates = q.order_by(SeasonalRate.date_from).all()
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return [_serialize(r, unit_map.get(r.unit_id) if r.unit_id else None) for r in rates]


@router.post("/rates")
def create_rate(data: RateIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = SeasonalRate(tenant=tenant, **data.dict())
    db.add(r)
    db.commit()
    db.refresh(r)
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return _serialize(r, unit_map.get(r.unit_id) if r.unit_id else None)


@router.put("/rates/{rate_id}")
def update_rate(rate_id: int, data: RateIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = db.query(SeasonalRate).filter(SeasonalRate.id == rate_id, SeasonalRate.tenant == tenant).first()
    if not r:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(r, k, v)
    db.commit()
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return _serialize(r, unit_map.get(r.unit_id) if r.unit_id else None)


@router.delete("/rates/{rate_id}")
def delete_rate(rate_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = db.query(SeasonalRate).filter(SeasonalRate.id == rate_id, SeasonalRate.tenant == tenant).first()
    if not r:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/check")
def check_price(
    unit_id: int = Query(...),
    check_in: date = Query(...),
    check_out: date = Query(...),
    booking_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    """Return the best applicable seasonal rate, discounts, and final price."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(404)

    matched = _best_rate(unit_id, unit, check_in, tenant, db)
    nights = (check_out - check_in).days
    price_per_night = matched.price_per_night if matched else unit.base_price
    subtotal = round(price_per_night * nights, 2)

    bd = booking_date or date.today()
    discounts = get_applicable_discounts(unit_id, unit.type, check_in, check_out, bd, tenant, db, subtotal)
    total_savings = sum(d["savings"] for d in discounts)
    final_price = round(max(0, subtotal - total_savings), 2)

    return {
        "rate": _serialize(matched) if matched else None,
        "subtotal": subtotal,
        "discounts": discounts,
        "total_savings": round(total_savings, 2),
        "suggested_price": final_price,
        "nights": nights,
    }
