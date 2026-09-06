import secrets
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_tenant
from models import Unit, Booking, BookingInquiry, GuestPortalSettings

router = APIRouter()


def _get_unit_by_token(token: str, db: Session) -> Unit:
    unit = db.query(Unit).filter(Unit.widget_token == token, Unit.is_active == True).first()
    if not unit:
        raise HTTPException(404, "Widget not found")
    return unit


def _booked_dates(unit_id: int, db: Session) -> list[str]:
    today = date.today()
    end = today + timedelta(days=365)
    bookings = (
        db.query(Booking)
        .filter(
            Booking.unit_id == unit_id,
            Booking.check_out >= today,
            Booking.check_in <= end,
            Booking.status.notin_(["cancelled"]),
        )
        .all()
    )
    days = set()
    for b in bookings:
        cur = b.check_in
        while cur < b.check_out:
            if cur >= today:
                days.add(cur.isoformat())
            cur += timedelta(days=1)
    return sorted(days)


# ── Public widget endpoints (no auth) ─────────────────────────────────────────

@router.get("/info/{token}")
def widget_info(token: str, db: Session = Depends(get_db)):
    unit = _get_unit_by_token(token, db)
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == unit.tenant).first()
    return {
        "unit_id": unit.id,
        "unit_name": unit.name,
        "unit_type": unit.type,
        "capacity": unit.capacity,
        "description": unit.description or "",
        "base_price": unit.base_price,
        "property_name": (s and s.property_name) or unit.name,
        "primary_color": (s and s.primary_color) or "#1e3a5f",
        "logo_url": (s and s.logo_url) or "",
        "booked_dates": _booked_dates(unit.id, db),
    }


@router.post("/inquiry/{token}")
def submit_inquiry(token: str, body: dict, db: Session = Depends(get_db)):
    unit = _get_unit_by_token(token, db)

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
            unit_name=unit.name,
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
    units = db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "type": u.type,
            "capacity": u.capacity,
            "widget_token": u.widget_token,
        }
        for u in units
    ]


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
            "unit_name": r.unit.name if r.unit else "—",
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
    if "status" in body:
        inq.status = body["status"]
    db.commit()
    return {"saved": True}
