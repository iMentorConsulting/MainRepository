from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Booking, Unit
from auth_utils import get_tenant
from typing import Optional
from datetime import date

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
def dashboard_stats(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    today = date.today()

    arrivals_today = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.check_in == today,
        Booking.status.in_(["confirmed", "pending"]),
    ).count()

    departures_today = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.check_out == today,
        Booking.status == "confirmed",
    ).count()

    currently_occupied = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.check_in <= today,
        Booking.check_out > today,
        Booking.status == "confirmed",
    ).count()

    total_units = db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True).count()
    occupancy_rate = round(currently_occupied / total_units * 100, 1) if total_units else 0

    month_start = today.replace(day=1)
    monthly_revenue = (
        db.query(func.sum(Booking.total_price))
        .filter(
            Booking.tenant == tenant,
            Booking.check_in >= month_start,
            Booking.check_in <= today,
            Booking.status == "confirmed",
        )
        .scalar() or 0.0
    )

    upcoming = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.check_in > today,
        Booking.status.in_(["confirmed", "pending"]),
    ).count()

    return {
        "today": today.isoformat(),
        "arrivals_today": arrivals_today,
        "departures_today": departures_today,
        "currently_occupied": currently_occupied,
        "total_units": total_units,
        "occupancy_rate": occupancy_rate,
        "upcoming_bookings": upcoming,
        "monthly_revenue": round(float(monthly_revenue), 2),
    }


@router.get("/occupancy")
def occupancy_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    total_days = (to_date - from_date).days
    if total_days <= 0:
        return {"error": "Μη έγκυρο εύρος ημερομηνιών"}

    units_q = db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True)
    if unit_id:
        units_q = units_q.filter(Unit.id == unit_id)
    units = units_q.order_by(Unit.name).all()

    results = []
    for u in units:
        bkgs = db.query(Booking).filter(
            Booking.unit_id == u.id,
            Booking.tenant == tenant,
            Booking.status == "confirmed",
            Booking.check_out > from_date,
            Booking.check_in < to_date,
        ).all()

        occupied = 0
        rev = 0.0
        net = 0.0
        for b in bkgs:
            b_start = max(b.check_in, from_date)
            b_end = min(b.check_out, to_date)
            occupied += (b_end - b_start).days
            rev += b.total_price
            net += b.total_price - b.commission

        results.append({
            "unit_id": u.id,
            "unit_name": u.name,
            "unit_type": u.type,
            "total_days": total_days,
            "occupied_days": occupied,
            "free_days": total_days - occupied,
            "occupancy_rate": round(occupied / total_days * 100, 1),
            "total_revenue": round(rev, 2),
            "net_revenue": round(net, 2),
            "bookings_count": len(bkgs),
        })

    avg_occ = round(sum(r["occupancy_rate"] for r in results) / len(results), 1) if results else 0
    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "units": results,
        "summary": {
            "total_units": len(results),
            "avg_occupancy_rate": avg_occ,
            "total_revenue": round(sum(r["total_revenue"] for r in results), 2),
            "total_net_revenue": round(sum(r["net_revenue"] for r in results), 2),
        },
    }


@router.get("/by-channel")
def by_channel(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    bookings = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.status == "confirmed",
        Booking.check_in >= from_date,
        Booking.check_in < to_date,
    ).all()

    channels: dict = {}
    for b in bookings:
        ch = b.channel
        if ch not in channels:
            channels[ch] = {"channel": ch, "bookings_count": 0, "total_nights": 0, "total_revenue": 0.0, "total_commission": 0.0, "net_revenue": 0.0}
        nights = (b.check_out - b.check_in).days
        channels[ch]["bookings_count"] += 1
        channels[ch]["total_nights"] += nights
        channels[ch]["total_revenue"] += b.total_price
        channels[ch]["total_commission"] += b.commission
        channels[ch]["net_revenue"] += b.total_price - b.commission

    data = []
    for c in channels.values():
        c["total_revenue"] = round(c["total_revenue"], 2)
        c["total_commission"] = round(c["total_commission"], 2)
        c["net_revenue"] = round(c["net_revenue"], 2)
        data.append(c)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "channels": data,
        "total_bookings": len(bookings),
        "total_revenue": round(sum(b.total_price for b in bookings), 2),
        "total_net_revenue": round(sum(b.total_price - b.commission for b in bookings), 2),
    }


