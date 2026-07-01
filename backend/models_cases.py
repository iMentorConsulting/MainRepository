from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, ForeignKey, JSON, LargeBinary
from sqlalchemy.orm import relationship, deferred, backref
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

    # LOGISTIS Portal integration
    portal_case_number = Column(Integer, nullable=True, index=True)

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
    drive_file_id = Column(String(200), nullable=True)
    upload_source = Column(String(50), nullable=True)  # 'consultant' | 'portal_general' | 'portal_pending_item'
    portal_visible = Column(Boolean, default=False, nullable=True)  # consultant docs visible in client portal

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
    item_text = Column(String(2000), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class CMCasePendingItem(Base):
    __tablename__ = "cm_case_pending_items"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=False)
    item_text = Column(String(2000), nullable=False)
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
    file_data = Column(LargeBinary, nullable=True)
    drive_file_id = Column(String(200), nullable=True)

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


class CMBackupLog(Base):
    __tablename__ = "cm_backup_logs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20))          # "success" | "failed"
    trigger = Column(String(20))         # "auto" | "manual"
    destination = Column(String(20))     # "db" | "export"
    file_name = Column(String(300))
    size_bytes = Column(Integer)
    error_message = Column(Text)
    json_data = Column(Text)             # actual backup JSON stored in DB
    drive_file_id = Column(String(200))  # Google Drive file ID if uploaded


class CMStatusNotificationConfig(Base):
    __tablename__ = "cm_status_notification_configs"
    id = Column(Integer, primary_key=True)
    status = Column(String(100), unique=True, nullable=False)
    enabled = Column(Boolean, default=False)


class CMCaseAnakainizw(Base):
    """Extra data specific to ΑΝΑΚΑΙΝΙΖΩ program cases."""
    __tablename__ = "cm_case_anakainizw"
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cm_cases.id"), unique=True, nullable=False)

    # Property details
    property_sqm = Column(Float, nullable=True)
    property_prefecture = Column(String(200), nullable=True)
    property_address = Column(String(500), nullable=True)
    property_type = Column(String(100), nullable=True)       # Τύπος Κατοικίας
    property_age = Column(String(100), nullable=True)        # Παλαιότητα Κατοικίας
    property_usage = Column(String(50), nullable=True)       # ΚΕΝΟ/ΜΙΣΘΩΜΕΝΟ/ΙΔΙΟΚΑΤΟΙΚΗΣΗ
    renovation_works = Column(String(500), nullable=True)    # Εργασίες Ανακαίνισης
    legality = Column(String(200), nullable=True)            # Νομιμότητα Ακινήτου

    cooperating_engineer = Column(String(200), nullable=True)
    subsidy_percent = Column(Float, default=70)              # 70 or 90

    energy_works_budget = Column(Float, default=0)           # >=20% of total
    general_works_budget = Column(Float, default=0)          # remainder

    # Household type & income criteria
    household_type = Column(String(50), nullable=True)       # άγαμος/ζευγάρι
    num_children = Column(Integer, default=0)

    # Legacy single booleans (kept for compat)
    is_single_parent = Column(Boolean, default=False)
    is_three_children = Column(Boolean, default=False)

    # Subsidy increase flags
    boost_island = Column(Boolean, default=False)            # Νησί/ορεινά
    boost_single_parent = Column(Boolean, default=False)     # Μονογονεική
    boost_three_children = Column(Boolean, default=False)    # Τρίτεκνη
    boost_large_family = Column(Boolean, default=False)      # Πολύτεκνη
    boost_youth = Column(Boolean, default=False)             # Νέοι 25-35

    # Document checklist (from Google Sheet)
    doc_title_deed = Column(Boolean, default=False)          # *ΤΙΤΛΟΣ
    doc_e9 = Column(Boolean, default=False)                  # *Ε9
    doc_permit = Column(Boolean, default=False)              # *ΑΔΕΙΑ
    doc_legalization = Column(Boolean, default=False)        # *ΤΑΚΤ.ΑΥΘ.
    doc_plans = Column(Boolean, default=False)               # *ΣΧΕΔΙΑ
    doc_e1 = Column(Boolean, default=False)                  # Ε1
    doc_tax_clearance = Column(Boolean, default=False)       # ΕΚΚΑΘ
    doc_e2 = Column(Boolean, default=False)                  # Ε2

    # Per-doc extras: JSON {"doc_title_deed": {"not_needed": false, "notes": ""}, ...}
    doc_extras = Column(Text, nullable=True)

    # ΑΜΕΑ boost
    boost_disability = Column(Boolean, default=False)

    actual_income = Column(Float, nullable=True)
    budget_items = Column(Text, nullable=True)     # JSON {category_key: amount}
    advisor_checks = Column(Text, nullable=True)   # JSON {check_key: {status, comment}}

    inspection_fee_paid = Column(Boolean, default=False)
    inspection_fee_paid_at = Column(DateTime, nullable=True)

    # Client intake form submitted via portal
    client_intake_submitted_at = Column(Text, nullable=True)  # ISO timestamp string
    client_intake_data = Column(Text, nullable=True)           # JSON snapshot of submitted values

    updated_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("CMCase", backref=backref("anakainizw_data", cascade="all, delete-orphan", uselist=False))


