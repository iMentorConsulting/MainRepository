from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import SeasonalRate, Unit
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/pricing", tags=["pricing"])


def get_suggested_price(unit_id: int, check_in: date, check_out: date, tenant: str, db) -> float:
    """Return suggested total price based on seasonal rates, falling back to unit base_price."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        return 0.0
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
    nights = max((check_out - check_in).days, 1)
    price_per_night = matched[0].price_per_night if matched else unit.base_price
    return round(price_per_night * nights, 2)


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
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    """Return the best applicable seasonal rate and suggested total price."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(404)

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
    nights = (check_out - check_in).days
    if not matched:
        return {"rate": None, "suggested_price": round(unit.base_price * nights, 2), "nights": nights}

    rate = matched[0]
    return {
        "rate": _serialize(rate),
        "suggested_price": round(rate.price_per_night * nights, 2),
        "nights": nights,
    }
