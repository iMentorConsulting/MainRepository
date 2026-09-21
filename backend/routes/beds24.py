from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import requests

from database import get_db
from models import GuestPortalSettings, Unit, SeasonalRate, Booking, Customer
from auth_utils import get_tenant

router = APIRouter(prefix="/beds24", tags=["beds24"])

V1_BASE = "https://api.beds24.com/json"
V2_BASE = "https://beds24.com/api/v2"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _v2_headers(token: str) -> dict:
    return {"accept": "application/json", "token": token}


def _v1_auth(api_key: str) -> dict:
    return {"authentication": {"apiKey": api_key}}


def _verify_v2_token(token: str) -> None:
    r = requests.get(
        f"{V2_BASE}/properties",
        headers=_v2_headers(token),
        timeout=15,
    )
    if not r.ok:
        raise ValueError(f"{r.status_code}: {r.text}")


def _verify_v1_key(api_key: str) -> None:
    r = requests.post(
        f"{V1_BASE}/getProperties",
        json=_v1_auth(api_key),
        timeout=15,
    )
    if not r.ok:
        raise ValueError(f"{r.status_code}: {r.text}")
    data = r.json()
    if isinstance(data, dict) and data.get("error"):
        raise ValueError(data["error"])


def _get_settings(tenant: str, db: Session) -> GuestPortalSettings:
    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()
    if not settings:
        raise HTTPException(
            status_code=400,
            detail="Beds24 not configured. Use POST /beds24/connect first.",
        )
    return settings


def _get_v2_key(tenant: str, db: Session) -> str:
    settings = _get_settings(tenant, db)
    if not settings.beds24_api_key:
        raise HTTPException(
            status_code=400,
            detail="Beds24 API key not configured. Use POST /beds24/connect first.",
        )
    return settings.beds24_api_key


