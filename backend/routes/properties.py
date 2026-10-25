from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_tenant
from database import get_db
from models import Booking, Property, RoomType, TenantRecord, Unit

router = APIRouter(tags=["properties"])


# ── Helpers used by other routes ────────────────────────────────────────

def property_unit_ids(db: Session, tenant: str, property_id: Optional[int]) -> Optional[List[int]]:
    """Unit ids belonging to a property, or None when no property filter is requested."""
    if not property_id:
        return None
    return [u.id for u in db.query(Unit.id).filter(Unit.tenant == tenant, Unit.property_id == property_id)]


def backfill_properties(db: Session) -> None:
    """
    Idempotent startup migration: every tenant gets a default property, and every unit without a
    room type becomes its own type with a single unit — so existing villas behave exactly as before.
    """
    tenants = {u.tenant for u in db.query(Unit.tenant).distinct()}
    for tenant in tenants:
        orphans = db.query(Unit).filter(Unit.tenant == tenant,
                                        (Unit.property_id == None) | (Unit.room_type_id == None)).all()  # noqa: E711
        if not orphans:
            continue
        prop = db.query(Property).filter(Property.tenant == tenant).order_by(Property.id).first()
        if not prop:
            rec = db.query(TenantRecord).filter_by(id=tenant).first()
            prop = Property(tenant=tenant, name=(rec.name if rec else tenant.upper()))
            db.add(prop)
            db.flush()
        for u in orphans:
            if not u.property_id:
                u.property_id = prop.id
            if not u.room_type_id:
                rt = RoomType(tenant=tenant, property_id=u.property_id, name=u.name, capacity=u.capacity,
                              base_price=u.base_price, description=u.description)
                db.add(rt)
                db.flush()
                u.room_type_id = rt.id
    db.commit()


def ensure_unit_type(db: Session, tenant: str, u: Unit) -> None:
    """Give a stand-alone unit a property (the first one) and its own quantity-1 room type."""
    if not u.property_id:
        prop = db.query(Property).filter(Property.tenant == tenant).order_by(Property.id).first()
        if not prop:
            rec = db.query(TenantRecord).filter_by(id=tenant).first()
            prop = Property(tenant=tenant, name=(rec.name if rec else tenant.upper()))
            db.add(prop)
            db.flush()
        u.property_id = prop.id
    if not u.room_type_id:
        rt = RoomType(tenant=tenant, property_id=u.property_id, name=u.name, capacity=u.capacity,
                      base_price=u.base_price, description=u.description)
        db.add(rt)
        db.flush()
        u.room_type_id = rt.id


def _unit_dict(u: Unit) -> dict:
    return {"id": u.id, "name": u.name, "is_active": u.is_active, "type": u.type,
            "capacity": u.capacity, "base_price": u.base_price}


def _type_dict(rt: RoomType, units: list) -> dict:
    mine = sorted([u for u in units if u.room_type_id == rt.id], key=lambda u: _natural_key(u.name))
    return {
        "id": rt.id, "property_id": rt.property_id, "name": rt.name, "unit_prefix": rt.unit_prefix,
        "capacity": rt.capacity, "base_price": rt.base_price, "description": rt.description,
        "sort_order": rt.sort_order, "is_active": rt.is_active,
        "quantity": sum(1 for u in mine if u.is_active),
        "units": [_unit_dict(u) for u in mine],
    }


def _natural_key(name: str):
    import re
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name or "")]


# ── Properties ──────────────────────────────────────────────────────────

class PropertyIn(BaseModel):
    name: str
    legal_name: Optional[str] = None
    vat_number: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True


