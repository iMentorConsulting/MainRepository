from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from database import Base
from datetime import datetime
import secrets





class AppConfig(Base):
    __tablename__ = "app_config"
    key = Column(String, primary_key=True)
    value = Column(Text, default="{}")


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)

    # Client info
    client_name = Column(String, nullable=False)
    client_phone = Column(String, default="")
    client_email = Column(String, default="")

    # Employee who created/owns the case
    employee = Column(String, nullable=False)  # STELLA / VALLIA / SOFIA / HARIS

    # Lifecycle status
    status = Column(String, default="draft")  # draft / submitted / in_review / completed / cancelled

    # Debtor type
    debtor_type = Column(String, default="Φυσικό Πρόσωπο")

    # Raw input data stored as JSON
    debts = Column(JSON, default=list)
    assets = Column(JSON, default=list)
    income_data = Column(JSON, default=dict)

    # Calculated estimates snapshot (saved when case is saved)
    estimates = Column(JSON, default=dict)

    # Actual results filled after the restructuring completes
    actual_results = Column(JSON, nullable=True)

    # Client VAT number (9 digits) — used as portal access code
    client_vat = Column(String, nullable=True, default=None)

    # Internal notes
    notes = Column(Text, default="")

    # Token for read-only client shareable link
    share_token = Column(String, unique=True, index=True, default=lambda: secrets.token_urlsafe(24))

    # Portal access control
    portal_active = Column(Boolean, default=True)

    # Sales follow-up pipeline
    contact_stage = Column(String, default="Νέα Ανάλυση")
    last_contacted_at = Column(DateTime, nullable=True)
    reminder_count = Column(Integer, default=0)

    # Commercial offer { application_fee: 0, success_fee: 0 }
    commercial_offer = Column(JSON, default=dict)

    # Portal visit tracking
    portal_visit_count = Column(Integer, default=0)
    portal_visits = Column(JSON, default=list)  # [{at: "iso", ip: "..."}]

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    stage_changed_at = Column(DateTime, nullable=True)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)

    # Synced from Google Sheets (overwritten on each sync)
    sheet_row_num = Column(Integer, nullable=True, index=True)
    status = Column(String, default="")
    assigned_to = Column(String, default="")
    date = Column(String, default="")
    name = Column(String, default="", index=True)
    sheet_comments = Column(Text, default="")
    next_call_sheet = Column(String, default="")
    total_debt = Column(String, default="")
    phone = Column(String, default="", index=True)
    email = Column(String, default="")
    offer_sent = Column(Boolean, default=False)
    offer_sent_date = Column(String, default="")
    offer_amount = Column(String, default="")
    success_fee = Column(String, default="")
    vulnerable_debtor = Column(Boolean, default=False)
    referrer = Column(String, default="")
    service_type = Column(String, default="")
    application_number = Column(String, default="")
    viber_info = Column(String, default="")

    # App-only fields (never overwritten by sync)
    app_comments = Column(JSON, default=list)   # [{text, author, at}]
    app_next_call = Column(DateTime, nullable=True)
    linked_case_id = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
