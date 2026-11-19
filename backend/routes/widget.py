import secrets
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_tenant
from models import Unit, Booking, BookingInquiry, Customer, GuestPortalSettings, Property, RoomType
from routes.pricing import get_suggested_price, _stay_subtotal, get_applicable_discounts

router = APIRouter()


class _Widget:
    """What a widget token sells: a room type with N interchangeable units, or a single unit (legacy)."""
    def __init__(self, units: list, room_type=None):
        self.units = units
        self.room_type = room_type
        self.rep = units[0]  # representative unit — units of a type share price and capacity
        self.tenant = self.rep.tenant


def _natural_key(name: str):
    import re
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name or "")]


def _get_widget(token: str, db: Session) -> _Widget:
    rt = db.query(RoomType).filter(RoomType.widget_token == token, RoomType.is_active == True).first()
    if rt:
        units = db.query(Unit).filter(Unit.room_type_id == rt.id, Unit.is_active == True).all()
        if not units:
            raise HTTPException(404, "Widget not found")
        return _Widget(sorted(units, key=lambda u: _natural_key(u.name)), rt)
    unit = db.query(Unit).filter(Unit.widget_token == token, Unit.is_active == True).first()
    if not unit:
        raise HTTPException(404, "Widget not found")
    return _Widget([unit])


def _booked_by_unit(unit_ids: list, start: date, end: date, db: Session) -> dict:
    """{unit_id: set of booked night dates} between start and end."""
    taken = {uid: set() for uid in unit_ids}
    for b in db.query(Booking).filter(
        Booking.unit_id.in_(unit_ids),
        Booking.check_out > start,
        Booking.check_in < end,
        Booking.status.notin_(["cancelled"]),
    ):
        cur = max(b.check_in, start)
        while cur < min(b.check_out, end):
            taken[b.unit_id].add(cur)
            cur += timedelta(days=1)
    return taken


def _availability(w: _Widget, db: Session):
    """(dates with no unit left, {date: units still free} for partially booked dates) for the next year."""
    today = date.today()
    end = today + timedelta(days=365)
    taken = _booked_by_unit([u.id for u in w.units], today, end, db)
    counts: dict = {}
    for nights in taken.values():
        for d in nights:
            counts[d] = counts.get(d, 0) + 1
    total = len(w.units)
    full = sorted(d.isoformat() for d, n in counts.items() if n >= total)
    partial = {d.isoformat(): total - n for d, n in counts.items() if n < total}
    return full, partial


def _free_unit(w: _Widget, ci: date, co: date, db: Session, exclude_inquiry_units: bool = True):
    """First unit (natural order) free for the whole stay; pending widget requests also hold a unit."""
    taken = _booked_by_unit([u.id for u in w.units], ci, co, db)
    held = set()
    if exclude_inquiry_units:
        held = {i.unit_id for i in db.query(BookingInquiry).filter(
            BookingInquiry.unit_id.in_([u.id for u in w.units]), BookingInquiry.status == "pending",
            BookingInquiry.check_out > ci, BookingInquiry.check_in < co)}
    for u in w.units:
        if not taken[u.id] and u.id not in held:
            return u
    for u in w.units:  # every free unit is already held by a pending request: still accept, manager decides
        if not taken[u.id]:
            return u
    return None


# ── Public widget endpoints (no auth) ─────────────────────────────────────────

@router.get("/price/{token}")
def widget_price(
    token: str,
    check_in: date = Query(...),
    check_out: date = Query(...),
    db: Session = Depends(get_db),
):
    w = _get_widget(token, db)
    unit = w.rep
    if check_out <= check_in:
        raise HTTPException(400, "check_out must be after check_in")
    nights = (check_out - check_in).days
    subtotal, _ = _stay_subtotal(unit.id, unit, check_in, check_out, unit.tenant, db)
    price_per_night = round(subtotal / nights, 2)
    discounts = get_applicable_discounts(unit.id, unit.type, check_in, check_out, date.today(), unit.tenant, db, subtotal)
    total_savings = sum(d["savings"] for d in discounts)
    final_price = round(max(0, subtotal - total_savings), 2)
    return {
        "nights": nights,
        "price_per_night": price_per_night,
        "subtotal": subtotal,
        "discounts": discounts,
        "total_savings": round(total_savings, 2),
        "final_price": final_price,
    }


