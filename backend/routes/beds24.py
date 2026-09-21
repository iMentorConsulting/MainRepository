from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import requests

from database import get_db
from models import GuestPortalSettings, Unit, SeasonalRate, Booking, Customer
from auth_utils import get_tenant

router = APIRouter(prefix="/beds24", tags=["beds24"])


# ── Internal helpers ──────────────────────────────────────────────────────────

def _verify_long_life_token(token: str) -> None:
    """Verify a Beds24 long life token works by calling /properties."""
    r = requests.get(
        "https://beds24.com/api/v2/properties",
        headers={"accept": "application/json", "token": token},
        timeout=15,
    )
    if not r.ok:
        raise ValueError(f"{r.status_code}: {r.text}")


def _headers(token: str) -> dict:
    return {"accept": "application/json", "token": token}


def _get_api_key(tenant: str, db: Session) -> str:
    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()
    if not settings or not settings.beds24_api_key:
        raise HTTPException(
            status_code=400,
            detail="Beds24 API key not configured. Use POST /beds24/connect first.",
        )
    return settings.beds24_api_key


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/test-v1")
def test_v1_api():
    """Test Beds24 v1 API with Account Access key (no auth required)."""
    try:
        r = requests.post(
            "https://api.beds24.com/json/getProperties",
            json={"authentication": {"apiKey": "rwh6IluBRvUDVc17yQIgJSd6oZYshxKu"}},
            timeout=15,
        )
        return {"status_code": r.status_code, "response": r.json()}
    except Exception as exc:
        return {"error": str(exc)}


