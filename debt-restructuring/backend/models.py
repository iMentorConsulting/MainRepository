from sqlalchemy import Column, Integer, Float, String, Text, DateTime, JSON, Boolean
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

    # External referral (e.g. LOGISTIS Accountant Portal)
    external_source = Column(String, nullable=True, default=None)     # e.g. "logistis"
    external_ref = Column(String, nullable=True, index=True, default=None)  # portal's callbackRef
    external_status = Column(String, nullable=True, default=None)     # last status pushed back to portal
    external_accepted = Column(Boolean, default=True)                 # False = awaiting agent acceptance
    external_data = Column(JSON, default=dict)                        # raw payload from portal (questionnaire, taxisnet creds, etc.)



class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)

    # Synced from Google Sheets (overwritten on each sync)
    sheet_row_num = Column(Integer, nullable=True, index=True)
    status = Column(String, default="")        # normalized group: CALL/HOT/ACTIVE/DEAL/CANCEL
    status_raw = Column(String, default="")    # original value from sheet e.g. CANCEL-INTEREST
    assigned_to = Column(String, default="")
    date = Column(String, default="")
    month_sheet = Column(String, default="")   # ΜΗΝΑΣ column
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
    platform_result = Column(String, default="")  # ΑΠΟΤΕΛΕΣΜΑ ΠΛΑΤΦΟΡΜΑΣ
    extra_fields = Column(JSON, default=dict)     # all other unmapped sheet columns

    # TaxisNet credentials (app-only) — primary debtor
    taxisnet_username = Column(String, default="")
    taxisnet_password = Column(String, default="")

    # Spouse / 2nd person credentials (app-only)
    spouse_name = Column(String, default="")
    taxisnet_username_2 = Column(String, default="")
    taxisnet_password_2 = Column(String, default="")

    # App-only fields (never overwritten by sync)
    phone2 = Column(String, default="")         # second contact phone (agent-entered)
    app_comments = Column(JSON, default=list)   # [{text, author, at}]
    app_next_call = Column(DateTime, nullable=True)
    linked_case_id = Column(Integer, nullable=True)

    # Public token for the Θέμις AI screening chat link
    themis_token = Column(String, unique=True, index=True, default=lambda: secrets.token_urlsafe(24))

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class IrisPayment(Base):
    """IRIS payments (DIAS Request to Pay) - eCommerce / RI0 unstructured payment code.

    Spec reference: DIAS-ORG05-V1R4 (IRIS payments, Hlektroniko Emporio,
    Prodiagrafes Leitourgias Hlektronikou Katastimatos), Parartima A.
    """

    __tablename__ = "iris_payments"

    id = Column(Integer, primary_key=True, index=True)

    # Public reference shown to the customer / used in admin UI
    payment_id = Column(String, unique=True, index=True, nullable=False)

    customer_name = Column(String, nullable=False)
    customer_afm = Column(String, default="")
    service_type = Column(String, default="")

    net_amount = Column(Float, nullable=False)
    vat_amount = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)

    payment_reason = Column(String, default="")          # unstructured1
    payment_code_ri0 = Column(String, index=True, default="")  # unstructured2

    # DIAS Initiation message correlation
    message_id = Column(String, index=True, default="")
    initiating_party_ref_id = Column(String, unique=True, index=True, default="")
    dias_order_id = Column(String, index=True, default="")
    bank_selection_tool_url = Column(Text, default="")

    # Internal status: created, pending, authorised, paid, expired, cancelled, failed
    status = Column(String, default="created", index=True)
    original_tx_status = Column(String, default="")   # ACSP / RJCT (from DIAS Result)
    payer_name = Column(String, default="")            # debtorName from DIAS Result

    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)

    raw_initiation_response = Column(JSON, nullable=True)
    raw_result_response = Column(JSON, nullable=True)

    error_code = Column(String, default="")
    error_description = Column(Text, default="")

    linked_case_id = Column(Integer, nullable=True)
    created_by = Column(String, default="")


class Notification(Base):
    """In-app notification — delivered once (toast + sound) then marked delivered.

    recipient matches the employee-name string used everywhere else
    (JWT sub / Case.employee / Lead.assigned_to), e.g. "HARIS".
    """

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient = Column(String, index=True, nullable=False)
    kind = Column(String, default="")  # price_request / price_approved / price_rejected / daily_reminders
    title = Column(String, default="")
    message = Column(Text, default="")
    link = Column(String, nullable=True)
    case_id = Column(Integer, nullable=True)
    delivered = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ThemisSession(Base):
    """One Θέμις AI screening chat attempt per Lead.

    transcript is a JSON list of {role: "themis"|"lead", text, at}.
    status: in_progress / eligible / ineligible.
    """

    __tablename__ = "themis_sessions"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, index=True, nullable=False)
    transcript = Column(JSON, default=list)
    status = Column(String, default="in_progress")
    verdict_reason = Column(Text, default="")
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cache_creation_tokens = Column(Integer, default=0)
    cache_read_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CallAttempt(Base):
    """Track phone call attempts made by consultants on leads."""

    __tablename__ = "call_attempts"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, nullable=False, index=True)
    consultant = Column(String, default="")  # assigned_to field value (e.g. "STELLA")
    call_type = Column(String, default="outbound")  # outbound / inbound
    answered = Column(Boolean, nullable=True)  # True/False/None if unknown
    duration_seconds = Column(Integer, nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
