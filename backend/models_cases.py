from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey, JSON, LargeBinary
from sqlalchemy.orm import relationship, deferred
from database import Base
from datetime import datetime

ACTIVE_STATUSES = [
    "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ",
    "ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ",
    "ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΕΝΣΤΑΣΗ",
    "ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
]


class CMUser(Base):
    __tablename__ = "cm_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(200))
    phone = Column(String(50))
    role = Column(String(20), default="agent")  # admin, agent
    password_hash = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assigned_cases = relationship("CMCase", back_populates="assigned_agent")
    tasks = relationship("CMTask", back_populates="assigned_user")
    messages = relationship("CMMessage", back_populates="user")


class CMCase(Base):
    __tablename__ = "cm_cases"

    id = Column(Integer, primary_key=True, index=True)

    # Client Info
    client_name = Column(String(200), nullable=False)
    phone = Column(String(50))
    email = Column(String(200))
    afm = Column(String(20), index=True)
    accountant = Column(String(200))
    sale_date = Column(Date)

    # Program Info
    service_type = Column(String(200))
    status = Column(String(100), default="ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ")
    status_category = Column(String(50))
    program_category = Column(String(50), default='ΕΣΠΑ')
    status_changed_at = Column(DateTime)

    # Investment/Grant Info
    approved_budget = Column(Float, default=0)
    subsidy_percent = Column(Float, default=0)
    project_deadline = Column(Date)
    approval_date = Column(Date)
    follow_up_date = Column(Date)
    dypa_start_date = Column(Date)

    # Fees agreed
    agreed_fee_application = Column(Float, default=0)
    agreed_fee_implementation = Column(Float, default=0)

    # Amount paid
    total_paid = Column(Float, default=0)

    # Assignment
    assigned_agent_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)

    # Drive
    drive_folder_url = Column(String(500))

    # Client Portal
    portal_active = Column(Boolean, default=False)
    share_token = Column(String(36), unique=True, index=True)
    portal_visit_count = Column(Integer, default=0)
    portal_last_visit_at = Column(DateTime, nullable=True)
    portal_nps_score = Column(Integer, nullable=True)
    portal_nps_at = Column(DateTime, nullable=True)
    portal_review_clicked = Column(Boolean, default=False)
    portal_notified_at = Column(DateTime, nullable=True)

    # Metadata
    sheet_import_ref = Column(String(200))
    risk_score = Column(Integer, default=0)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    assigned_agent = relationship("CMUser", back_populates="assigned_cases")
    tasks = relationship("CMTask", back_populates="case", cascade="all, delete-orphan")
    payments = relationship("CMPayment", back_populates="case", cascade="all, delete-orphan")
    messages = relationship("CMMessage", back_populates="case", cascade="all, delete-orphan")
    documents = relationship("CMDocument", back_populates="case", cascade="all, delete-orphan")
    notification_logs = relationship("CMNotificationLog", back_populates="case", cascade="all, delete-orphan")
    budget_categories = relationship("CMBudgetCategory", back_populates="case", cascade="all, delete-orphan")
    pending_items = relationship("CMCasePendingItem", back_populates="case", cascade="all, delete-orphan", order_by="CMCasePendingItem.sort_order")
    modifications = relationship("CMCaseModification", back_populates="case", cascade="all, delete-orphan", order_by="CMCaseModification.modification_date")
    payment_logs = relationship("CMPaymentLog", back_populates="case", cascade="all, delete-orphan", order_by="CMPaymentLog.log_date")
    status_history = relationship("CMCaseStatusHistory", back_populates="case", cascade="all, delete-orphan", order_by="CMCaseStatusHistory.changed_at")


class CMCaseStatusHistory(Base):
    __tablename__ = "cm_case_status_history"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    from_status = Column(String(100))
    to_status = Column(String(100), nullable=False)
    changed_at = Column(DateTime, default=datetime.utcnow)
    changed_by = Column(String(100))

    case = relationship("CMCase", back_populates="status_history")


class CMTask(Base):
    __tablename__ = "cm_tasks"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)

    title = Column(String(300), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="pending")
    priority = Column(String(20), default="normal")

    assigned_to = Column(Integer, ForeignKey("cm_users.id"), nullable=True)
    due_date = Column(Date)
    completed_at = Column(DateTime)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="tasks")
    assigned_user = relationship("CMUser", back_populates="tasks")


