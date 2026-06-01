import os
import shutil
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import (
    Booking, Customer, Unit, GuestToken,
    WelcomeGuideItem, LocalRecommendation, MarketplaceItem,
    ServiceRequest, GuestMessage, GuestPortalSettings,
)
from auth_utils import get_tenant

router = APIRouter(prefix="/portal", tags=["portal-admin"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")
BASE_URL = os.getenv("BASE_URL", "")


def _portal_url(token: str, request_base: str = "") -> str:
    base = BASE_URL or request_base
    return f"{base}/guest/{token}"


# ── Portal Settings ────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    if not s:
        s = GuestPortalSettings(tenant=tenant)
        db.add(s)
        db.commit()
        db.refresh(s)
    return {
        "welcome_message": s.welcome_message, "checkin_time": s.checkin_time,
        "checkout_time": s.checkout_time, "manager_phone": s.manager_phone,
        "manager_email": s.manager_email, "emergency_contact": s.emergency_contact,
        "hospital_name": s.hospital_name, "hospital_phone": s.hospital_phone,
        "police_phone": s.police_phone, "ambulance_phone": s.ambulance_phone,
        "fire_phone": s.fire_phone, "from_name": s.from_name,
    }


@router.put("/settings")
def save_settings(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    if not s:
        s = GuestPortalSettings(tenant=tenant)
        db.add(s)
    fields = [
        "welcome_message", "checkin_time", "checkout_time", "manager_phone",
        "manager_email", "emergency_contact", "hospital_name", "hospital_phone",
        "police_phone", "ambulance_phone", "fire_phone", "from_name",
    ]
    for f in fields:
        if f in body:
            setattr(s, f, body[f])
    db.commit()
    return {"saved": True}


# ── Welcome Guide ──────────────────────────────────────────────────────────────

@router.get("/guide")
def list_guide(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    items = (
        db.query(WelcomeGuideItem)
        .filter(WelcomeGuideItem.tenant == tenant)
        .order_by(WelcomeGuideItem.category, WelcomeGuideItem.sort_order)
        .all()
    )
    return [{"id": i.id, "unit_id": i.unit_id, "category": i.category,
             "title": i.title, "content": i.content, "sort_order": i.sort_order,
             "is_active": i.is_active} for i in items]


@router.post("/guide", status_code=201)
def create_guide_item(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = WelcomeGuideItem(
        tenant=tenant,
        unit_id=body.get("unit_id"),
        category=body.get("category", "general"),
        title=body["title"],
        content=body["content"],
        sort_order=body.get("sort_order", 0),
        is_active=body.get("is_active", True),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id}


@router.put("/guide/{item_id}")
def update_guide_item(item_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = db.query(WelcomeGuideItem).filter(
        WelcomeGuideItem.id == item_id, WelcomeGuideItem.tenant == tenant
    ).first()
    if not item:
        raise HTTPException(status_code=404)
    for f in ["unit_id", "category", "title", "content", "sort_order", "is_active"]:
        if f in body:
            setattr(item, f, body[f])
    db.commit()
    return {"saved": True}


@router.delete("/guide/{item_id}")
def delete_guide_item(item_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = db.query(WelcomeGuideItem).filter(
        WelcomeGuideItem.id == item_id, WelcomeGuideItem.tenant == tenant
    ).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ── Local Recommendations ──────────────────────────────────────────────────────

@router.get("/recommendations")
def list_recommendations(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    items = (
        db.query(LocalRecommendation)
        .filter(LocalRecommendation.tenant == tenant)
        .order_by(LocalRecommendation.category, LocalRecommendation.sort_order)
        .all()
    )
    return [{"id": r.id, "category": r.category, "name": r.name, "description": r.description,
             "phone": r.phone, "website": r.website, "address": r.address,
             "maps_url": r.maps_url, "sort_order": r.sort_order, "is_active": r.is_active} for r in items]


@router.post("/recommendations", status_code=201)
def create_recommendation(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = LocalRecommendation(
        tenant=tenant,
        category=body.get("category", "restaurant"),
        name=body["name"],
        description=body.get("description", ""),
        phone=body.get("phone", ""),
        website=body.get("website", ""),
        address=body.get("address", ""),
        maps_url=body.get("maps_url", ""),
        sort_order=body.get("sort_order", 0),
        is_active=body.get("is_active", True),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id}


@router.put("/recommendations/{rec_id}")
def update_recommendation(rec_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = db.query(LocalRecommendation).filter(
        LocalRecommendation.id == rec_id, LocalRecommendation.tenant == tenant
    ).first()
    if not r:
        raise HTTPException(status_code=404)
    for f in ["category", "name", "description", "phone", "website", "address", "maps_url", "sort_order", "is_active"]:
        if f in body:
            setattr(r, f, body[f])
    db.commit()
    return {"saved": True}


@router.delete("/recommendations/{rec_id}")
def delete_recommendation(rec_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = db.query(LocalRecommendation).filter(
        LocalRecommendation.id == rec_id, LocalRecommendation.tenant == tenant
    ).first()
    if not r:
        raise HTTPException(status_code=404)
    db.delete(r)
    db.commit()
    return {"deleted": True}


# ── Marketplace ────────────────────────────────────────────────────────────────

@router.get("/marketplace")
def list_marketplace(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    items = (
        db.query(MarketplaceItem)
        .filter(MarketplaceItem.tenant == tenant)
        .order_by(MarketplaceItem.sort_order)
        .all()
    )
    return [{"id": i.id, "title": i.title, "description": i.description,
             "price": i.price, "is_available": i.is_available, "sort_order": i.sort_order} for i in items]


@router.post("/marketplace", status_code=201)
def create_marketplace_item(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = MarketplaceItem(
        tenant=tenant,
        title=body["title"],
        description=body.get("description", ""),
        price=float(body.get("price", 0)),
        is_available=body.get("is_available", True),
        sort_order=body.get("sort_order", 0),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id}


@router.put("/marketplace/{item_id}")
def update_marketplace_item(item_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == item_id, MarketplaceItem.tenant == tenant
    ).first()
    if not item:
        raise HTTPException(status_code=404)
    for f in ["title", "description", "price", "is_available", "sort_order"]:
        if f in body:
            setattr(item, f, body[f])
    db.commit()
    return {"saved": True}


@router.delete("/marketplace/{item_id}")
def delete_marketplace_item(item_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == item_id, MarketplaceItem.tenant == tenant
    ).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ── Service Requests ───────────────────────────────────────────────────────────

@router.get("/requests")
def list_requests(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    reqs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.tenant == tenant)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    result = []
    for r in reqs:
        booking = db.query(Booking).options(
            joinedload(Booking.unit), joinedload(Booking.customer)
        ).filter(Booking.id == r.booking_id).first()
        result.append({
            "id": r.id, "service_type": r.service_type, "description": r.description,
            "status": r.status, "notes": r.notes,
            "created_at": r.created_at.isoformat(),
            "booking_id": r.booking_id,
            "unit_name": booking.unit.name if booking and booking.unit else "",
            "guest_name": f"{booking.customer.first_name} {booking.customer.last_name}".strip() if booking and booking.customer else "",
        })
    return result


@router.put("/requests/{req_id}")
def update_request(req_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    r = db.query(ServiceRequest).filter(
        ServiceRequest.id == req_id, ServiceRequest.tenant == tenant
    ).first()
    if not r:
        raise HTTPException(status_code=404)
    if "status" in body:
        r.status = body["status"]
    if "notes" in body:
        r.notes = body["notes"]
    r.updated_at = datetime.utcnow()
    db.commit()
    return {"saved": True}


# ── Messages ───────────────────────────────────────────────────────────────────

@router.get("/messages")
def list_conversations(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.unit), joinedload(Booking.customer))
        .filter(Booking.tenant == tenant)
        .all()
    )
    result = []
    for b in bookings:
        msgs = db.query(GuestMessage).filter(GuestMessage.booking_id == b.id).all()
        if not msgs:
            continue
        unread = sum(1 for m in msgs if m.sender == "guest" and not m.is_read)
        last = max(msgs, key=lambda m: m.created_at)
        result.append({
            "booking_id": b.id,
            "unit_name": b.unit.name if b.unit else "",
            "guest_name": f"{b.customer.first_name} {b.customer.last_name}".strip() if b.customer else "",
            "check_in": b.check_in.isoformat(),
            "check_out": b.check_out.isoformat(),
            "unread_count": unread,
            "last_message": last.message[:80],
            "last_at": last.created_at.isoformat(),
        })
    result.sort(key=lambda x: x["last_at"], reverse=True)
    return result


@router.get("/messages/{booking_id}")
def get_conversation(booking_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant == tenant).first()
    if not booking:
        raise HTTPException(status_code=404)
    msgs = (
        db.query(GuestMessage)
        .filter(GuestMessage.booking_id == booking_id)
        .order_by(GuestMessage.created_at)
        .all()
    )
    for m in msgs:
        if m.sender == "guest" and not m.is_read:
            m.is_read = True
    db.commit()
    return [{
        "id": m.id, "sender": m.sender, "message": m.message,
        "message_type": m.message_type, "photo_path": m.photo_path,
        "is_read": m.is_read, "created_at": m.created_at.isoformat(),
    } for m in msgs]


@router.post("/messages/{booking_id}")
def send_manager_message(booking_id: int, body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant == tenant).first()
    if not booking:
        raise HTTPException(status_code=404)
    msg = GuestMessage(
        booking_id=booking_id, tenant=tenant,
        sender="manager", message=body.get("message", ""),
        message_type="chat",
    )
    db.add(msg)
    db.commit()
    return {"sent": True}


# ── Guest Token Management ─────────────────────────────────────────────────────

@router.get("/bookings/{booking_id}/portal")
def get_portal_link(booking_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant == tenant).first()
    if not booking:
        raise HTTPException(status_code=404)
    gt = db.query(GuestToken).filter(
        GuestToken.booking_id == booking_id, GuestToken.is_active == True
    ).first()
    if not gt:
        gt = GuestToken(booking_id=booking_id, tenant=tenant)
        db.add(gt)
        db.commit()
        db.refresh(gt)
    return {
        "token": gt.token,
        "portal_url": f"/guest/{gt.token}",
        "is_verified": gt.is_verified,
        "view_count": gt.view_count or 0,
        "last_viewed": gt.last_viewed.isoformat() if gt.last_viewed else None,
    }


@router.post("/bookings/{booking_id}/send-portal")
def send_portal_link(booking_id: int, body: dict = None, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    from email_utils import send_portal_email
    from auth_utils import TENANTS

    booking = (
        db.query(Booking)
        .options(joinedload(Booking.unit), joinedload(Booking.customer))
        .filter(Booking.id == booking_id, Booking.tenant == tenant)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404)

    customer = booking.customer
    if not customer or not customer.email:
        raise HTTPException(status_code=400, detail="Guest has no email address")

    gt = db.query(GuestToken).filter(
        GuestToken.booking_id == booking_id, GuestToken.is_active == True
    ).first()
    if not gt:
        gt = GuestToken(booking_id=booking_id, tenant=tenant)
        db.add(gt)
        db.commit()
        db.refresh(gt)

    base = (body or {}).get("base_url") or BASE_URL or ""
    portal_url = f"{base}/guest/{gt.token}"
    property_name = TENANTS.get(tenant, {}).get("name", tenant)

    s = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    sent = send_portal_email(
        to_email=customer.email,
        guest_name=f"{customer.first_name} {customer.last_name}".strip(),
        property_name=property_name,
        unit_name=booking.unit.name if booking.unit else "",
        check_in=booking.check_in.strftime("%d %b %Y"),
        check_out=booking.check_out.strftime("%d %b %Y"),
        portal_url=portal_url,
        from_name=s.from_name if s else None,
    )

    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars."
        )
    return {"sent": True, "to": customer.email}


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
def portal_analytics(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    tokens = db.query(GuestToken).filter(GuestToken.tenant == tenant).all()
    total_views = sum(t.view_count or 0 for t in tokens)
    verified = sum(1 for t in tokens if t.is_verified)

    requests = db.query(ServiceRequest).filter(ServiceRequest.tenant == tenant).all()
    messages = db.query(GuestMessage).filter(
        GuestMessage.tenant == tenant, GuestMessage.sender == "guest"
    ).count()

    by_type: dict = {}
    for r in requests:
        by_type[r.service_type] = by_type.get(r.service_type, 0) + 1

    return {
        "total_portals": len(tokens),
        "verified_guests": verified,
        "total_views": total_views,
        "total_requests": len(requests),
        "total_guest_messages": messages,
        "requests_by_type": by_type,
    }


# ── Cleanup uploaded photos after checkout ────────────────────────────────────

def cleanup_expired_uploads(db: Session):
    yesterday = date.today() - timedelta(days=1)
    expired = db.query(Booking).filter(Booking.check_out < yesterday).all()
    for b in expired:
        folder = os.path.join(UPLOAD_DIR, str(b.id))
        if os.path.exists(folder):
            shutil.rmtree(folder, ignore_errors=True)
