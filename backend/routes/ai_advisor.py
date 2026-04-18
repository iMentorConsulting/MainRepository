import os
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Booking, Unit
from schemas import BookingRequest
from typing import Optional
from datetime import date
import anthropic
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai-advisor"])


def _get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY δεν έχει οριστεί")
    return anthropic.Anthropic(api_key=api_key)


def _units_with_bookings(db: Session, unit_type: Optional[str] = None):
    today = date.today()
    q = db.query(Unit).filter(Unit.is_active == True)
    if unit_type:
        q = q.filter(Unit.type == unit_type)
    units = q.all()

    result = []
    for u in units:
        bkgs = (
            db.query(Booking)
            .filter(
                Booking.unit_id == u.id,
                Booking.status.in_(["confirmed", "pending"]),
                Booking.check_out >= today,
            )
            .order_by(Booking.check_in)
            .all()
        )
        result.append({
            "unit_id": u.id,
            "unit_name": u.name,
            "unit_type": u.type,
            "capacity": u.capacity,
            "base_price": u.base_price,
            "bookings": [
                {
                    "id": b.id,
                    "check_in": b.check_in.isoformat(),
                    "check_out": b.check_out.isoformat(),
                    "nights": (b.check_out - b.check_in).days,
                    "channel": b.channel,
                }
                for b in bkgs
            ],
        })
    return result


def _available_unit_ids(db: Session, check_in: date, check_out: date, unit_type: Optional[str]):
    q = db.query(Unit).filter(Unit.is_active == True)
    if unit_type:
        q = q.filter(Unit.type == unit_type)
    available = []
    for u in q.all():
        overlap = db.query(Booking).filter(
            Booking.unit_id == u.id,
            Booking.status.in_(["confirmed", "pending"]),
            Booking.check_in < check_out,
            Booking.check_out > check_in,
        ).first()
        if not overlap:
            available.append(u.id)
    return available


