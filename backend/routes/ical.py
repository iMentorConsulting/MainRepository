import re
import secrets
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Booking, Unit, Customer, AvailabilityRule
from auth_utils import get_tenant
import requests
from icalendar import Calendar

router = APIRouter(prefix="/ical", tags=["ical"])

SKIP_KEYWORDS = {'CLOSED', 'BLOCKED', 'NOT AVAILABLE', 'UNAVAILABLE', 'ΚΛΕΙΣΤΟ'}


def _parse_description(desc: str) -> dict:
    """Extract guests, phone, reservation_code from Airbnb DESCRIPTION field."""
    info = {}
    if not desc:
        return info
    # Number of Guests: 2
    m = re.search(r'(?:Number of Guests|Guests)\s*:\s*(\d+)', desc, re.IGNORECASE)
    if m:
        info['guests'] = int(m.group(1))
    # Phone Number: +30...  (Airbnb sometimes says HIDDEN)
    m = re.search(r'Phone\s*(?:Number)?\s*:\s*([^\n\\]+)', desc, re.IGNORECASE)
    if m:
        phone = m.group(1).strip()
        if phone.upper() != 'HIDDEN' and phone:
            info['phone'] = phone
    # Reservation code: HM12345678
    m = re.search(r'Reservation\s*[Cc]ode\s*:\s*([A-Z0-9]+)', desc, re.IGNORECASE)
    if m:
        info['reservation_code'] = m.group(1).strip()
    return info


