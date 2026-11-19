from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import SeasonalRate, Unit, Discount, Booking
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
    by_type = [r for r in rates if not r.unit_id and _same_type(r.unit_type, unit.type)]
    general = [r for r in rates if not r.unit_id and not r.unit_type]
    matched = specific or by_type or general
    return matched[0] if matched else None


def _same_type(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and (a or "").strip().lower() == (b or "").strip().lower()


def _ranges(days: list) -> list:
    """Consecutive dates → [[first, last], ...] (ISO strings)."""
    from datetime import timedelta
    out = []
    for d in sorted(days):
        if out and (d - out[-1][1]).days == 1:
            out[-1][1] = d
        else:
            out.append([d, d])
    return [[a.isoformat(), b.isoformat()] for a, b in out]


def quote_stay(unit: Unit, check_in: date, check_out: date, tenant: str, db, booking_date: Optional[date] = None) -> dict:
    """Default price of a stay: each night's seasonal rate (else base price) minus applicable discounts."""
    subtotal, nightly = _stay_subtotal(unit.id, unit, check_in, check_out, tenant, db)
    discounts = get_applicable_discounts(unit.id, unit.type, check_in, check_out, booking_date or date.today(),
                                         tenant, db, subtotal)
    savings = round(sum(d["savings"] for d in discounts), 2)
    uncovered = [date.fromisoformat(n["date"]) for n in nightly if not n["rate"]]
    return {
        "subtotal": subtotal, "discounts": discounts, "total_savings": savings,
        "final_price": round(max(0, subtotal - savings), 2), "nightly": nightly,
        "rate_names": sorted({n["rate"] for n in nightly if n["rate"]}),
        "uncovered_nights": len(uncovered), "uncovered_ranges": _ranges(uncovered),
    }


def _stay_subtotal(unit_id: int, unit: Unit, check_in: date, check_out: date, tenant: str, db):
    """Price every night with the seasonal rate covering it (unit > unit type > general), else base price.
    Returns (subtotal, [{date, price, rate}])."""
    from datetime import timedelta
    rates = db.query(SeasonalRate).filter(
        SeasonalRate.tenant == tenant,
        SeasonalRate.date_from < check_out,
        SeasonalRate.date_to >= check_in,
    ).all()
    nights = []
    d = check_in
    while d < check_out:
        covering = [r for r in rates if r.date_from <= d <= r.date_to]
        matched = ([r for r in covering if r.unit_id == unit_id]
                   or [r for r in covering if not r.unit_id and _same_type(r.unit_type, unit.type)]
                   or [r for r in covering if not r.unit_id and not r.unit_type])
        r = matched[0] if matched else None
        nights.append({"date": d.isoformat(), "price": r.price_per_night if r else (unit.base_price or 0),
                       "rate": r.name if r else None})
        d += timedelta(days=1)
    return round(sum(n["price"] for n in nights), 2), nights


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
        if d.unit_type and d.unit_type.lower() != (unit_type or '').lower():
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
    if check_out <= check_in:
        return 0.0
    subtotal, _ = _stay_subtotal(unit_id, unit, check_in, check_out, tenant, db)
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

    if check_out <= check_in:
        raise HTTPException(400, "Η αναχώρηση πρέπει να είναι μετά την άφιξη")
    matched = _best_rate(unit_id, unit, check_in, tenant, db)
    nights = (check_out - check_in).days
    subtotal, nightly = _stay_subtotal(unit_id, unit, check_in, check_out, tenant, db)
    rate_names = sorted({n["rate"] for n in nightly if n["rate"]})

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
        "avg_per_night": round(subtotal / nights, 2) if nights else 0,
        "rate_names": rate_names,
        "uses_base_price": any(not n["rate"] for n in nightly),
        "uncovered_nights": sum(1 for n in nightly if not n["rate"]),
        "uncovered_ranges": _ranges([date.fromisoformat(n["date"]) for n in nightly if not n["rate"]]),
        "base_price": unit.base_price,
    }