@router.post("/connect")
def connect(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Verify and save a Beds24 long life token (generated in Marketplace → API)."""
    token = (body.get("api_key") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="api_key is required")

    try:
        _verify_long_life_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Beds24 auth failed: {exc}")

    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()
    if not settings:
        settings = GuestPortalSettings(tenant=tenant)
        db.add(settings)
    settings.beds24_api_key = token
    db.commit()

    return {"ok": True, "message": "Connected to Beds24"}


@router.get("/properties")
def list_properties(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """List all Beds24 properties for this account."""
    api_key = _get_api_key(tenant, db)
    try:
        r = requests.get(
            "https://beds24.com/api/v2/properties",
            headers=_headers(api_key),
            timeout=15,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Beds24 API error: {exc}")

    data = r.json()
    # Beds24 v2 wraps results in {"data": [...]} or returns a list directly
    if isinstance(data, dict):
        return data.get("data", data)
    return data


@router.put("/units/{unit_id}/mapping")
def map_unit(
    unit_id: int,
    body: dict,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    """Map an iStay unit to a Beds24 property/room."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    prop_id = body.get("beds24_prop_id")
    room_id = body.get("beds24_room_id")

    if prop_id is not None:
        unit.beds24_prop_id = int(prop_id)
    if room_id is not None:
        unit.beds24_room_id = int(room_id)
    db.commit()

    return {
        "ok": True,
        "unit_id": unit.id,
        "beds24_prop_id": unit.beds24_prop_id,
        "beds24_room_id": unit.beds24_room_id,
    }


@router.post("/push-rates/{unit_id}")
def push_rates(
    unit_id: int,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    """Push iStay seasonal rates to Beds24 for this unit."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if not unit.beds24_prop_id:
        raise HTTPException(status_code=400, detail="Unit has no Beds24 prop ID mapped")
    if not unit.beds24_room_id:
        raise HTTPException(status_code=400, detail="Unit has no Beds24 room ID mapped")

    api_key = _get_api_key(tenant, db)
    auth_headers = _headers(api_key)

    rates = db.query(SeasonalRate).filter(
        SeasonalRate.tenant == tenant,
        SeasonalRate.unit_id == unit_id,
    ).all()

    # Collect booked date ranges to mark availability=0
    today = date.today()
    booked_bookings = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.unit_id == unit_id,
        Booking.status.in_(["confirmed", "pending"]),
        Booking.check_out >= today,
    ).all()
    booked_days: set = set()
    for b in booked_bookings:
        cur = b.check_in
        while cur < b.check_out:
            booked_days.add(cur)
            cur += timedelta(days=1)

    pushed = 0
    errors = []

    for rate in rates:
        items = [
            {"type": "price", "amount": rate.price_per_night},
            {"type": "minStay", "amount": rate.min_stay or 1},
        ]

        # Determine per-day availability within this rate window
        # Build contiguous open/closed spans for efficiency; for simplicity push the whole range
        cur = max(rate.date_from, today)
        end = rate.date_to
        if cur > end:
            continue

        # Push price + minStay for the whole rate period
        payload = {
            "propId": unit.beds24_prop_id,
            "roomId": unit.beds24_room_id,
            "startDate": cur.isoformat(),
            "endDate": end.isoformat(),
            "items": items,
        }
        try:
            r = requests.post(
                "https://beds24.com/api/v2/inventory",
                json=payload,
                headers=auth_headers,
                timeout=15,
            )
            r.raise_for_status()
            pushed += 1
        except requests.RequestException as exc:
            errors.append(f"Rate {rate.id}: {exc}")
            continue

        # Push availability=0 for booked days within this period, =1 for open days
        # Collect days in this rate window
        period_days = []
        d = cur
        while d <= end:
            period_days.append(d)
            d += timedelta(days=1)

        # Group consecutive same-availability days into spans
        def push_avail_span(span_start, span_end, avail):
            avail_payload = {
                "propId": unit.beds24_prop_id,
                "roomId": unit.beds24_room_id,
                "startDate": span_start.isoformat(),
                "endDate": span_end.isoformat(),
                "items": [{"type": "availability", "amount": avail}],
            }
            try:
                ar = requests.post(
                    "https://beds24.com/api/v2/inventory",
                    json=avail_payload,
                    headers=auth_headers,
                    timeout=15,
                )
                ar.raise_for_status()
            except requests.RequestException as exc2:
                errors.append(f"Avail span {span_start}-{span_end}: {exc2}")

        if period_days:
            span_start = period_days[0]
            span_avail = 0 if period_days[0] in booked_days else 1
            for day in period_days[1:]:
                day_avail = 0 if day in booked_days else 1
                if day_avail != span_avail:
                    push_avail_span(span_start, day - timedelta(days=1), span_avail)
                    span_start = day
                    span_avail = day_avail
            push_avail_span(span_start, period_days[-1], span_avail)

    return {"ok": True, "pushed": pushed, "errors": errors}


@router.post("/sync-bookings")
def sync_bookings(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Pull bookings from Beds24 and create them in iStay."""
    api_key = _get_api_key(tenant, db)
    auth_headers = _headers(api_key)

    units = db.query(Unit).filter(
        Unit.tenant == tenant,
        Unit.is_active == True,
        Unit.beds24_prop_id != None,
    ).all()

    created_count = 0
    skipped_count = 0
    errors = []
    today = date.today()

    for unit in units:
        try:
            r = requests.get(
                "https://beds24.com/api/v2/bookings",
                headers=auth_headers,
                params={
                    "propId": unit.beds24_prop_id,
                    "arrivalFrom": today.isoformat(),
                },
                timeout=20,
            )
            r.raise_for_status()
        except requests.RequestException as exc:
            errors.append(f"Unit {unit.id}: {exc}")
            continue

        data = r.json()
        bookings_list = data if isinstance(data, list) else data.get("data", [])

        for b24 in bookings_list:
            b24_id = str(b24.get("id") or b24.get("bookId") or "")
            if not b24_id:
                continue

            # Check if already imported (we store Beds24 booking ID in notes)
            note_marker = f"Beds24:{b24_id}"
            existing = db.query(Booking).filter(
                Booking.tenant == tenant,
                Booking.unit_id == unit.id,
                Booking.notes.like(f"%{note_marker}%"),
            ).first()
            if existing:
                skipped_count += 1
                continue

            # Parse dates
            try:
                arrival_str = b24.get("arrival") or b24.get("checkIn") or ""
                departure_str = b24.get("departure") or b24.get("checkOut") or ""
                if not arrival_str or not departure_str:
                    continue
                check_in = date.fromisoformat(arrival_str[:10])
                check_out = date.fromisoformat(departure_str[:10])
            except (ValueError, TypeError):
                errors.append(f"Unit {unit.id} booking {b24_id}: bad dates")
                continue

            if check_in >= check_out:
                continue

            # Guest info
            first_name = b24.get("firstName") or b24.get("guestFirstName") or "Beds24"
            last_name = b24.get("lastName") or b24.get("guestLastName") or "Guest"
            email = b24.get("email") or b24.get("guestEmail") or ""
            phone = b24.get("phone") or b24.get("guestPhone") or ""
            guests = int(b24.get("numAdult") or b24.get("guests") or 1)
            total_price = float(b24.get("price") or b24.get("totalPrice") or 0.0)
            channel_raw = (b24.get("referer") or b24.get("source") or "beds24").lower()

            # Map to known channels
            if "airbnb" in channel_raw:
                channel = "airbnb"
            elif "booking" in channel_raw:
                channel = "booking"
            elif "vrbo" in channel_raw or "homeaway" in channel_raw:
                channel = "vrbo"
            else:
                channel = "direct"

            # Find or create customer
            customer = db.query(Customer).filter(
                Customer.tenant == tenant,
                Customer.first_name == first_name,
                Customer.last_name == last_name,
            ).first()
            if not customer:
                customer = Customer(
                    tenant=tenant,
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    phone=phone,
                )
                db.add(customer)
                db.flush()
            else:
                if email and not customer.email:
                    customer.email = email
                if phone and not customer.phone:
                    customer.phone = phone

            db.add(Booking(
                tenant=tenant,
                unit_id=unit.id,
                customer_id=customer.id,
                channel=channel,
                check_in=check_in,
                check_out=check_out,
                guests=guests,
                total_price=total_price,
                commission=0.0,
                status="confirmed",
                notes=note_marker,
            ))
            db.commit()
            created_count += 1

    return {
        "ok": True,
        "created": created_count,
        "skipped": skipped_count,
        "errors": errors,
    }
