import os
import json
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import (
    GuestToken, Booking, Unit, Customer,
    WelcomeGuideItem, LocalRecommendation, MarketplaceItem,
    ServiceRequest, GuestMessage, GuestPortalSettings,
)
from auth_utils import TENANTS

router = APIRouter(prefix="/guest", tags=["guest"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")


def _resolve(token_str: str, db: Session, need_verified: bool = True):
    gt = db.query(GuestToken).filter(
        GuestToken.token == token_str,
        GuestToken.is_active == True,
    ).first()
    if not gt:
        raise HTTPException(status_code=404, detail="Invalid or expired portal link")

    booking = (
        db.query(Booking)
        .options(joinedload(Booking.unit), joinedload(Booking.customer))
        .filter(Booking.id == gt.booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.check_out < date.today() - timedelta(days=1):
        raise HTTPException(status_code=403, detail="Your stay has ended")

    if need_verified and not gt.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your identity first")

    return gt, booking


def _settings(db: Session, tenant: str):
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    if not s:
        s = GuestPortalSettings(tenant=tenant)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _tenant_name(tenant: str) -> str:
    return TENANTS.get(tenant, {}).get('name', tenant)


# ── Info & Verification ────────────────────────────────────────────────────────

@router.get("/{token}/info")
def guest_info(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db, need_verified=False)
    gt.view_count = (gt.view_count or 0) + 1
    gt.last_viewed = datetime.utcnow()
    db.commit()

    s = _settings(db, booking.tenant)
    return {
        "is_verified": gt.is_verified,
        "property_name": _tenant_name(booking.tenant),
        "booking": {
            "unit_name": booking.unit.name if booking.unit else "",
            "check_in": booking.check_in.isoformat(),
            "check_out": booking.check_out.isoformat(),
            "guests": booking.guests,
            "nights": (booking.check_out - booking.check_in).days,
        },
        "settings": {
            "checkin_time": s.checkin_time,
            "checkout_time": s.checkout_time,
            "welcome_message": s.welcome_message or "",
        },
    }


@router.post("/{token}/verify")
def verify_guest(token: str, body: dict, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db, need_verified=False)
    customer = booking.customer
    contact = (body.get("contact") or "").strip().lower()

    def _digits(s):
        return "".join(c for c in (s or "") if c.isdigit())

    email_ok = customer.email and contact == customer.email.lower().strip()
    phone_ok = customer.phone and _digits(contact) == _digits(customer.phone)

    if not (email_ok or phone_ok):
        raise HTTPException(status_code=401, detail="Contact details do not match the booking")

    gt.is_verified = True
    db.commit()
    return {"verified": True}


# ── Welcome Guide ──────────────────────────────────────────────────────────────

@router.get("/{token}/guide")
def guest_guide(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    items = (
        db.query(WelcomeGuideItem)
        .filter(
            WelcomeGuideItem.tenant == booking.tenant,
            WelcomeGuideItem.is_active == True,
        )
        .filter(
            (WelcomeGuideItem.unit_id == None) | (WelcomeGuideItem.unit_id == booking.unit_id)
        )
        .order_by(WelcomeGuideItem.category, WelcomeGuideItem.sort_order)
        .all()
    )
    result = {}
    for item in items:
        result.setdefault(item.category, []).append({
            "id": item.id, "title": item.title, "content": item.content,
        })
    return result


# ── Local Recommendations ──────────────────────────────────────────────────────

@router.get("/{token}/recommendations")
def guest_recommendations(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    items = (
        db.query(LocalRecommendation)
        .filter(
            LocalRecommendation.tenant == booking.tenant,
            LocalRecommendation.is_active == True,
        )
        .order_by(LocalRecommendation.category, LocalRecommendation.sort_order)
        .all()
    )
    result = {}
    for r in items:
        result.setdefault(r.category, []).append({
            "id": r.id, "name": r.name, "description": r.description,
            "phone": r.phone, "website": r.website, "address": r.address,
            "maps_url": r.maps_url,
        })
    return result


# ── Marketplace & Service Requests ────────────────────────────────────────────

@router.get("/{token}/marketplace")
def guest_marketplace(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    items = (
        db.query(MarketplaceItem)
        .filter(MarketplaceItem.tenant == booking.tenant, MarketplaceItem.is_available == True)
        .order_by(MarketplaceItem.sort_order)
        .all()
    )
    return [{"id": i.id, "title": i.title, "description": i.description, "price": i.price} for i in items]


@router.get("/{token}/requests")
def guest_requests(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    reqs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.booking_id == booking.id)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return [{
        "id": r.id, "service_type": r.service_type, "description": r.description,
        "status": r.status, "notes": r.notes,
        "created_at": r.created_at.isoformat(),
    } for r in reqs]


@router.post("/{token}/requests")
def create_request(token: str, body: dict, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    req = ServiceRequest(
        booking_id=booking.id,
        tenant=booking.tenant,
        marketplace_item_id=body.get("marketplace_item_id"),
        service_type=body.get("service_type", "Custom"),
        description=body.get("description", ""),
        status="received",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id, "status": req.status}


# ── Cleaning Visibility ────────────────────────────────────────────────────────

@router.get("/{token}/cleaning")
def guest_cleaning(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    from models import CleaningSettings
    cfg = db.query(CleaningSettings).filter(CleaningSettings.tenant == booking.tenant).first()
    clean_every = cfg.clean_every_days if cfg else 3

    today = date.today()
    nights = (booking.check_out - booking.check_in).days

    schedule = []
    for day_offset in range(1, nights):
        d = booking.check_in + timedelta(days=day_offset)
        if day_offset % clean_every == 0:
            schedule.append({"date": d.isoformat(), "type": "Cleaning"})

    upcoming = [s for s in schedule if date.fromisoformat(s["date"]) >= today]
    next_cleaning = upcoming[0] if upcoming else None

    return {
        "next_cleaning": next_cleaning,
        "schedule": schedule,
        "can_skip": next_cleaning is not None and next_cleaning["date"] == (today + timedelta(days=1)).isoformat(),
    }


@router.post("/{token}/cleaning/skip")
def skip_cleaning(token: str, body: dict, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    target_date = body.get("date")
    # Record as a service request with type "skip_cleaning"
    req = ServiceRequest(
        booking_id=booking.id,
        tenant=booking.tenant,
        service_type="skip_cleaning",
        description=f"Guest requested to skip cleaning on {target_date}",
        status="received",
    )
    db.add(req)
    db.commit()
    return {"message": "Cleaning skip request noted. Thank you!"}


# ── Messages / AI Concierge ────────────────────────────────────────────────────

@router.get("/{token}/messages")
def guest_messages(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    msgs = (
        db.query(GuestMessage)
        .filter(GuestMessage.booking_id == booking.id)
        .order_by(GuestMessage.created_at)
        .all()
    )
    # Mark guest messages as read
    for m in msgs:
        if m.sender != "guest" and not m.is_read:
            m.is_read = True
    db.commit()
    return [{
        "id": m.id, "sender": m.sender, "message": m.message,
        "message_type": m.message_type, "photo_path": m.photo_path,
        "created_at": m.created_at.isoformat(),
    } for m in msgs]


@router.post("/{token}/messages")
def send_guest_message(token: str, body: dict, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    text = (body.get("message") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg = GuestMessage(
        booking_id=booking.id, tenant=booking.tenant,
        sender="guest", message=text,
        message_type=body.get("message_type", "chat"),
    )
    db.add(msg)
    db.flush()

    # Try AI response
    ai_reply = _ai_respond(text, booking, db)
    if ai_reply:
        ai_msg = GuestMessage(
            booking_id=booking.id, tenant=booking.tenant,
            sender="ai", message=ai_reply, message_type="ai_response",
        )
        db.add(ai_msg)

    db.commit()
    return {"sent": True, "ai_replied": ai_reply is not None}


@router.post("/{token}/messages/photo")
async def upload_photo_message(
    token: str,
    description: str = "",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    gt, booking = _resolve(token, db)
    if file.content_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        raise HTTPException(status_code=400, detail="Only image files allowed")

    upload_path = os.path.join(UPLOAD_DIR, str(booking.id))
    os.makedirs(upload_path, exist_ok=True)

    filename = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    full_path = os.path.join(upload_path, filename)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    with open(full_path, "wb") as f:
        f.write(content)

    rel_path = f"/uploads/{booking.id}/{filename}"
    msg = GuestMessage(
        booking_id=booking.id, tenant=booking.tenant,
        sender="guest", message=description or "Photo report",
        photo_path=rel_path, message_type="issue_report",
    )
    db.add(msg)
    db.commit()
    return {"photo_path": rel_path}


# ── Timeline ───────────────────────────────────────────────────────────────────

@router.get("/{token}/timeline")
def guest_timeline(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    from models import CleaningSettings
    cfg = db.query(CleaningSettings).filter(CleaningSettings.tenant == booking.tenant).first()
    clean_every = cfg.clean_every_days if cfg else 3
    s = _settings(db, booking.tenant)

    events = []
    nights = (booking.check_out - booking.check_in).days

    events.append({
        "date": booking.check_in.isoformat(),
        "time": s.checkin_time, "type": "checkin",
        "label": f"Check-in – {booking.unit.name if booking.unit else ''}",
        "icon": "🏠",
    })

    for day_offset in range(1, nights):
        d = booking.check_in + timedelta(days=day_offset)
        if day_offset % clean_every == 0:
            events.append({
                "date": d.isoformat(), "time": "11:00",
                "type": "cleaning", "label": "Cleaning", "icon": "🧹",
            })

    reqs = db.query(ServiceRequest).filter(
        ServiceRequest.booking_id == booking.id,
        ServiceRequest.service_type != "skip_cleaning",
    ).all()
    for r in reqs:
        events.append({
            "date": r.created_at.date().isoformat(), "time": r.created_at.strftime("%H:%M"),
            "type": "service", "label": r.service_type,
            "status": r.status, "icon": "🛎️",
        })

    events.append({
        "date": booking.check_out.isoformat(),
        "time": s.checkout_time, "type": "checkout",
        "label": "Check-out", "icon": "👋",
    })

    events.sort(key=lambda e: (e["date"], e["time"]))
    return events


# ── Emergency ─────────────────────────────────────────────────────────────────

@router.get("/{token}/emergency")
def guest_emergency(token: str, db: Session = Depends(get_db)):
    gt, booking = _resolve(token, db)
    s = _settings(db, booking.tenant)
    return {
        "manager_phone": s.manager_phone,
        "manager_email": s.manager_email,
        "emergency_contact": s.emergency_contact,
        "hospital_name": s.hospital_name,
        "hospital_phone": s.hospital_phone,
        "police_phone": s.police_phone or "100",
        "ambulance_phone": s.ambulance_phone or "166",
        "fire_phone": s.fire_phone or "199",
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ai_respond(question: str, booking: Booking, db: Session) -> str | None:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    # Build context from welcome guide
    guide_items = db.query(WelcomeGuideItem).filter(
        WelcomeGuideItem.tenant == booking.tenant,
        WelcomeGuideItem.is_active == True,
    ).filter(
        (WelcomeGuideItem.unit_id == None) | (WelcomeGuideItem.unit_id == booking.unit_id)
    ).all()

    guide_text = "\n".join(f"[{g.category}] {g.title}: {g.content}" for g in guide_items)
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == booking.tenant).first()

    context = f"""You are a helpful AI concierge for {booking.unit.name if booking.unit else 'the property'}.
Guest check-in: {booking.check_in}, check-out: {booking.check_out}.
Check-in time: {s.checkin_time if s else '14:00'}, Check-out time: {s.checkout_time if s else '11:00'}.

PROPERTY GUIDE:
{guide_text or 'No guide available.'}

Answer the guest's question based on the guide. Be friendly and concise (2-3 sentences max).
If you cannot answer from the guide, reply ONLY with: ESCALATE"""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=context,
            messages=[{"role": "user", "content": question}],
        )
        reply = resp.content[0].text.strip()
        if reply.startswith("ESCALATE"):
            return None
        return reply
    except Exception:
        return None