class CMFinanceSyncServiceType(Base):
    """Allowlist of service types that the finance sync is permitted to import."""
    __tablename__ = "cm_finance_sync_service_types"
    id = Column(Integer, primary_key=True)
    service_type = Column(String(200), unique=True, nullable=False)
    enabled = Column(Boolean, default=False, nullable=False)
    discovered_at = Column(DateTime, default=datetime.utcnow)


class CMPortalAssignment(Base):
    """Incoming 'case.created' assignments from the LOGISTIS Accountant Portal,
    awaiting manual acceptance by a case-management agent."""
    __tablename__ = "cm_portal_assignments"

    id = Column(Integer, primary_key=True)
    case_number = Column(Integer, nullable=False, index=True)
    afm = Column(String(20))
    onomasia = Column(String(200))
    phone = Column(String(50))
    email = Column(String(200))
    accountant_office = Column(String(200))
    case_type = Column(String(200))
    description = Column(Text)
    priority = Column(String(50))
    program_title = Column(String(200))

    status = Column(String(20), default="pending")  # pending | accepted | dismissed
    cm_case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class CMPortalAssignmentRequest(Base):
    """Outgoing request from a CM agent asking the LOGISTIS Accountant Portal
    to route a specific client/program assignment to the Case Management app."""
    __tablename__ = "cm_portal_assignment_requests"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), nullable=False)
    program = Column(String(100), nullable=False)
    note = Column(Text, nullable=True)
    requested_by = Column(String(100))

    status = Column(String(20), default="sent")  # sent | failed | fulfilled
    portal_response = Column(Text, nullable=True)
    case_number = Column(Integer, nullable=True)  # filled in once LOGISTIS links a case via requestRef
    cm_assignment_id = Column(Integer, ForeignKey("cm_portal_assignments.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


KLADOS_OPTIONS = ["ΕΜΠΟΡΙΟ", "ΥΠΗΡΕΣΙΕΣ", "ΤΟΥΡΙΣΜΟΣ", "ΜΕΤΑΠΟΙΗΣΗ", "ΕΣΤΙΑΣΗ", "ΑΓΡΟΤΙΚΑ"]


class CMBusinessProfile(Base):
    """Cached LOGISTIS/ΑΑΔΕ business profile for a given AFM. Looked up at
    most once per AFM (cached here) — case.created webhooks and the outbound
    POST /api/external/businesses lookup both populate/reuse this record."""
    __tablename__ = "cm_business_profiles"

    id = Column(Integer, primary_key=True)
    afm = Column(String(20), nullable=False, unique=True, index=True)
    onomasia = Column(String(200))
    commercial_title = Column(String(200))
    legal_status_descr = Column(String(200))
    regdate = Column(Date, nullable=True)  # ημ. έναρξης
    doy = Column(String(50))
    doy_descr = Column(String(200))
    postal_address = Column(String(200))
    postal_address_no = Column(String(20))
    postal_zip_code = Column(String(20))
    postal_area_description = Column(String(200))
    perifereia = Column(String(100))
    klados = Column(String(50))  # one of KLADOS_OPTIONS

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    activities = relationship("CMBusinessActivity", back_populates="business", cascade="all, delete-orphan")
    matched_programs = relationship("CMBusinessMatchedProgram", back_populates="business", cascade="all, delete-orphan")


class CMBusinessActivity(Base):
    """One ΚΑΔ row (firmActCode/firmActDescr/firmActKind) for a business profile."""
    __tablename__ = "cm_business_activities"

    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("cm_business_profiles.id"), nullable=False, index=True)
    firm_act_code = Column(String(20))
    firm_act_descr = Column(String(300))
    firm_act_kind = Column(String(50))

    business = relationship("CMBusinessProfile", back_populates="activities")


class CMBusinessMatchedProgram(Base):
    """A program LOGISTIS matched against this business (REJECTED ones excluded upstream)."""
    __tablename__ = "cm_business_matched_programs"

    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("cm_business_profiles.id"), nullable=False, index=True)
    title = Column(String(300))
    status = Column(String(50))

    business = relationship("CMBusinessProfile", back_populates="matched_programs")