@router.get("/info/{token}")
def widget_info(token: str, db: Session = Depends(get_db)):
    w = _get_widget(token, db)
    unit, rt = w.rep, w.room_type
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == unit.tenant).first()
    prop = db.get(Property, (rt.property_id if rt else unit.property_id)) if (rt or unit.property_id) else None
    full, partial = _availability(w, db)
    return {
        "unit_id": unit.id,
        "room_type_id": rt.id if rt else None,
        "unit_name": rt.name if rt else unit.name,
        "unit_type": rt.name if rt else unit.type,
        "capacity": rt.capacity if rt else unit.capacity,
        "description": (rt.description if rt else unit.description) or "",
        "base_price": rt.base_price if rt else unit.base_price,
        "property_name": prop.name if prop else unit.name,
        "total_units": len(w.units),
        "available_counts": partial,
        "checkin_time": (s and s.checkin_time) or "14:00",
        "checkout_time": (s and s.checkout_time) or "11:00",
        "manager_phone": (s and s.manager_phone) or "",
        "welcome_message": (s and s.welcome_message) or "",
        "booked_dates": full,
    }


@router.post("/inquiry/{token}")
def submit_inquiry(token: str, body: dict, db: Session = Depends(get_db)):
    w = _get_widget(token, db)

    name = (body.get("guest_name") or "").strip()
    email = (body.get("guest_email") or "").strip()
    if not name or not email:
        raise HTTPException(400, "Name and email are required")

    try:
        ci = date.fromisoformat(body["check_in"])
        co = date.fromisoformat(body["check_out"])
    except Exception:
        raise HTTPException(400, "Invalid dates")

    if co <= ci:
        raise HTTPException(400, "Check-out must be after check-in")

    unit = _free_unit(w, ci, co, db)
    if not unit:
        raise HTTPException(409, "No availability for these dates")

    inq = BookingInquiry(
        tenant=unit.tenant,
        unit_id=unit.id,
        guest_name=name,
        guest_email=email,
        guest_phone=(body.get("guest_phone") or "").strip(),
        check_in=ci,
        check_out=co,
        guests=int(body.get("guests") or 1),
        message=(body.get("message") or "").strip(),
        status="pending",
    )
    db.add(inq)
    db.commit()
    db.refresh(inq)

    # Email notification to manager
    try:
        s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == unit.tenant).first()
        nights = (co - ci).days
        content = (
            f"Check-in: {ci.strftime('%d/%m/%Y')}\n"
            f"Check-out: {co.strftime('%d/%m/%Y')} ({nights} nights)\n"
            f"Guests: {inq.guests}\n"
            f"Email: {email}\n"
            f"Phone: {inq.guest_phone or '—'}\n"
            + (f"\nMessage:\n{inq.message}" if inq.message else "")
        )
        from email_utils import send_notification_email
        send_notification_email(
            event_type="service_request",
            guest_name=name,
            unit_name=(f"{w.room_type.name} ({unit.name})" if w.room_type else unit.name),
            content=content,
            portal_admin_url="/widget-admin",
            settings=s,
        )
    except Exception:
        pass

    return {"id": inq.id, "status": "pending"}


# ── Authenticated admin endpoints ─────────────────────────────────────────────

@router.get("/units")
def list_widget_units(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """
    One widget per room type. A single-unit type (a villa) keeps using its unit's token so widgets
    already embedded on websites keep working; multi-unit types get a token of their own.
    """
    units = db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True).all()
    types = {rt.id: rt for rt in db.query(RoomType).filter(RoomType.tenant == tenant)}
    props = {p.id: p.name for p in db.query(Property).filter(Property.tenant == tenant)}
    by_type: dict = {}
    loose = []
    for u in units:
        (by_type.setdefault(u.room_type_id, []) if u.room_type_id in types else loose).append(u)
    out = []
    for rt_id, us in by_type.items():
        rt = types[rt_id]
        multi = len(us) > 1
        out.append({
            "id": us[0].id if not multi else None,      # unit id (single-unit widget)
            "room_type_id": rt.id if multi else None,   # type id (multi-unit widget)
            "name": rt.name if multi else us[0].name,
            "type": rt.name,
            "capacity": rt.capacity if multi else us[0].capacity,
            "units_count": len(us),
            "property_name": props.get(rt.property_id, ""),
            "widget_token": rt.widget_token if multi else us[0].widget_token,
        })
    for u in loose:
        out.append({"id": u.id, "room_type_id": None, "name": u.name, "type": u.type, "capacity": u.capacity,
                    "units_count": 1, "property_name": props.get(u.property_id, ""), "widget_token": u.widget_token})
    return sorted(out, key=lambda x: (x["property_name"], _natural_key(x["name"])))


