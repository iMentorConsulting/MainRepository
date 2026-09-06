import calendar
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import Owner, Unit, Booking, Expense
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/owners", tags=["owners"])

MONTH_NAMES_GR = [
    "", "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος",
    "Μάιος", "Ιούνιος", "Ιούλιος", "Αύγουστος",
    "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
]

CHANNEL_LABELS = {
    "booking": "Booking.com", "airbnb": "Airbnb", "direct": "Απευθείας",
    "oga": "ΟΓΑ", "social_tourism": "Κοιν.Τουρ.", "other": "Άλλο",
}


class OwnerIn(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    management_fee_percent: float = 20.0
    auto_send_report: bool = False
    notes: Optional[str] = None


def _serialize(o: Owner, units: list) -> dict:
    return {
        "id": o.id, "name": o.name, "email": o.email or "",
        "phone": o.phone or "", "management_fee_percent": o.management_fee_percent,
        "auto_send_report": o.auto_send_report, "notes": o.notes or "",
        "units": [{"id": u.id, "name": u.name} for u in units],
    }


@router.get("/")
def list_owners(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    owners = db.query(Owner).filter(Owner.tenant == tenant).order_by(Owner.name).all()
    result = []
    for o in owners:
        units = db.query(Unit).filter(Unit.owner_id == o.id, Unit.tenant == tenant).all()
        result.append(_serialize(o, units))
    return result


@router.post("/")
def create_owner(data: OwnerIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    o = Owner(tenant=tenant, **data.dict())
    db.add(o)
    db.commit()
    db.refresh(o)
    return _serialize(o, [])


@router.put("/{owner_id}")
def update_owner(owner_id: int, data: OwnerIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    o = db.query(Owner).filter(Owner.id == owner_id, Owner.tenant == tenant).first()
    if not o:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(o, k, v)
    db.commit()
    units = db.query(Unit).filter(Unit.owner_id == o.id, Unit.tenant == tenant).all()
    return _serialize(o, units)


@router.delete("/{owner_id}")
def delete_owner(owner_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    o = db.query(Owner).filter(Owner.id == owner_id, Owner.tenant == tenant).first()
    if not o:
        raise HTTPException(404)
    # Unlink units
    db.query(Unit).filter(Unit.owner_id == owner_id, Unit.tenant == tenant).update({"owner_id": None})
    db.delete(o)
    db.commit()
    return {"ok": True}


@router.put("/{owner_id}/units")
def assign_units(owner_id: int, unit_ids: list[int], db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    o = db.query(Owner).filter(Owner.id == owner_id, Owner.tenant == tenant).first()
    if not o:
        raise HTTPException(404)
    # Unlink previously assigned
    db.query(Unit).filter(Unit.owner_id == owner_id, Unit.tenant == tenant).update({"owner_id": None})
    # Link new
    if unit_ids:
        db.query(Unit).filter(Unit.id.in_(unit_ids), Unit.tenant == tenant).update({"owner_id": owner_id})
    db.commit()
    units = db.query(Unit).filter(Unit.owner_id == owner_id, Unit.tenant == tenant).all()
    return _serialize(o, units)


@router.get("/{owner_id}/report")
def owner_report(
    owner_id: int,
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    o = db.query(Owner).filter(Owner.id == owner_id, Owner.tenant == tenant).first()
    if not o:
        raise HTTPException(404)

    from_date = date(year, month, 1)
    to_date = date(year, month, calendar.monthrange(year, month)[1])

    units = db.query(Unit).filter(Unit.owner_id == owner_id, Unit.tenant == tenant).all()
    unit_ids = [u.id for u in units]

    bookings = (
        db.query(Booking)
        .filter(
            Booking.unit_id.in_(unit_ids),
            Booking.tenant == tenant,
            Booking.status == "confirmed",
            Booking.check_in >= from_date,
            Booking.check_in <= to_date,
        )
        .all()
    ) if unit_ids else []

    expenses = (
        db.query(Expense)
        .filter(
            Expense.tenant == tenant,
            Expense.date >= from_date,
            Expense.date <= to_date,
            Expense.unit_id.in_(unit_ids),
        )
        .order_by(Expense.date)
        .all()
    ) if unit_ids else []

    total_revenue = sum(b.total_price for b in bookings)
    total_commission = sum(b.commission or 0 for b in bookings)
    net_revenue = total_revenue - total_commission
    total_expenses = sum(e.amount for e in expenses)
    management_fee = round(net_revenue * o.management_fee_percent / 100, 2)
    owner_profit = round(net_revenue - total_expenses - management_fee, 2)

    unit_map = {u.id: u.name for u in units}

    return {
        "owner": {
            "id": o.id, "name": o.name, "email": o.email,
            "management_fee_percent": o.management_fee_percent,
        },
        "period": {
            "year": year, "month": month,
            "label": f"{MONTH_NAMES_GR[month]} {year}",
        },
        "units": [{"id": u.id, "name": u.name} for u in units],
        "bookings": [
            {
                "id": b.id,
                "unit_name": unit_map.get(b.unit_id, ""),
                "customer": f"{b.customer.first_name} {b.customer.last_name}" if b.customer else "",
                "check_in": b.check_in.isoformat(),
                "check_out": b.check_out.isoformat(),
                "nights": (b.check_out - b.check_in).days,
                "guests": b.guests,
                "channel": CHANNEL_LABELS.get(b.channel, b.channel),
                "total_price": round(b.total_price or 0, 2),
                "commission": round(b.commission or 0, 2),
                "net": round((b.total_price or 0) - (b.commission or 0), 2),
            }
            for b in bookings
        ],
        "expenses": [
            {
                "id": e.id,
                "date": e.date.isoformat(),
                "category": e.category,
                "item": e.item,
                "vendor": e.vendor or "",
                "amount": round(e.amount, 2),
                "unit_name": unit_map.get(e.unit_id, "") if e.unit_id else "",
            }
            for e in expenses
        ],
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_commission": round(total_commission, 2),
            "net_revenue": round(net_revenue, 2),
            "total_expenses": round(total_expenses, 2),
            "management_fee_percent": o.management_fee_percent,
            "management_fee": management_fee,
            "owner_profit": owner_profit,
        },
    }


@router.post("/{owner_id}/send-report")
def send_owner_report(
    owner_id: int,
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    report = owner_report(owner_id, year, month, db, tenant)
    o_data = report["owner"]
    if not o_data.get("email"):
        raise HTTPException(400, "Ο ιδιοκτήτης δεν έχει email")
    _send_report_email(report, tenant, db)
    return {"ok": True}


def _send_report_email(report: dict, tenant: str, db):
    from email_utils import send_raw_email
    from models import GuestPortalSettings

    settings = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    o = report["owner"]
    period = report["period"]
    s = report["summary"]

    def fmt(n): return f"€{n:,.2f}".replace(",", ".")

    bk_rows = "".join(
        f"<tr><td>{b['unit_name']}</td><td>{b['customer']}</td>"
        f"<td>{b['check_in']}</td><td>{b['nights']}</td>"
        f"<td>{b['channel']}</td><td style='text-align:right'>{fmt(b['total_price'])}</td>"
        f"<td style='text-align:right'>{fmt(b['commission'])}</td>"
        f"<td style='text-align:right'>{fmt(b['net'])}</td></tr>"
        for b in report["bookings"]
    ) or "<tr><td colspan='8' style='text-align:center;color:#888'>Δεν υπάρχουν κρατήσεις</td></tr>"

    ex_rows = "".join(
        f"<tr><td>{e['date']}</td><td>{e['category']}</td><td>{e['item']}</td>"
        f"<td>{e['vendor']}</td><td style='text-align:right'>{fmt(e['amount'])}</td></tr>"
        for e in report["expenses"]
    ) or "<tr><td colspan='5' style='text-align:center;color:#888'>Δεν υπάρχουν έξοδα</td></tr>"

    html = f"""
<html><body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:auto">
<h2 style="color:#1e3a5f">Μηνιαία Αναφορά Ιδιοκτήτη — {period['label']}</h2>
<p>Αγαπητέ/ή {o['name']},</p>
<p>Επισυνάπτουμε την αναφορά για τον μήνα <strong>{period['label']}</strong>.</p>

<h3>📋 Κρατήσεις</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
<tr style="background:#1e3a5f;color:white">
  <th>Μονάδα</th><th>Πελάτης</th><th>Check-in</th><th>Νύχτες</th>
  <th>Κανάλι</th><th>Έσοδα</th><th>Προμήθεια</th><th>Καθαρά</th>
</tr>{bk_rows}</table>

<h3>💶 Έξοδα</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
<tr style="background:#1e3a5f;color:white">
  <th>Ημ/νία</th><th>Κατηγορία</th><th>Περιγραφή</th><th>Προμηθευτής</th><th>Ποσό</th>
</tr>{ex_rows}</table>

<h3>📊 Σύνοψη</h3>
<table border="0" cellpadding="6" style="font-size:14px">
<tr><td>Συνολικά Έσοδα:</td><td><strong>{fmt(s['total_revenue'])}</strong></td></tr>
<tr><td>Προμήθειες Πλατφορμών:</td><td style="color:#e55">-{fmt(s['total_commission'])}</td></tr>
<tr><td>Καθαρά Έσοδα:</td><td><strong>{fmt(s['net_revenue'])}</strong></td></tr>
<tr><td>Έξοδα Μονάδων:</td><td style="color:#e55">-{fmt(s['total_expenses'])}</td></tr>
<tr><td>Αμοιβή Διαχείρισης ({s['management_fee_percent']}%):</td><td style="color:#e55">-{fmt(s['management_fee'])}</td></tr>
<tr style="background:#f0f7f0"><td><strong>ΚΑΘΑΡΟ ΚΕΡΔΟΣ ΙΔΙΟΚΤΗΤΗ:</strong></td>
<td><strong style="color:#1a7f3c;font-size:16px">{fmt(s['owner_profit'])}</strong></td></tr>
</table>

<p style="color:#888;font-size:12px;margin-top:30px">Αναφορά δημιουργήθηκε αυτόματα από το σύστημα διαχείρισης.</p>
</body></html>"""

    send_raw_email(o["email"], f"Μηνιαία Αναφορά — {period['label']}", html, settings=settings)