# ── Leads ──────────────────────────────────────────────────────────────────
# Prospective clients collected via per-program Google Sheets, screened by the
# ΕΡΜΗΣ AI assistant (hosted in the LOGISTIS app), and converted into CMCase
# records once they become deals.

LEAD_STATUSES = ["NEW LEAD", "CALL", "HOT", "ACTIVE", "DEAL", "CANCEL"]


class CMLead(Base):
    __tablename__ = "cm_leads"

    id = Column(Integer, primary_key=True, index=True)

    # Contact / business
    name = Column(String(200))
    phone = Column(String(50))
    phone2 = Column(String(50))
    email = Column(String(200))
    afm = Column(String(20), index=True)

    # Program / commercial
    program = Column(String(100))          # ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ | ΔΥΠΑ | ΕΣΠΑ | ΑΝΑΚΑΙΝΙΖΩ
    service_type = Column(String(150))
    total_amount = Column(Float, default=0)

    # Pipeline
    status = Column(String(30), default="NEW LEAD", index=True)  # LEAD_STATUSES
    assigned_agent_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)
    assigned_name = Column(String(150))    # raw consultant name from the sheet (free text)
    source = Column(String(200))
    notes = Column(Text)
    next_call_date = Column(Date, nullable=True)

    # Case linkage (once converted)
    linked_case_id = Column(Integer, ForeignKey("cm_cases.id"), nullable=True)

    # ΕΡΜΗΣ AI pre-screening
    ermis_token = Column(String(100), index=True)
    ermis_chat_url = Column(String(500))
    ermis_status = Column(String(30))       # starting | in_progress | eligible | ineligible | error
    ermis_transcript = Column(Text)         # JSON-encoded list of {role,text,ts}
    ermis_error = Column(String(500))       # last failure reason (when ermis_status == error)
    ermis_started_at = Column(DateTime, nullable=True)
    ermis_completed_at = Column(DateTime, nullable=True)

    # Google Sheets sync
    sheet_config_id = Column(Integer, ForeignKey("cm_lead_sheet_configs.id"), nullable=True)
    sheet_row_num = Column(Integer, nullable=True)          # watermark within its sheet
    sheet_import_ref = Column(String(200), index=True)      # dedup guard, e.g. "<spreadsheet_id>:<row>"

    # Program-specific columns that vary per sheet, kept schema-free
    program_fields = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_agent = relationship("CMUser", foreign_keys=[assigned_agent_id])
    comments = relationship("CMLeadComment", back_populates="lead", cascade="all, delete-orphan")


class CMLeadComment(Base):
    __tablename__ = "cm_lead_comments"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("cm_leads.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("cm_users.id"), nullable=True)

    content = Column(Text, nullable=False)   # raw markup (**bold**, [c=#hex]…[/c]), rendered client-side
    author_name = Column(String(100))
    edited = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lead = relationship("CMLead", back_populates="comments")


class CMLeadSheetConfig(Base):
    """Per-program Google Sheet source config. DB-driven so staff can re-map
    columns when a sheet layout changes without a redeploy."""
    __tablename__ = "cm_lead_sheet_configs"

    id = Column(Integer, primary_key=True, index=True)
    program = Column(String(100), unique=True, nullable=False)  # one config per program
    spreadsheet_id = Column(String(200))
    sheet_tab = Column(String(100))
    header_row = Column(Integer, default=1)

    # logical field -> column letter/index (e.g. {"name": "B", "phone": "C"})
    column_map = Column(JSON, nullable=True)
    # program-specific header -> {"key": <program_fields key>, "label": <display>}
    program_field_map = Column(JSON, nullable=True)

    enabled = Column(Boolean, default=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_row_num = Column(Integer, default=0)   # highest row imported so far (watermark)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CMLeadNotificationLog(Base):
    """Audit trail of ΕΡΜΗΣ-link / outreach sends to a lead — prevents duplicate
    sends and mirrors CMNotificationLog (which is case-bound)."""
    __tablename__ = "cm_lead_notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("cm_leads.id"), nullable=True, index=True)

    notification_type = Column(String(50))   # viber | email | ermis_link
    recipient_name = Column(String(200))
    recipient_contact = Column(String(200))
    subject = Column(String(300))
    content = Column(Text)
    status = Column(String(30), default="sent")
    sent_by = Column(String(100))

    created_at = Column(DateTime, default=datetime.utcnow)