@router.post("/generate-type-token/{room_type_id}")
def generate_type_token(room_type_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rt = db.query(RoomType).filter(RoomType.id == room_type_id, RoomType.tenant == tenant).first()
    if not rt:
        raise HTTPException(404, "Room type not found")
    if not rt.widget_token:
        rt.widget_token = secrets.token_urlsafe(32)
        db.commit()
    return {"widget_token": rt.widget_token}


@router.post("/regenerate-type-token/{room_type_id}")
def regenerate_type_token(room_type_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rt = db.query(RoomType).filter(RoomType.id == room_type_id, RoomType.tenant == tenant).first()
    if not rt:
        raise HTTPException(404, "Room type not found")
    rt.widget_token = secrets.token_urlsafe(32)
    db.commit()
    return {"widget_token": rt.widget_token}


@router.post("/generate-token/{unit_id}")
def generate_widget_token(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(404, "Unit not found")
    if not unit.widget_token:
        unit.widget_token = secrets.token_urlsafe(32)
        db.commit()
    return {"widget_token": unit.widget_token}


@router.post("/regenerate-token/{unit_id}")
def regenerate_widget_token(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(404, "Unit not found")
    unit.widget_token = secrets.token_urlsafe(32)
    db.commit()
    return {"widget_token": unit.widget_token}


@router.get("/inquiries")
def list_inquiries(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rows = (
        db.query(BookingInquiry)
        .filter(BookingInquiry.tenant == tenant)
        .order_by(BookingInquiry.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "unit_id": r.unit_id,
            "unit_name": (f"{r.unit.type} ({r.unit.name})" if r.unit and r.unit.room_type_id
                          and r.unit.type != r.unit.name else (r.unit.name if r.unit else "—")),
            "guest_name": r.guest_name,
            "guest_email": r.guest_email,
            "guest_phone": r.guest_phone,
            "check_in": r.check_in.isoformat(),
            "check_out": r.check_out.isoformat(),
            "guests": r.guests,
            "message": r.message,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.patch("/inquiries/{inq_id}")
def update_inquiry(inq_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    inq = db.query(BookingInquiry).filter(BookingInquiry.id == inq_id, BookingInquiry.tenant == tenant).first()
    if not inq:
        raise HTTPException(404, "Not found")

    new_status = body.get("status")
    if new_status:
        inq.status = new_status

    booking_id = None
    if new_status == "confirmed":
        # Find or create a Customer from the inquiry guest data
        name_parts = inq.guest_name.strip().split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        customer = db.query(Customer).filter(
            Customer.tenant == tenant,
            Customer.email == inq.guest_email,
        ).first()
        if not customer:
            customer = Customer(
                tenant=tenant,
                first_name=first_name,
                last_name=last_name,
                email=inq.guest_email,
                phone=inq.guest_phone or "",
            )
            db.add(customer)
            db.flush()

        # The suite held by the request may have been booked meanwhile: move to a free unit of the same type
        unit = db.get(Unit, inq.unit_id)
        if _booked_by_unit([inq.unit_id], inq.check_in, inq.check_out, db)[inq.unit_id]:
            alt = None
            if unit and unit.room_type_id:
                siblings = db.query(Unit).filter(Unit.room_type_id == unit.room_type_id, Unit.is_active == True).all()
                alt = _free_unit(_Widget(sorted(siblings, key=lambda u: _natural_key(u.name))),
                                 inq.check_in, inq.check_out, db)  # prefers units no other request holds
            if not alt:
                raise HTTPException(409, "Δεν υπάρχει πλέον διαθέσιμη μονάδα για αυτές τις ημερομηνίες")
            inq.unit_id = alt.id

        total_price = get_suggested_price(inq.unit_id, inq.check_in, inq.check_out, tenant, db)

        booking = Booking(
            tenant=tenant,
            unit_id=inq.unit_id,
            customer_id=customer.id,
            channel="Direct",
            check_in=inq.check_in,
            check_out=inq.check_out,
            guests=inq.guests or 1,
            total_price=total_price,
            commission=0.0,
            commission_percent=0.0,
            status="confirmed",
            notes=inq.message or None,
        )
        db.add(booking)
        db.flush()
        booking_id = booking.id

    db.commit()
    return {"saved": True, "booking_id": booking_id}