@router.get("/financial")
def financial_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    group_by: str = Query("month"),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    bookings = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.status == "confirmed",
        Booking.check_in >= from_date,
        Booking.check_in < to_date,
    ).all()

    groups: dict = {}
    for b in bookings:
        if group_by == "month":
            key = b.check_in.strftime("%Y-%m")
            label = b.check_in.strftime("%m/%Y")
        elif group_by == "week":
            key = b.check_in.strftime("%Y-W%W")
            label = f"Εβδ. {b.check_in.strftime('%W')}/{b.check_in.year}"
        else:
            key = b.channel
            label = b.channel

        if key not in groups:
            groups[key] = {"key": key, "label": label, "bookings_count": 0, "nights": 0, "total_revenue": 0.0, "total_commission": 0.0, "net_revenue": 0.0}
        nights = (b.check_out - b.check_in).days
        groups[key]["bookings_count"] += 1
        groups[key]["nights"] += nights
        groups[key]["total_revenue"] += b.total_price
        groups[key]["total_commission"] += b.commission
        groups[key]["net_revenue"] += b.total_price - b.commission

    data = []
    for g in sorted(groups.values(), key=lambda x: x["key"]):
        g["avg_stay"] = round(g["nights"] / g["bookings_count"], 1) if g["bookings_count"] else 0
        g["total_revenue"] = round(g["total_revenue"], 2)
        g["total_commission"] = round(g["total_commission"], 2)
        g["net_revenue"] = round(g["net_revenue"], 2)
        data.append(g)

    return {"from_date": from_date.isoformat(), "to_date": to_date.isoformat(), "group_by": group_by, "data": data}


@router.get("/price-analytics")
def price_analytics(
    from_date: date = Query(...),
    to_date: date = Query(...),
    group_by: str = Query("month"),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    bookings = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.status == "confirmed",
        Booking.check_in >= from_date,
        Booking.check_in < to_date,
    ).all()

    CHANNEL_LABELS = {
        'booking': 'Booking.com', 'airbnb': 'Airbnb', 'direct': 'Απευθείας',
        'oga': 'ΟΓΑ', 'social_tourism': 'Κοιν.Τουρισμός', 'other': 'Άλλο',
    }

    groups: dict = {}
    for b in bookings:
        nights = (b.check_out - b.check_in).days
        if nights <= 0:
            continue
        if group_by == "month":
            key = b.check_in.strftime("%Y-%m")
            label = b.check_in.strftime("%m/%Y")
        elif group_by == "week":
            key = b.check_in.strftime("%Y-W%W")
            label = f"Εβδ.{b.check_in.strftime('%W')}/{b.check_in.year}"
        else:
            key = b.channel
            label = CHANNEL_LABELS.get(b.channel, b.channel)

        if key not in groups:
            groups[key] = {"key": key, "label": label, "bookings_count": 0, "total_nights": 0, "total_revenue": 0.0}
        groups[key]["bookings_count"] += 1
        groups[key]["total_nights"] += nights
        groups[key]["total_revenue"] += b.total_price

    data = []
    for g in sorted(groups.values(), key=lambda x: x["key"]):
        g["avg_price_per_night"] = round(g["total_revenue"] / g["total_nights"], 2) if g["total_nights"] > 0 else 0
        g["total_revenue"] = round(g["total_revenue"], 2)
        data.append(g)

    total_nights = sum((b.check_out - b.check_in).days for b in bookings if (b.check_out - b.check_in).days > 0)
    total_rev = sum(b.total_price for b in bookings)
    overall = round(total_rev / total_nights, 2) if total_nights > 0 else 0

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "group_by": group_by,
        "data": data,
        "overall_avg_price_per_night": overall,
    }
