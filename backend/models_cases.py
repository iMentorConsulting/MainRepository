from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
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
    service_type = Column(String(200))   # ΕΙΔΟΣ ΥΠΗΡΕΣΙΑΣ
    status = Column(String(100), default="ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ")  # ΚΑΤΑΣΤΑΣΗ ΕΡΓΑΣΙΑΣ
    status_category = Column(String(50))    # INTERNAL PROCESS, PENDING CLIENT, SUBMITTED, etc.
    program_category = Column(String(50), default='ΕΣΠΑ')   # ΕΣΠΑ, ΔΥΠΑ, ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ
    status_changed_at = Column(DateTime)

    # Investment/Grant Info
    approved_budget = Column(Float, default=0)   # ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ
    subsidy_percent = Column(Float, default=0)
    project_deadline = Column(Date)              # Προθεσμία Ολοκλήρωσης
    approval_date = Column(Date)                 # Ημερομηνία Έγκρισης
    follow_up_date = Column(Date)                # Επόμενο Follow-up

    # Fees agreed
    agreed_fee_application = Column(Float, default=0)       # ΠΟΣΟ ΓΙΑ ΑΙΤΗΣΗ
    agreed_fee_implementation = Column(Float, default=0)    # ΣΥΜΦΩΝΗΘΕΝ ΠΟΣΟ ΓΙΑ ΥΛΟΠΟΙΗΣΗ

    # Amount paid (synced from Sheet: SUM of ΠΟΣΟ by AFM+service_type)
    total_paid = Column(Float, default=0)

    # Assignment
    assigned_agent_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)

    # Drive
    drive_folder_url = Column(String(500))

    # Client Portal
    portal_active = Column(Boolean, default=False)
    share_token = Column(String(36), unique=True, index=True)
    portal_visit_count = Column(Integer, default=0)

    # Metadata
    sheet_import_ref = Column(String(200))  # AFM|service_type key used for sync
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


class CMTask(Base):
    __tablename__ = "cm_tasks"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)

    title = Column(String(300), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="pending")   # pending, in_progress, done, waiting_client
    priority = Column(String(20), default="normal")  # low, normal, high, urgent

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
    payment_type = Column(String(50), default="partial")  # application, implementation, partial, other
    description = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="payments")


class CMMessage(Base):
    __tablename__ = "cm_messages"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)

    content = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=True)  # True = internal only, False = client-visible
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
    status = Column(String(30), default="pending")  # pending, reviewed, approved, rejected
    uploaded_by = Column(String(100))
    notes = Column(Text)
    file_url = Column(String(500))

    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", back_populates="documents")


class CMNotificationLog(Base):
    __tablename__ = "cm_notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=True)

    notification_type = Column(String(50))  # email, viber
    recipient_name = Column(String(200))
    recipient_contact = Column(String(200))
    subject = Column(String(300))
    content = Column(Text)
    status = Column(String(30), default="sent")  # sent, failed, pending
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
    notification_type = Column(String(20), default='both')  # email, viber, both
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


class CMPendingItemTemplate(Base):
    __tablename__ = "cm_pending_item_templates"
    id = Column(Integer, primary_key=True, index=True)
    program_category = Column(String(100), nullable=False)  # ΕΣΠΑ, ΔΥΠΑ, ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ
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