@router.post("/recommend-unit")
async def recommend_unit(request: BookingRequest, db: Session = Depends(get_db)):
    avail_ids = _available_unit_ids(db, request.check_in, request.check_out, request.unit_type)

    if not avail_ids:
        return {
            "available": False,
            "message": "Δεν υπάρχουν διαθέσιμες μονάδες για την επιλεγμένη περίοδο.",
            "recommendation": None,
        }

    all_data = _units_with_bookings(db, request.unit_type)
    avail_data = [u for u in all_data if u["unit_id"] in avail_ids]

    prompt = f"""Είσαι ειδικός διαχείρισης τουριστικών καταλυμάτων. Βρες τη βέλτιστη μονάδα για νέα κράτηση.

ΝΕΑΗ ΚΡΑΤΗΣΗ:
- Άφιξη: {request.check_in.isoformat()}
- Αναχώρηση: {request.check_out.isoformat()}
- Διάρκεια: {(request.check_out - request.check_in).days} νύχτες
- Άτομα: {request.guests}
- Τύπος: {request.unit_type or "οποιοσδήποτε"}

ΔΙΑΘΕΣΙΜΕΣ ΜΟΝΑΔΕΣ (με υπάρχουσες κρατήσεις):
{json.dumps(avail_data, ensure_ascii=False, indent=2)}

ΚΑΝΟΝΕΣ ΒΑΘΜΟΛΟΓΗΣΗΣ:
1. +40 πόντοι αν η νέα κράτηση εφάπτεται (check-out υπάρχουσας = check-in νέας ή αντίστροφα) — κλείνει κενό
2. +20 πόντοι αν δεν δημιουργεί κενά < 4 ημερών
3. -30 πόντοι αν δημιουργεί κενό 1-3 ημερών με οποιαδήποτε υπάρχουσα κράτηση
4. +10 πόντοι για μονάδα χωρίς καμία άλλη κράτηση (ελεύθερο πρόγραμμα)

Απάντησε ΜΟΝΟ με έγκυρο JSON (χωρίς markdown):
{{
  "recommended_unit_id": <int>,
  "recommended_unit_name": "<string>",
  "score": <0-100>,
  "reasoning": "<εξήγηση στα ελληνικά, 2-3 προτάσεις>",
  "gaps_created": <int>,
  "gaps_closed": <int>,
  "alternatives": [{{"unit_id": <int>, "unit_name": "<string>", "reason": "<string>"}}],
  "warnings": ["<string>"]
}}"""

    try:
        client = _get_client()
        msg = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system="Είσαι ειδικός σύμβουλος διαχείρισης τουριστικών καταλυμάτων. Απαντάς ΠΑΝΤΑ με καθαρό JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        # strip markdown fences if model adds them
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        ai = json.loads(text)

        unit = db.query(Unit).filter(Unit.id == ai["recommended_unit_id"]).first()
        return {
            "available": True,
            "available_units_count": len(avail_ids),
            "recommendation": ai,
            "unit_details": {
                "id": unit.id,
                "name": unit.name,
                "type": unit.type,
                "base_price": unit.base_price,
            } if unit else None,
        }

    except json.JSONDecodeError:
        unit = db.query(Unit).filter(Unit.id == avail_ids[0]).first()
        return {
            "available": True,
            "available_units_count": len(avail_ids),
            "recommendation": {
                "recommended_unit_id": avail_ids[0],
                "recommended_unit_name": unit.name if unit else "",
                "score": 50,
                "reasoning": "Πρώτη διαθέσιμη μονάδα (fallback).",
                "gaps_created": 0,
                "gaps_closed": 0,
                "alternatives": [],
                "warnings": [],
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Σφάλμα AI: {str(e)}")


@router.get("/gap-alerts")
def gap_alerts(
    max_gap_days: int = Query(3, ge=1, le=7),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    today = date.today()
    fd = from_date or today
    td = to_date or date(today.year + 1, 12, 31)

    units = db.query(Unit).filter(Unit.is_active == True).all()
    alerts = []

    for u in units:
        bkgs = (
            db.query(Booking)
            .filter(
                Booking.unit_id == u.id,
                Booking.status.in_(["confirmed", "pending"]),
                Booking.check_out >= fd,
                Booking.check_in <= td,
            )
            .order_by(Booking.check_in)
            .all()
        )

        for i in range(len(bkgs) - 1):
            cur = bkgs[i]
            nxt = bkgs[i + 1]
            gap = (nxt.check_in - cur.check_out).days
            if 1 <= gap <= max_gap_days:
                if gap == 1:
                    rec = (
                        f"Κενό 1 ημέρας ({cur.check_out.strftime('%d/%m')}): "
                        f"Μπείτε στις πλατφόρμες και ορίστε ελάχιστη διαμονή 1 νύχτα "
                        f"για να εμφανιστεί αυτή η ημερομηνία."
                    )
                else:
                    rec = (
                        f"Κενό {gap} ημερών ({cur.check_out.strftime('%d/%m')} – {nxt.check_in.strftime('%d/%m')}): "
                        f"Ορίστε ελάχιστη διαμονή {gap} νύχτες στις πλατφόρμες "
                        f"ώστε να γεμίσει αυτό το κενό."
                    )
                alerts.append({
                    "unit_id": u.id,
                    "unit_name": u.name,
                    "gap_start": cur.check_out.isoformat(),
                    "gap_end": nxt.check_in.isoformat(),
                    "gap_days": gap,
                    "before_booking_id": cur.id,
                    "after_booking_id": nxt.id,
                    "recommendation": rec,
                })

    alerts.sort(key=lambda x: x["gap_start"])
    return {
        "alerts_count": len(alerts),
        "from_date": fd.isoformat(),
        "to_date": td.isoformat(),
        "alerts": alerts,
    }


@router.get("/booking-alerts")
def booking_alerts(db: Session = Depends(get_db)):
    today = date.today()

    past_pending = (
        db.query(Booking)
        .filter(Booking.status == "pending", Booking.check_out < today)
        .order_by(Booking.check_out)
        .all()
    )

    unbilled_platform = (
        db.query(Booking)
        .filter(
            Booking.channel.in_(["booking", "airbnb"]),
            Booking.is_billed == False,
            Booking.status.in_(["confirmed", "pending"]),
        )
        .order_by(Booking.check_in)
        .all()
    )

    def fmt(b):
        return {
            "id": b.id,
            "unit_name": b.unit.name if b.unit else "",
            "customer_name": f"{b.customer.first_name} {b.customer.last_name}".strip() if b.customer else "",
            "check_in": b.check_in.isoformat(),
            "check_out": b.check_out.isoformat(),
            "channel": b.channel,
            "status": b.status,
            "total_price": b.total_price,
        }

    return {
        "past_pending": [fmt(b) for b in past_pending],
        "unbilled_platform": [fmt(b) for b in unbilled_platform],
    }