@router.get("/properties")
def list_properties(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    if db.query(Unit.id).filter(Unit.tenant == tenant,
                                (Unit.property_id == None) | (Unit.room_type_id == None)).first():  # noqa: E711
        backfill_properties(db)  # units created outside the Units page (imports, older code paths)
    props = db.query(Property).filter(Property.tenant == tenant).order_by(Property.id).all()
    types = db.query(RoomType).filter(RoomType.tenant == tenant).order_by(RoomType.sort_order, RoomType.id).all()
    units = db.query(Unit).filter(Unit.tenant == tenant).all()
    return [{
        "id": p.id, "name": p.name, "legal_name": p.legal_name, "vat_number": p.vat_number,
        "address": p.address, "is_active": p.is_active,
        "room_types": [_type_dict(rt, units) for rt in types if rt.property_id == p.id],
        "unit_count": sum(1 for u in units if u.property_id == p.id and u.is_active),
    } for p in props]


@router.post("/properties", status_code=201)
def create_property(data: PropertyIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    p = Property(tenant=tenant, **data.model_dump())
    db.add(p)
    db.commit()
    return {"id": p.id}


@router.put("/properties/{prop_id}")
def update_property(prop_id: int, data: PropertyIn, db: Session = Depends(get_db),
                    tenant: str = Depends(get_tenant)):
    p = db.query(Property).filter(Property.id == prop_id, Property.tenant == tenant).first()
    if not p:
        raise HTTPException(404, "Το κατάλυμα δεν βρέθηκε")
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/properties/{prop_id}")
def delete_property(prop_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    p = db.query(Property).filter(Property.id == prop_id, Property.tenant == tenant).first()
    if not p:
        raise HTTPException(404, "Το κατάλυμα δεν βρέθηκε")
    if db.query(Unit).filter(Unit.property_id == prop_id).count():
        raise HTTPException(400, "Το κατάλυμα έχει μονάδες — διαγράψτε ή μετακινήστε τες πρώτα")
    db.query(RoomType).filter(RoomType.property_id == prop_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── Room types ──────────────────────────────────────────────────────────

class RoomTypeIn(BaseModel):
    property_id: int
    name: str
    unit_prefix: Optional[str] = None
    capacity: int = 2
    base_price: float = 0.0
    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    quantity: int = 0  # units to create with the type (create only)


def _create_units(db: Session, tenant: str, rt: RoomType, count: int) -> None:
    prefix = (rt.unit_prefix or rt.name).strip()
    existing = {u.name for u in db.query(Unit.name).filter(Unit.tenant == tenant)}
    n = db.query(Unit).filter(Unit.room_type_id == rt.id).count()
    created = 0
    while created < count:
        n += 1
        name = f"{prefix} {n}"
        if name in existing:
            continue
        db.add(Unit(tenant=tenant, name=name, type=rt.name, capacity=rt.capacity,
                    base_price=rt.base_price, description=rt.description,
                    property_id=rt.property_id, room_type_id=rt.id))
        created += 1


@router.post("/room-types", status_code=201)
def create_room_type(data: RoomTypeIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    if not db.query(Property).filter(Property.id == data.property_id, Property.tenant == tenant).first():
        raise HTTPException(404, "Το κατάλυμα δεν βρέθηκε")
    if not 0 <= data.quantity <= 200:
        raise HTTPException(400, "Μη έγκυρο πλήθος μονάδων")
    fields = data.model_dump(exclude={"quantity"})
    rt = RoomType(tenant=tenant, **fields)
    db.add(rt)
    db.flush()
    _create_units(db, tenant, rt, data.quantity)
    db.commit()
    return {"id": rt.id}


@router.put("/room-types/{rt_id}")
def update_room_type(rt_id: int, data: RoomTypeIn, db: Session = Depends(get_db),
                     tenant: str = Depends(get_tenant)):
    rt = db.query(RoomType).filter(RoomType.id == rt_id, RoomType.tenant == tenant).first()
    if not rt:
        raise HTTPException(404, "Ο τύπος δεν βρέθηκε")
    if not db.query(Property).filter(Property.id == data.property_id, Property.tenant == tenant).first():
        raise HTTPException(404, "Το κατάλυμα δεν βρέθηκε")
    old_name = rt.name
    for k, v in data.model_dump(exclude={"quantity"}).items():
        setattr(rt, k, v)
    # Units of a type are identical: keep their shared attributes in step with the type
    for u in db.query(Unit).filter(Unit.room_type_id == rt.id):
        u.property_id = rt.property_id
        u.capacity = rt.capacity
        u.base_price = rt.base_price
        if u.type == old_name:
            u.type = rt.name
    db.commit()
    return {"ok": True}


class AddUnitsIn(BaseModel):
    count: int


@router.post("/room-types/{rt_id}/units", status_code=201)
def add_units(rt_id: int, data: AddUnitsIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rt = db.query(RoomType).filter(RoomType.id == rt_id, RoomType.tenant == tenant).first()
    if not rt:
        raise HTTPException(404, "Ο τύπος δεν βρέθηκε")
    if not 1 <= data.count <= 200:
        raise HTTPException(400, "Μη έγκυρο πλήθος μονάδων")
    _create_units(db, tenant, rt, data.count)
    db.commit()
    return {"ok": True}


@router.delete("/room-types/{rt_id}")
def delete_room_type(rt_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    rt = db.query(RoomType).filter(RoomType.id == rt_id, RoomType.tenant == tenant).first()
    if not rt:
        raise HTTPException(404, "Ο τύπος δεν βρέθηκε")
    unit_ids = [u.id for u in db.query(Unit.id).filter(Unit.room_type_id == rt_id)]
    if unit_ids and db.query(Booking).filter(Booking.unit_id.in_(unit_ids)).count():
        raise HTTPException(400, "Οι μονάδες του τύπου έχουν κρατήσεις — δεν μπορεί να διαγραφεί")
    if unit_ids:
        from models import AvailabilityRule
        db.query(AvailabilityRule).filter(AvailabilityRule.unit_id.in_(unit_ids)).delete(synchronize_session=False)
    db.query(Unit).filter(Unit.room_type_id == rt_id).delete(synchronize_session=False)
    db.delete(rt)
    db.commit()
    return {"ok": True}
