from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from database import get_db
from models import Booking
from schemas import BookingCreate, BookingUpdate, BookingResponse
from typing import List, Optional
from datetime import date

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _check_overlap(
    db: Session,
    unit_id: int,
    check_in: date,
    check_out: date,
    exclude_id: Optional[int] = None,
):
    q = db.query(Booking).filter(
        Booking.unit_id == unit_id,
        Booking.status.in_(["confirmed", "pending"]),
        and_(Booking.check_in < check_out, Booking.check_out > check_in),
    )
    if exclude_id:
        q = q.filter(Booking.id != exclude_id)
    return q.first()


def _load(db: Session, booking_id: int):
    return (
        db.query(Booking)
        .options(joinedload(Booking.unit), joinedload(Booking.customer))
        .filter(Booking.id == booking_id)
        .first()
    )


@router.get("/", response_model=List[BookingResponse])
def get_bookings(
    db: Session = Depends(get_db),
    unit_id: Optional[int] = None,
    channel: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 500,
):
    q = db.query(Booking).options(
        joinedload(Booking.unit), joinedload(Booking.customer)
    )
    if unit_id:
        q = q.filter(Booking.unit_id == unit_id)
    if channel:
        q = q.filter(Booking.channel == channel)
    if status:
        q = q.filter(Booking.status == status)
    if from_date:
        q = q.filter(Booking.check_out >= from_date)
    if to_date:
        q = q.filter(Booking.check_in <= to_date)
    return q.order_by(Booking.check_in.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=BookingResponse, status_code=201)
def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    if booking.check_out <= booking.check_in:
        raise HTTPException(
            status_code=400,
            detail="Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη",
        )
    overlap = _check_overlap(db, booking.unit_id, booking.check_in, booking.check_out)
    if overlap:
        raise HTTPException(
            status_code=409,
            detail=f"Σύγκρουση με κράτηση #{overlap.id} ({overlap.check_in} – {overlap.check_out})",
        )
    obj = Booking(**booking.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _load(db, obj.id)


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    obj = _load(db, booking_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Κράτηση δεν βρέθηκε")
    return obj


@router.put("/{booking_id}", response_model=BookingResponse)
def update_booking(booking_id: int, data: BookingUpdate, db: Session = Depends(get_db)):
    obj = db.query(Booking).filter(Booking.id == booking_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Κράτηση δεν βρέθηκε")

    upd = data.model_dump(exclude_none=True)
    new_unit = upd.get("unit_id", obj.unit_id)
    new_in = upd.get("check_in", obj.check_in)
    new_out = upd.get("check_out", obj.check_out)

    if "check_in" in upd or "check_out" in upd or "unit_id" in upd:
        if new_out <= new_in:
            raise HTTPException(
                status_code=400,
                detail="Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη",
            )
        overlap = _check_overlap(db, new_unit, new_in, new_out, exclude_id=booking_id)
        if overlap:
            raise HTTPException(
                status_code=409,
                detail=f"Σύγκρουση με κράτηση #{overlap.id} ({overlap.check_in} – {overlap.check_out})",
            )

    for k, v in upd.items():
        setattr(obj, k, v)
    db.commit()
    return _load(db, booking_id)


@router.delete("/{booking_id}")
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    obj = db.query(Booking).filter(Booking.id == booking_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Κράτηση δεν βρέθηκε")
    db.delete(obj)
    db.commit()
    return {"message": "Η κράτηση διαγράφηκε"}
