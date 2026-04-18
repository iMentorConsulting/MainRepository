from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    capacity = Column(Integer, nullable=False, default=2)
    description = Column(Text)
    base_price = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, default=True)
    ical_url = Column(String(500), nullable=True)
    tenant = Column(String(50), nullable=False, default='evaivoni', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="unit")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(200))
    phone = Column(String(50))
    nationality = Column(String(50))
    id_number = Column(String(100))
    notes = Column(Text)
    tenant = Column(String(50), nullable=False, default='evaivoni', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="customer")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    channel = Column(String(50), nullable=False)
    check_in = Column(Date, nullable=False)
    check_out = Column(Date, nullable=False)
    guests = Column(Integer, nullable=False, default=1)
    total_price = Column(Float, nullable=False, default=0.0)
    commission = Column(Float, default=0.0)
    commission_percent = Column(Float, default=0.0)
    status = Column(String(20), nullable=False, default="confirmed")
    is_billed = Column(Boolean, default=False)
    notes = Column(Text)
    ical_uid = Column(String(200), nullable=True, index=True)
    tenant = Column(String(50), nullable=False, default='evaivoni', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    unit = relationship("Unit", back_populates="bookings")
    customer = relationship("Customer", back_populates="bookings")


class CleaningSettings(Base):
    __tablename__ = 'cleaning_settings'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, unique=True, index=True)
    clean_every_days = Column(Integer, default=3)
    linen_every_days = Column(Integer, default=5)
    laundry_on_day = Column(Integer, default=3)
    laundry_min_stay = Column(Integer, default=4)
