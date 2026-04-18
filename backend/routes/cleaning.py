from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Booking, Unit, CleaningSettings
from auth_utils import get_tenant
from pydantic import BaseModel
from datetime import date as date_type
from typing import Optional

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


class CleaningSettingsUpdate(BaseModel):
    clean_every_days: int = 3
    linen_every_days: int = 5
    laundry_on_day: int = 3
    laundry_min_stay: int = 4


def _get_settings(db, tenant):
    s = db.query(CleaningSettings).filter(CleaningSettings.tenant == tenant).first()
    if not s:
        s = CleaningSettings(tenant=tenant)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    s = _get_settings(db, tenant)
    return {
        "clean_every_days": s.clean_every_days,
        "linen_every_days": s.linen_every_days,
        "laundry_on_day": s.laundry_on_day,
        "laundry_min_stay": s.laundry_min_stay,
    }


@router.put("/settings")
def update_settings(data: CleaningSettingsUpdate, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    s = _get_settings(db, tenant)
    s.clean_every_days = data.clean_every_days
    s.linen_every_days = data.linen_every_days
    s.laundry_on_day = data.laundry_on_day
    s.laundry_min_stay = data.laundry_min_stay
    db.commit()
    return {"ok": True}


@router.get("/daily")
def daily_tasks(
    date: Optional[date_type] = Query(default=None),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    if date is None:
        date = date_type.today()

    cfg = _get_settings(db, tenant)
    units = db.query(Unit).filter(Unit.is_active == True, Unit.tenant == tenant).order_by(Unit.name).all()
    tasks = []

    for u in units:
        departures = db.query(Booking).options(joinedload(Booking.customer)).filter(
            Booking.unit_id == u.id, Booking.tenant == tenant,
            Booking.check_out == date, Booking.status.in_(["confirmed", "pending"]),
        ).all()

        arrivals = db.query(Booking).options(joinedload(Booking.customer)).filter(
            Booking.unit_id == u.id, Booking.tenant == tenant,
            Booking.check_in == date, Booking.status.in_(["confirmed", "pending"]),
        ).all()

        midstay = db.query(Booking).options(joinedload(Booking.customer)).filter(
            Booking.unit_id == u.id, Booking.tenant == tenant,
            Booking.check_in < date, Booking.check_out > date,
            Booking.status.in_(["confirmed", "pending"]),
        ).first()

        has_dep = len(departures) > 0
        has_arr = len(arrivals) > 0

        if has_dep and has_arr:
            task_type = "turnover"
            task_label = "ΑΛΛΑΓΗ ΠΕΛΑΤΗ — ΕΠΕΙΓΟΝ"
            task_desc = "Αναχώρηση ΚΑΙ νέα άφιξη σήμερα! Πλήρης καθαρισμός, αλλαγή όλων σεντόνια & πετσέτες, ετοιμασία για νέους πελάτες."
            priority = 1
            booking_info = {
                "departing": [f"{b.customer.first_name} {b.customer.last_name}" for b in departures],
                "arriving": [f"{b.customer.first_name} {b.customer.last_name}" for b in arrivals],
            }
        elif has_dep:
            task_type = "departure"
            task_label = "ΑΝΑΧΩΡΗΣΗ — ΠΛΗΡΗΣ ΚΑΘΑΡΙΣΜΟΣ"
            task_desc = "Πλήρης καθαρισμός. Αλλαγή όλων σεντόνια & πετσέτες. Πλυντήριο."
            priority = 2
            booking_info = {"departing": [f"{b.customer.first_name} {b.customer.last_name}" for b in departures]}
        elif has_arr:
            task_type = "arrival"
            task_label = "ΑΦΙΞΗ — ΕΤΟΙΜΑΣΙΑ ΔΩΜΑΤΙΟΥ"
            task_desc = "Έλεγχος καθαριότητας, φρέσκα σεντόνια & πετσέτες, έλεγχος ότι λειτουργεί σωστά."
            priority = 3
            booking_info = {"arriving": [f"{b.customer.first_name} {b.customer.last_name}" for b in arrivals]}
        elif midstay:
            total_nights = (midstay.check_out - midstay.check_in).days
            day_of_stay = (date - midstay.check_in).days + 1

            linen_due = cfg.linen_every_days > 0 and day_of_stay % cfg.linen_every_days == 0
            laundry_due = (cfg.laundry_on_day > 0
                           and day_of_stay == cfg.laundry_on_day
                           and total_nights >= cfg.laundry_min_stay)
            clean_due = cfg.clean_every_days > 0 and day_of_stay % cfg.clean_every_days == 0

            if linen_due:
                task_type = "midstay_linen"
                task_label = "ΚΑΘΑΡΙΣΜΟΣ + ΑΛΛΑΓΗ ΣΕΝΤΟΝΙΩΝ"
                task_desc = f"Ημέρα {day_of_stay} από {total_nights}. Καθαρισμός + αλλαγή σεντόνια & πετσέτες."
                priority = 4
            elif laundry_due:
                task_type = "midstay_laundry"
                task_label = "ΠΑΡΑΛΑΒΗ ΑΠΛΥΤΩΝ"
                task_desc = f"Ημέρα {day_of_stay} από {total_nights}. Παραλαβή άπλυτων (σεντόνια & πετσέτες)."
                priority = 4
            elif clean_due:
                task_type = "midstay"
                task_label = "ΚΑΘΑΡΙΣΜΟΣ"
                task_desc = f"Ημέρα {day_of_stay} από {total_nights}. Σκούπισμα, μπάνιο, αδειάστε σκουπίδια."
                priority = 5
            else:
                task_type = "occupied"
                task_label = "ΚΑΤΟΙΚΗΜΕΝΟ"
                task_desc = f"Ημέρα {day_of_stay} από {total_nights}. Χωρίς εργασία καθαριότητας σήμερα."
                priority = 6

            booking_info = {
                "guest": f"{midstay.customer.first_name} {midstay.customer.last_name}",
                "check_out": midstay.check_out.isoformat(),
            }
        else:
            task_type = "empty"
            task_label = "ΚΕΝΟ"
            task_desc = "Δεν υπάρχει πελάτης σήμερα."
            priority = 99
            booking_info = {}

        tasks.append({
            "unit_id": u.id,
            "unit_name": u.name,
            "task_type": task_type,
            "task_label": task_label,
            "task_description": task_desc,
            "booking_info": booking_info,
            "priority": priority,
        })

    tasks.sort(key=lambda x: x["priority"])

    return {
        "date": date.isoformat(),
        "tasks": tasks,
        "summary": {
            "turnover": sum(1 for t in tasks if t["task_type"] == "turnover"),
            "departures": sum(1 for t in tasks if t["task_type"] == "departure"),
            "arrivals": sum(1 for t in tasks if t["task_type"] == "arrival"),
            "linen_change": sum(1 for t in tasks if t["task_type"] in ["midstay_linen", "turnover", "departure"]),
            "midstay": sum(1 for t in tasks if t["task_type"] in ["midstay", "midstay_linen", "midstay_laundry"]),
        },
    }
