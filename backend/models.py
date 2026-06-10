from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import secrets


def _token():
    return secrets.token_urlsafe(32)


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


class GuestToken(Base):
    __tablename__ = 'guest_tokens'

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey('bookings.id'), nullable=False)
    tenant = Column(String(50), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True, default=_token)
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    view_count = Column(Integer, default=0)
    last_viewed = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WelcomeGuideItem(Base):
    __tablename__ = 'welcome_guide_items'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey('units.id'), nullable=True)
    category = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class LocalRecommendation(Base):
    __tablename__ = 'local_recommendations'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, index=True)
    category = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    phone = Column(String(50))
    website = Column(String(500))
    address = Column(String(300))
    maps_url = Column(String(500))
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class MarketplaceItem(Base):
    __tablename__ = 'marketplace_items'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    price = Column(Float, default=0.0)
    is_available = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)


class ServiceRequest(Base):
    __tablename__ = 'service_requests'

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey('bookings.id'), nullable=False)
    tenant = Column(String(50), nullable=False, index=True)
    marketplace_item_id = Column(Integer, ForeignKey('marketplace_items.id'), nullable=True)
    service_type = Column(String(100), nullable=False)
    description = Column(Text)
    status = Column(String(20), default='received')
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class GuestMessage(Base):
    __tablename__ = 'guest_messages'

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey('bookings.id'), nullable=False)
    tenant = Column(String(50), nullable=False, index=True)
    sender = Column(String(10), nullable=False)  # guest, manager, ai
    message = Column(Text, nullable=False)
    photo_path = Column(String(500))
    message_type = Column(String(20), default='chat')  # chat, issue_report, ai_response
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class GuestPortalSettings(Base):
    __tablename__ = 'guest_portal_settings'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, unique=True, index=True)
    welcome_message = Column(Text, default='Welcome! We hope you enjoy your stay.')
    checkin_time = Column(String(10), default='14:00')
    checkout_time = Column(String(10), default='11:00')
    manager_phone = Column(String(50))
    manager_email = Column(String(200))
    emergency_contact = Column(String(200))
    hospital_name = Column(String(200))
    hospital_phone = Column(String(50))
    police_phone = Column(String(20), default='100')
    ambulance_phone = Column(String(20), default='166')
    fire_phone = Column(String(20), default='199')
    from_name = Column(String(100))
    # Per-tenant SMTP (overrides Railway env vars when set)
    smtp_host = Column(String(200))
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(200))
    smtp_pass = Column(String(200))
    notification_email = Column(String(200))


class InstallationLicense(Base):
    __tablename__ = 'installation_licenses'

    id = Column(Integer, primary_key=True)
    tenant = Column(String(50), nullable=False, unique=True, index=True)
    license_key = Column(String(100), nullable=False, unique=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
    software_name = Column(String(200), default='Villa Booking Management System')
    software_version = Column(String(20), default='2.0')
