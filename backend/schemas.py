from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitBase(BaseModel):
    name: str
    type: str
    capacity: int = 2
    description: Optional[str] = None
    base_price: float = 0.0
    is_active: bool = True
    ical_url: Optional[str] = None


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    capacity: Optional[int] = None
    description: Optional[str] = None
    base_price: Optional[float] = None
    is_active: Optional[bool] = None
    ical_url: Optional[str] = None


class UnitResponse(UnitBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Customer ──────────────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    nationality: Optional[str] = None
    id_number: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    nationality: Optional[str] = None
    id_number: Optional[str] = None
    notes: Optional[str] = None


class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Booking ───────────────────────────────────────────────────────────────────

class BookingBase(BaseModel):
    unit_id: int
    customer_id: int
    channel: str
    check_in: date
    check_out: date
    guests: int = 1
    total_price: float = 0.0
    commission: float = 0.0
    commission_percent: float = 0.0
    status: str = "confirmed"
    is_billed: bool = False
    notes: Optional[str] = None


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    unit_id: Optional[int] = None
    customer_id: Optional[int] = None
    channel: Optional[str] = None
    check_in: Optional[date] = None
    check_out: Optional[date] = None
    guests: Optional[int] = None
    total_price: Optional[float] = None
    commission: Optional[float] = None
    commission_percent: Optional[float] = None
    status: Optional[str] = None
    is_billed: Optional[bool] = None
    notes: Optional[str] = None


class BookingResponse(BookingBase):
    id: int
    created_at: datetime
    unit: UnitResponse
    customer: CustomerResponse

    class Config:
        from_attributes = True


# ── AI Advisor ────────────────────────────────────────────────────────────────

class BookingRequest(BaseModel):
    check_in: date
    check_out: date
    guests: int = 1
    unit_type: Optional[str] = None