def _sync_unit(unit, db, tenant):
    if not unit.ical_url:
        return {"unit": unit.name, "skipped": True}

    try:
        resp = requests.get(unit.ical_url, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        return {"unit": unit.name, "error": str(e), "added": 0, "updated": 0}

    try:
        cal = Calendar.from_ical(resp.content)
    except Exception as e:
        return {"unit": unit.name, "error": f"iCal parse error: {e}", "added": 0, "updated": 0}

    added = updated = 0

    for component in cal.walk():
        if component.name != 'VEVENT':
            continue

        uid = str(component.get('UID', '')).strip()
        if not uid:
            continue

        summary = str(component.get('SUMMARY', '')).strip()
        if any(k in summary.upper() for k in SKIP_KEYWORDS):
            continue

        try:
            dtstart = component.get('DTSTART').dt
            dtend = component.get('DTEND').dt
        except Exception:
            continue

        if hasattr(dtstart, 'date'):
            dtstart = dtstart.date()
        if hasattr(dtend, 'date'):
            dtend = dtend.date()

        if dtstart >= dtend:
            continue

        existing = db.query(Booking).filter(
            Booking.tenant == tenant,
            Booking.unit_id == unit.id,
            Booking.ical_uid == uid,
        ).first()

        desc_raw = str(component.get('DESCRIPTION', '') or '')
        desc_info = _parse_description(desc_raw)

        if existing:
            changed = False
            if existing.check_in != dtstart or existing.check_out != dtend:
                existing.check_in = dtstart
                existing.check_out = dtend
                changed = True
            if desc_info.get('guests') and existing.guests == 1:
                existing.guests = desc_info['guests']
                changed = True
            if changed:
                db.commit()
                updated += 1
        else:
            # Derive guest name from summary
            clean_summary = summary
            for sfx in (' Guest', ' guest', ' Guests', ' guests'):
                clean_summary = clean_summary.replace(sfx, '')
            parts = clean_summary.split(' ', 1) if clean_summary and clean_summary.lower() not in ('reservation', 'κράτηση', '') else []
            first_name = parts[0] if parts else 'Airbnb'
            last_name = parts[1] if len(parts) > 1 else 'Guest'

            phone = desc_info.get('phone', '')
            customer = db.query(Customer).filter(
                Customer.tenant == tenant,
                Customer.first_name == first_name,
                Customer.last_name == last_name,
            ).first()
            if not customer:
                customer = Customer(tenant=tenant, first_name=first_name, last_name=last_name, phone=phone)
                db.add(customer)
                db.flush()
            elif phone and not customer.phone:
                customer.phone = phone

            res_code = desc_info.get('reservation_code', '')
            notes = f"Airbnb {res_code}".strip() if res_code else None

            db.add(Booking(
                tenant=tenant,
                unit_id=unit.id,
                customer_id=customer.id,
                channel='Airbnb',
                check_in=dtstart,
                check_out=dtend,
                guests=desc_info.get('guests', 1),
                total_price=0.0,
                commission=0.0,
                status='confirmed',
                ical_uid=uid,
                notes=notes,
            ))
            db.commit()
            added += 1

    return {"unit": unit.name, "added": added, "updated": updated}


@router.post("/sync")
def sync_all(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    units = db.query(Unit).filter(
        Unit.tenant == tenant,
        Unit.is_active == True,
        Unit.ical_url != None,
    ).all()
    results = [_sync_unit(u, db, tenant) for u in units]
    return {
        "results": results,
        "total_added": sum(r.get("added", 0) for r in results),
        "total_updated": sum(r.get("updated", 0) for r in results),
    }


@router.post("/sync/{unit_id}")
def sync_unit(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    return _sync_unit(unit, db, tenant)


# ── iCal Export (public feed) ─────────────────────────────────────────────────

def _build_ical(unit: Unit, bookings, stop_rules=None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iStay//Booking Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{unit.name}",
    ]
    for b in bookings:
        dtstart = b.check_in.strftime("%Y%m%d")
        dtend = b.check_out.strftime("%Y%m%d")
        uid = b.ical_uid or f"booking-{b.id}@istay.villabooking"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{dtstart}",
            f"DTEND;VALUE=DATE:{dtend}",
            "SUMMARY:RESERVED",
            "STATUS:CONFIRMED",
            "END:VEVENT",
        ]
    for r in (stop_rules or []):
        # Each stop_sales day becomes a single-day blocked event
        dtstart = r.date.strftime("%Y%m%d")
        from datetime import timedelta
        dtend = (r.date + timedelta(days=1)).strftime("%Y%m%d")
        uid = f"blocked-{r.id}@istay.villabooking"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{dtstart}",
            f"DTEND;VALUE=DATE:{dtend}",
            "SUMMARY:NOT AVAILABLE",
            "STATUS:CONFIRMED",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.get("/feed/{token}", response_class=PlainTextResponse, include_in_schema=False)
def ical_feed(token: str, db: Session = Depends(get_db)):
    unit = db.query(Unit).filter(Unit.ical_export_token == token).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Feed not found")
    today = date.today()
    bookings = (
        db.query(Booking)
        .filter(
            Booking.unit_id == unit.id,
            Booking.tenant == unit.tenant,
            Booking.status.in_(["confirmed", "pending"]),
            Booking.check_out >= today,
        )
        .order_by(Booking.check_in)
        .all()
    )
    stop_rules = (
        db.query(AvailabilityRule)
        .filter(
            AvailabilityRule.unit_id == unit.id,
            AvailabilityRule.tenant == unit.tenant,
            AvailabilityRule.status == 'stop_sales',
            AvailabilityRule.date >= today,
        )
        .order_by(AvailabilityRule.date)
        .all()
    )
    ical_text = _build_ical(unit, bookings, stop_rules)
    return PlainTextResponse(content=ical_text, media_type="text/calendar; charset=utf-8")


@router.get("/export-url/{unit_id}")
def get_export_url(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    if not unit.ical_export_token:
        unit.ical_export_token = secrets.token_urlsafe(32)
        db.commit()
    return {
        "unit_id": unit.id,
        "unit_name": unit.name,
        "ical_export_token": unit.ical_export_token,
        "import_url": unit.ical_url or "",
    }


@router.post("/regenerate-token/{unit_id}")
def regenerate_token(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    unit.ical_export_token = secrets.token_urlsafe(32)
    db.commit()
    return {"ical_export_token": unit.ical_export_token}


@router.put("/import-url/{unit_id}")
def update_import_url(unit_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    unit.ical_url = (body.get("ical_url") or "").strip() or None
    db.commit()
    return {"ok": True, "ical_url": unit.ical_url}


@router.get("/units")
def ical_units(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    units = db.query(Unit).filter(Unit.is_active == True, Unit.tenant == tenant).order_by(Unit.name).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "type": u.type,
            "ical_url": u.ical_url or "",
            "ical_export_token": u.ical_export_token or "",
        }
        for u in units
    ]
