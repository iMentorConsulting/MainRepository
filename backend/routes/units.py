from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Unit
from schemas import UnitCreate, UnitUpdate, UnitResponse
from auth_utils import get_tenant
from typing import List

router = APIRouter(prefix="/units", tags=["units"])


@router.get("/", response_model=List[UnitResponse])
def get_units(db: Session = Depends(get_db), active_only: bool = False, tenant: str = Depends(get_tenant)):
    q = db.query(Unit).filter(Unit.tenant == tenant)
    if active_only:
        q = q.filter(Unit.is_active == True)
    return q.order_by(Unit.name).all()


@router.post("/", response_model=UnitResponse, status_code=201)
def create_unit(unit: UnitCreate, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    db_unit = Unit(**unit.model_dump(), tenant=tenant)
    db.add(db_unit)
    db.commit()
    db.refresh(db_unit)
    return db_unit


@router.get("/{unit_id}", response_model=UnitResponse)
def get_unit(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    return unit


@router.put("/{unit_id}", response_model=UnitResponse)
def update_unit(unit_id: int, data: UnitUpdate, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(unit, k, v)
    db.commit()
    db.refresh(unit)
    return unit


@router.delete("/{unit_id}")
def delete_unit(unit_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.tenant == tenant).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Μονάδα δεν βρέθηκε")
    db.delete(unit)
    db.commit()
    return {"message": "Η μονάδα διαγράφηκε"}