@router.get("/coverage")
def pricing_coverage(year: int = Query(...), property_id: Optional[int] = None,
                     db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Nights of the year not covered by any pricing period, grouped by units sharing the same gaps."""
    q = db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True)
    if property_id:
        q = q.filter(Unit.property_id == property_id)
    groups: dict = {}
    for u in q.all():
        _, nightly = _stay_subtotal(u.id, u, date(year, 1, 1), date(year + 1, 1, 1), tenant, db)
        gaps = _ranges([date.fromisoformat(n["date"]) for n in nightly if not n["rate"]])
        if gaps:
            key = repr(gaps)
            g = groups.setdefault(key, {"ranges": gaps, "units": [], "nights": sum(1 for n in nightly if not n["rate"]),
                                        "base_prices": set()})
            g["units"].append(u.name)
            g["base_prices"].add(u.base_price)
    return [{**g, "units": sorted(g["units"]), "base_prices": sorted(g["base_prices"])} for g in groups.values()]


def _audit_row(b: Booking, db, tenant: str) -> dict:
    booked_on = b.created_at.date() if b.created_at else date.today()
    q = quote_stay(b.unit, b.check_in, b.check_out, tenant, db, booking_date=booked_on)
    diff = round((b.total_price or 0) - q["final_price"], 2)
    return {
        "id": b.id, "unit_id": b.unit_id, "unit_name": b.unit.name,
        "guest": f"{b.customer.first_name} {b.customer.last_name}".strip() if b.customer else "",
        "channel": b.channel, "check_in": b.check_in.isoformat(), "check_out": b.check_out.isoformat(),
        "nights": (b.check_out - b.check_in).days, "booked_on": booked_on.isoformat(),
        "actual": round(b.total_price or 0, 2), "expected": q["final_price"], "subtotal": q["subtotal"],
        "diff": diff, "diff_pct": round(diff / q["final_price"] * 100, 1) if q["final_price"] else None,
        "rate_names": q["rate_names"], "discounts": [d["name"] for d in q["discounts"]],
        "total_savings": q["total_savings"], "uncovered_nights": q["uncovered_nights"],
        "uncovered_ranges": q["uncovered_ranges"],
    }


@router.get("/audit")
def pricing_audit(year: int = Query(...), property_id: Optional[int] = None, tolerance: float = 1.0,
                  db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Compare every reservation arriving in `year` with its default price (periods + discounts)."""
    from sqlalchemy.orm import joinedload
    q = db.query(Booking).options(joinedload(Booking.unit), joinedload(Booking.customer)).filter(
        Booking.tenant == tenant, Booking.check_in >= date(year, 1, 1), Booking.check_in <= date(year, 12, 31),
        Booking.status != "cancelled", Booking.channel != "blocked",
    )
    if property_id:
        q = q.filter(Booking.unit.has(Unit.property_id == property_id))
    rows = [_audit_row(b, db, tenant) for b in q.order_by(Booking.check_in).all() if b.unit]
    for r in rows:
        r["ok"] = abs(r["diff"]) <= tolerance
    return {
        "year": year, "total": len(rows),
        "mismatched": sum(1 for r in rows if not r["ok"]),
        "uncovered": sum(1 for r in rows if r["uncovered_nights"]),
        "rows": rows,
    }


@router.post("/audit/apply/{booking_id}")
def apply_audit_price(booking_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Set a reservation's total to its default price; commission follows the booking's commission %."""
    b = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant == tenant).first()
    if not b or not b.unit:
        raise HTTPException(404, "Η κράτηση δεν βρέθηκε")
    row = _audit_row(b, db, tenant)
    b.total_price = row["expected"]
    if b.commission_percent:
        b.commission = round(b.total_price * b.commission_percent / 100, 2)
    db.commit()
    return {"ok": True, "total_price": b.total_price, "commission": b.commission}
