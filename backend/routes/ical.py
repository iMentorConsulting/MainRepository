from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Booking, Unit, Customer
from auth_utils import get_tenant
import requests
from icalendar import Calendar

router = APIRouter(prefix="/ical", tags=["ical"])

SKIP_KEYWORDS = {'CLOSED', 'BLOCKED', 'NOT AVAILABLE', 'UNAVAILABLE', 'ΚΛΕΙΣΤΟ'}


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

        if existing:
            if existing.check_in != dtstart or existing.check_out != dtend:
                existing.check_in = dtstart
                existing.check_out = dtend
                db.commit()
                updated += 1
        else:
            parts = summary.split(' ', 1) if summary and summary.lower() not in ('reservation', 'κράτηση') else []
            first_name = parts[0] if parts else 'Booking.com'
            last_name = parts[1] if len(parts) > 1 else 'Guest'

            customer = db.query(Customer).filter(
                Customer.tenant == tenant,
                Customer.first_name == first_name,
                Customer.last_name == last_name,
            ).first()
            if not customer:
                customer = Customer(tenant=tenant, first_name=first_name, last_name=last_name)
                db.add(customer)
                db.flush()

            db.add(Booking(
                tenant=tenant,
                unit_id=unit.id,
                customer_id=customer.id,
                channel='booking',
                check_in=dtstart,
                check_out=dtend,
                guests=1,
                total_price=0.0,
                commission=0.0,
                status='confirmed',
                ical_uid=uid,
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
