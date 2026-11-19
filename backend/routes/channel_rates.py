from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ChannelRate, Unit
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/channel-rates", tags=["channel-rates"])


class ChannelRateIn(BaseModel):
    unit_id: int
    channel: str  # airbnb | booking | vrbo | direct
    base_price_weekday: Optional[float] = None
    base_price_weekend: Optional[float] = None
    cleaning_fee: float = 0.0
    extra_guest_fee: float = 0.0
    extra_guest_after: int = 2
    min_stay: int = 1
    max_stay: Optional[int] = None
    weekly_discount_pct: float = 0.0
    monthly_discount_pct: float = 0.0
    notes: Optional[str] = None
    is_active: bool = True


def _serialize(cr: ChannelRate, unit_name: str = None) -> dict:
    return {
        "id": cr.id,
        "unit_id": cr.unit_id,
        "unit_name": unit_name or "",
        "channel": cr.channel,
        "base_price_weekday": cr.base_price_weekday,
        "base_price_weekend": cr.base_price_weekend,
        "cleaning_fee": cr.cleaning_fee,
        "extra_guest_fee": cr.extra_guest_fee,
        "extra_guest_after": cr.extra_guest_after,
        "min_stay": cr.min_stay,
        "max_stay": cr.max_stay,
        "weekly_discount_pct": cr.weekly_discount_pct,
        "monthly_discount_pct": cr.monthly_discount_pct,
        "notes": cr.notes or "",
        "is_active": cr.is_active,
        "created_at": cr.created_at.isoformat() if cr.created_at else None,
    }


@router.get("/")
def list_channel_rates(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rates = (
        db.query(ChannelRate)
        .filter(ChannelRate.tenant == tenant, ChannelRate.unit_id == unit_id)
        .order_by(ChannelRate.channel)
        .all()
    )
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return [_serialize(r, unit_map.get(r.unit_id)) for r in rates]


@router.post("/", status_code=201)
def create_channel_rate(data: ChannelRateIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    # Verify the unit belongs to this tenant
    unit = db.query(Unit).filter(Unit.id == data.unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(404, "Unit not found")
    cr = ChannelRate(tenant=tenant, **data.dict())
    db.add(cr)
    db.commit()
    db.refresh(cr)
    return _serialize(cr, unit.name)


@router.put("/{rate_id}")
def update_channel_rate(rate_id: int, data: ChannelRateIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    cr = db.query(ChannelRate).filter(ChannelRate.id == rate_id, ChannelRate.tenant == tenant).first()
    if not cr:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(cr, k, v)
    db.commit()
    unit_map = {u.id: u.name for u in db.query(Unit).filter(Unit.tenant == tenant).all()}
    return _serialize(cr, unit_map.get(cr.unit_id))


@router.delete("/{rate_id}")
def delete_channel_rate(rate_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    cr = db.query(ChannelRate).filter(ChannelRate.id == rate_id, ChannelRate.tenant == tenant).first()
    if not cr:
        raise HTTPException(404)
    db.delete(cr)
    db.commit()
    return {"ok": True}