class CMPayment(Base):
    __tablename__ = "cm_payments"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)

    amount = Column(Float, nullable=False)
    payment_date = Column(Date)
    payment_type = Column(String(50), default="partial")
    description = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="payments")


class CMMessage(Base):
    __tablename__ = "cm_messages"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)

    content = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=True)
    sent_by_client = Column(Boolean, default=False)
    author_name = Column(String(100))

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="messages")
    user = relationship("CMUser", back_populates="messages")


class CMDocument(Base):
    __tablename__ = "cm_documents"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)

    name = Column(String(300), nullable=False)
    document_type = Column(String(100))
    status = Column(String(30), default="pending")
    uploaded_by = Column(String(100))
    uploaded_by_client = Column(Boolean, default=False)
    notes = Column(Text)
    file_url = Column(String(500))
    file_data = deferred(Column(LargeBinary, nullable=True))
    mime_type = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="documents")


class CMNotificationLog(Base):
    __tablename__ = "cm_notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=True)

    notification_type = Column(String(50))
    recipient_name = Column(String(200))
    recipient_contact = Column(String(200))
    subject = Column(String(300))
    content = Column(Text)
    status = Column(String(30), default="sent")
    sent_by = Column(String(100))

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="notification_logs")


class CMBudgetCategory(Base):
    __tablename__ = "cm_budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)

    category_name = Column(String(200), nullable=False)
    approved_amount = Column(Float, default=0)
    percent_of_budget = Column(Float, default=0)
    certified_request1 = Column(Float, default=0)
    certified_request2 = Column(Float, default=0)
    certified_final = Column(Float, default=0)
    notes = Column(Text)

    case = relationship("CMCase", back_populates="budget_categories")


class CMNotificationTemplate(Base):
    __tablename__ = "cm_notification_templates"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    label = Column(String(200), nullable=False)
    subject = Column(String(300))
    content = Column(Text, nullable=False)
    notification_type = Column(String(20), default='both')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CMStatusSLA(Base):
    __tablename__ = "cm_status_sla"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String(100), unique=True, nullable=False)
    sla_days = Column(Integer, default=14)
    notification_message = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CMPipelineConfig(Base):
    __tablename__ = "cm_pipeline_configs"
    id = Column(Integer, primary_key=True, index=True)
    program_category = Column(String(50), unique=True, nullable=False)
    phases_json = Column(Text, nullable=False)
    extra_statuses_json = Column(Text, default="[]")
    status_descriptions_json = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow)


class CMPendingItemTemplate(Base):
    __tablename__ = "cm_pending_item_templates"
    id = Column(Integer, primary_key=True, index=True)
    program_category = Column(String(100), nullable=False)
    item_text = Column(String(300), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class CMCasePendingItem(Base):
    __tablename__ = "cm_case_pending_items"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    item_text = Column(String(300), nullable=False)
    comment = Column(Text)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("CMCase", back_populates="pending_items")


class CMWorkList(Base):
    __tablename__ = "cm_work_lists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    programs = Column(JSON, default=list)
    service_types = Column(JSON, default=list)
    statuses = Column(JSON, default=list)
    min_days_in_status = Column(Integer, nullable=True)
    max_days_in_status = Column(Integer, nullable=True)
    sort_order = Column(Integer, default=0)
    created_by_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CMCaseModification(Base):
    __tablename__ = "cm_case_modifications"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    modification_date = Column(Date, nullable=False)
    title = Column(String(300), nullable=False)
    justification = Column(Text, nullable=True)
    approval_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("CMCase", back_populates="modifications")


class CMPortalFile(Base):
    __tablename__ = "cm_portal_files"

    id = Column(Integer, primary_key=True, index=True)
    # Shared per service type — not tied to a specific case
    service_type = Column(String(200), nullable=False, index=True)

    original_filename = Column(String(300), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_data = Column(LargeBinary, nullable=False)

    client_description = Column(String(500), nullable=False)
    client_instructions = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)

    uploaded_at = Column(DateTime, default=datetime.utcnow)


class CMPaymentLog(Base):
    """Tracks every change to total_paid (from Google Sheets sync)."""
    __tablename__ = "cm_payment_logs"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    log_date = Column(DateTime, default=datetime.utcnow, index=True)
    previous_total = Column(Float, nullable=False, default=0)
    new_total = Column(Float, nullable=False)
    delta = Column(Float, nullable=False)          # new_total - previous_total
    source = Column(String(50), default="sheet_import")

    case = relationship("CMCase", back_populates="payment_logs")
