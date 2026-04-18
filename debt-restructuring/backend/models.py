from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from database import Base
from datetime import datetime
import secrets


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

    # Internal notes
    notes = Column(Text, default="")

    # Token for read-only client shareable link
    share_token = Column(String, unique=True, index=True, default=lambda: secrets.token_urlsafe(24))

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