def _get_v1_key(tenant: str, db: Session) -> str:
    settings = _get_settings(tenant, db)
    if not settings.beds24_v1_api_key:
        raise HTTPException(
            status_code=400,
            detail="Beds24 Account Access key not configured. Use POST /beds24/connect with v1_api_key.",
        )
    return settings.beds24_v1_api_key


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/connect")
def connect(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Save Beds24 credentials: v2 long-life token (read) and/or v1 account access key (write)."""
    v2_token = (body.get("api_key") or "").strip()
    v1_key = (body.get("v1_api_key") or "").strip()

    if not v2_token and not v1_key:
        raise HTTPException(status_code=400, detail="api_key or v1_api_key is required")

    if v2_token:
        try:
            _verify_v2_token(v2_token)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Beds24 v2 auth failed: {exc}")

    if v1_key:
        try:
            _verify_v1_key(v1_key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Beds24 v1 auth failed: {exc}")

    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()
    if not settings:
        settings = GuestPortalSettings(tenant=tenant)
        db.add(settings)

    if v2_token:
        settings.beds24_api_key = v2_token
    if v1_key:
        settings.beds24_v1_api_key = v1_key
    db.commit()

    return {"ok": True, "message": "Connected to Beds24"}


@router.get("/status")
def connection_status(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Return which Beds24 credentials are configured."""
    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()
    return {
        "v2_connected": bool(settings and settings.beds24_api_key),
        "v1_connected": bool(settings and settings.beds24_v1_api_key),
    }


@router.get("/properties")
def list_properties(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """List all Beds24 properties for this account (uses v1 if available, else v2)."""
    settings = db.query(GuestPortalSettings).filter(
        GuestPortalSettings.tenant == tenant
    ).first()

    if settings and settings.beds24_v1_api_key:
        try:
            r = requests.post(
                f"{V1_BASE}/getProperties",
                json=_v1_auth(settings.beds24_v1_api_key),
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            return data.get("getProperties", data) if isinstance(data, dict) else data
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Beds24 API error: {exc}")

    api_key = _get_v2_key(tenant, db)
    try:
        r = requests.get(
            f"{V2_BASE}/properties",
            headers=_v2_headers(api_key),
            timeout=15,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Beds24 API error: {exc}")

    data = r.json()
    return data.get("data", data) if isinstance(data, dict) else data


@router.get("/rooms")
def list_rooms(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """List all Beds24 properties and their rooms (for mapping UI)."""
    v1_key = _get_v1_key(tenant, db)
    try:
        # Get properties
        r = requests.post(f"{V1_BASE}/getProperties", json=_v1_auth(v1_key), timeout=15)
        r.raise_for_status()
        props_data = r.json()
        props = props_data.get("getProperties", []) if isinstance(props_data, dict) else []

        # Get rooms for each property
        result = []
        for prop in props:
            prop_id = prop.get("propId") or prop.get("id")
            if not prop_id:
                continue
            rr = requests.post(
                f"{V1_BASE}/getRooms",
                json={**_v1_auth(v1_key), "propId": prop_id},
                timeout=15,
            )
            rooms = []
            if rr.ok:
                rd = rr.json()
                rooms = rd.get("getRooms", []) if isinstance(rd, dict) else []
            result.append({
                "propId": prop_id,
                "propName": prop.get("name", f"Property {prop_id}"),
                "rooms": [
                    {"roomId": rm.get("roomId") or rm.get("id"), "roomName": rm.get("name", "")}
                    for rm in (rooms if isinstance(rooms, list) else [])
                ],
            })
        return result
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Beds24 API error: {exc}")


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
    """Push iStay seasonal rates and availability to Beds24 for this unit (v1 API)."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if not unit.beds24_prop_id:
        raise HTTPException(status_code=400, detail="Unit has no Beds24 prop ID mapped")
    if not unit.beds24_room_id:
        raise HTTPException(status_code=400, detail="Unit has no Beds24 room ID mapped")

    v1_key = _get_v1_key(tenant, db)

    rates = db.query(SeasonalRate).filter(
        SeasonalRate.tenant == tenant,
        SeasonalRate.unit_id == unit_id,
    ).all()

    today = date.today()

    # Collect booked days
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

    # Build calendar entries for v1 setRooms
    calendar = []
    for rate in rates:
        cur = max(rate.date_from, today)
        end = rate.date_to
        if cur > end:
            continue

        # Group consecutive days by availability
        span_start = cur
        span_avail = 0 if cur in booked_days else 1
        d = cur + timedelta(days=1)
        while d <= end:
            day_avail = 0 if d in booked_days else 1
            if day_avail != span_avail:
                calendar.append({
                    "firstDay": span_start.isoformat(),
                    "lastDay": (d - timedelta(days=1)).isoformat(),
                    "price1": float(rate.price_per_night),
                    "minStay": int(rate.min_stay or 1),
                    "availability": span_avail,
                })
                span_start = d
                span_avail = day_avail
            d += timedelta(days=1)

        calendar.append({
            "firstDay": span_start.isoformat(),
            "lastDay": end.isoformat(),
            "price1": float(rate.price_per_night),
            "minStay": int(rate.min_stay or 1),
            "availability": span_avail,
        })

    if not calendar:
        return {"ok": True, "pushed": 0, "message": "No future rates to push"}

    payload = {
        **_v1_auth(v1_key),
        "rooms": [{
            "propId": unit.beds24_prop_id,
            "roomId": unit.beds24_room_id,
            "calendar": calendar,
        }],
    }

    try:
        r = requests.post(f"{V1_BASE}/setRooms", json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Beds24 API error: {exc}")

    errors = data.get("errors", []) if isinstance(data, dict) else []
    return {"ok": not errors, "pushed": len(calendar), "errors": errors, "response": data}


@router.post("/sync-bookings")
def sync_bookings(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Pull bookings from Beds24 and create them in iStay (v1 API)."""
    v1_key = _get_v1_key(tenant, db)

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
            r = requests.post(
                f"{V1_BASE}/getBookings",
                json={
                    **_v1_auth(v1_key),
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
        bookings_list = data.get("getBookings", data) if isinstance(data, dict) else data
        if not isinstance(bookings_list, list):
            bookings_list = []

        for b24 in bookings_list:
            b24_id = str(b24.get("bookid") or b24.get("id") or "")
            if not b24_id:
                continue

            note_marker = f"Beds24:{b24_id}"
            existing = db.query(Booking).filter(
                Booking.tenant == tenant,
                Booking.unit_id == unit.id,
                Booking.notes.like(f"%{note_marker}%"),
            ).first()
            if existing:
                skipped_count += 1
                continue

            try:
                arrival_str = b24.get("firstnight") or b24.get("arrival") or ""
                departure_str = b24.get("lastnight") or b24.get("departure") or ""
                if not arrival_str or not departure_str:
                    continue
                check_in = date.fromisoformat(arrival_str[:10])
                # v1 lastnight is the last night — checkout is day after
                check_out_raw = date.fromisoformat(departure_str[:10])
                check_out = check_out_raw + timedelta(days=1) if b24.get("lastnight") else check_out_raw
            except (ValueError, TypeError):
                errors.append(f"Unit {unit.id} booking {b24_id}: bad dates")
                continue

            if check_in >= check_out:
                continue

            first_name = b24.get("firstname") or "Beds24"
            last_name = b24.get("lastname") or "Guest"
            email = b24.get("email") or ""
            phone = b24.get("phone") or b24.get("mobile") or ""
            guests = int(b24.get("numadult") or b24.get("guests") or 1)
            total_price = float(b24.get("price") or b24.get("totalprice") or 0.0)
            channel_raw = (b24.get("referer") or b24.get("channel") or "beds24").lower()

            if "airbnb" in channel_raw:
                channel = "airbnb"
            elif "booking" in channel_raw:
                channel = "booking"
            elif "vrbo" in channel_raw or "homeaway" in channel_raw:
                channel = "vrbo"
            else:
                channel = "direct"

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
