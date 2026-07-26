import os
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from models_cases import CMUser, CMCase, CMTask, CMPayment, CMMessage, CMDocument, CMNotificationLog, CMBudgetCategory, CMPendingItemTemplate, CMCasePendingItem, CMPipelineConfig, CMCaseStatusHistory

# Case management routes
from routes.cm_auth import router as cm_auth_router
from routes.cm_users import router as cm_users_router
from routes.cases import router as cases_router
from routes.cm_dashboard import router as cm_dashboard_router
from routes.cm_google_sheets import router as cm_sheets_router
from routes.cm_notifications import router as cm_notifications_router
from routes.cm_admin import router as cm_admin_router
from routes.cm_pending_items import router as cm_pending_items_router
from routes.cm_portal import router as cm_portal_router
from routes.cm_pipeline import router as cm_pipeline_router
from routes.cm_worklists import router as cm_worklists_router
from routes.cm_analytics import router as cm_analytics_router
from routes.cm_modifications import router as cm_modifications_router
from routes.cm_portal_files import router as cm_portal_files_router  # portal docs per service type
from routes.cm_revenue import router as cm_revenue_router
from routes.cm_backup import router as cm_backup_router
from models_cases import CMBackupLog
from routes.cm_anakainizw import router as cm_anakainizw_router
from routes.cm_finance_sync import router as cm_finance_sync_router
from routes.cm_portal_integration import router as cm_portal_integration_router
from routes.finance_api import router as finance_api_router
from routes.cm_leads import router as cm_leads_router
from routes.cm_leads_sync import router as cm_leads_sync_router
from routes.cm_leads_ermis import router as cm_leads_ermis_router

load_dotenv()

# ── Wait for Postgres before running any DB code ──────────────────────────────
import time as _time
from sqlalchemy import text as _text_ping

def _wait_for_db(max_attempts: int = 30, delay: float = 2.0) -> bool:
    """Retry DB connection so the app survives Postgres cold-starts / WAL recovery."""
    for attempt in range(max_attempts):
        try:
            with engine.connect() as _c:
                _c.execute(_text_ping("SELECT 1"))
            if attempt > 0:
                print(f"[startup] DB ready after {attempt} retries.")
            return True
        except Exception as exc:
            remaining = max_attempts - attempt - 1
            print(f"[startup] DB not ready (attempt {attempt + 1}/{max_attempts}): {exc}"
                  + (f" — retrying in {delay}s" if remaining else " — giving up, app will start without DB init"))
            if remaining:
                _time.sleep(delay)
    return False

_db_ready = _wait_for_db()

# Create all DB tables
try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    print(f"[startup] create_all failed (DB may still be recovering): {_e}")

# Startup migration: add new columns and backfill status data
from sqlalchemy import text as _text
from pipelines import OLD_STATUS_MAP as _OSM
from database import SessionLocal
try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS program_category VARCHAR(50)"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS follow_up_date DATE"))
        _conn.execute(_text("ALTER TABLE cm_status_sla ADD COLUMN IF NOT EXISTS notification_message TEXT"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS share_token VARCHAR(36)"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_visit_count INTEGER DEFAULT 0"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_case_number INTEGER"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS drive_folder_url VARCHAR(500)"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_nps_score INTEGER"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_nps_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_review_clicked BOOLEAN DEFAULT FALSE"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS dypa_start_date DATE"))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_pipeline_configs (
                id SERIAL PRIMARY KEY,
                program_category VARCHAR(50) UNIQUE NOT NULL,
                phases_json TEXT NOT NULL,
                extra_statuses_json TEXT DEFAULT '[]',
                updated_at TIMESTAMP
            )
        """))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_last_visit_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS portal_notified_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_pipeline_configs ADD COLUMN IF NOT EXISTS status_descriptions_json TEXT DEFAULT '{}'"))
        _conn.execute(_text("ALTER TABLE cm_messages ADD COLUMN IF NOT EXISTS sent_by_client BOOLEAN DEFAULT FALSE"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS uploaded_by_client BOOLEAN DEFAULT FALSE"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS file_data BYTEA"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS upload_source VARCHAR(50)"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN DEFAULT FALSE"))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_case_status_history (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES cm_cases(id) ON DELETE CASCADE,
                from_status VARCHAR(100),
                to_status VARCHAR(100) NOT NULL,
                changed_at TIMESTAMP DEFAULT NOW(),
                changed_by VARCHAR(100)
            )
        """))
        # One-time reset: clear visit counts for cases not yet visited since new tracking
        _conn.execute(_text("UPDATE cm_cases SET portal_visit_count = 0 WHERE portal_last_visit_at IS NULL"))
        # Migrate cm_portal_files: only drop+recreate if the old case_id column exists (one-time migration)
        _conn.execute(_text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='cm_portal_files' AND column_name='case_id'
                ) THEN
                    DROP TABLE cm_portal_files;
                END IF;
            END $$;
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_portal_files (
                id SERIAL PRIMARY KEY,
                service_type VARCHAR(200) NOT NULL,
                original_filename VARCHAR(300) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size INTEGER NOT NULL,
                file_data BYTEA NOT NULL,
                client_description VARCHAR(500) NOT NULL,
                client_instructions TEXT,
                internal_notes TEXT,
                uploaded_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.commit()
except Exception:
    pass

# Migration: create cm_status_notification_configs table
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_status_notification_configs (
                id SERIAL PRIMARY KEY,
                status VARCHAR(100) UNIQUE NOT NULL,
                enabled BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.commit()
except Exception:
    pass

# Migration: create backup_logs table
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_backup_logs (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMP DEFAULT NOW(),
                status VARCHAR(20),
                trigger VARCHAR(20),
                destination VARCHAR(20),
                file_name VARCHAR(300),
                size_bytes INTEGER,
                error_message TEXT,
                json_data TEXT
            )
        """))
        _conn.commit()
except Exception:
    pass

# Ensure backup log columns are up to date
try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_backup_logs ADD COLUMN IF NOT EXISTS json_data TEXT"))
        _conn.execute(_text("ALTER TABLE cm_backup_logs ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
        _conn.commit()
except Exception:
    pass

# Migration: cm_case_anakainizw table
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_case_anakainizw (
                id SERIAL PRIMARY KEY,
                case_id INTEGER UNIQUE REFERENCES cm_cases(id) ON DELETE CASCADE,
                property_sqm FLOAT,
                property_prefecture VARCHAR(200),
                property_address VARCHAR(500),
                cooperating_engineer VARCHAR(200),
                subsidy_percent FLOAT DEFAULT 70,
                energy_works_budget FLOAT DEFAULT 0,
                general_works_budget FLOAT DEFAULT 0,
                is_single_parent BOOLEAN DEFAULT FALSE,
                is_three_children BOOLEAN DEFAULT FALSE,
                inspection_fee_paid BOOLEAN DEFAULT FALSE,
                inspection_fee_paid_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Add new columns (IF NOT EXISTS is idempotent)
        new_cols = [
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS property_type VARCHAR(100)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS property_age VARCHAR(100)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS property_usage VARCHAR(50)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS renovation_works VARCHAR(500)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS legality VARCHAR(200)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS household_type VARCHAR(50)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS num_children INTEGER DEFAULT 0",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_island BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_single_parent BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_three_children BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_large_family BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_youth BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_title_deed BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_e9 BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_permit BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_legalization BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_plans BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_e1 BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_tax_clearance BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_e2 BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS doc_extras TEXT",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS boost_disability BOOLEAN DEFAULT FALSE",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS actual_income NUMERIC(12,2)",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS budget_items TEXT",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS advisor_checks TEXT",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS client_intake_submitted_at TEXT",
            "ALTER TABLE cm_case_anakainizw ADD COLUMN IF NOT EXISTS client_intake_data TEXT",
        ]
        for stmt in new_cols:
            try:
                _conn.execute(_text(stmt))
            except Exception:
                pass
        _conn.commit()
except Exception:
    pass

# Ensure file_data + mime_type columns exist on cm_documents (isolated so failures above don't block this)
try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS file_data BYTEA"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)"))
        _conn.commit()
except Exception:
    pass

# Migration: Google Drive storage columns
try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
        _conn.execute(_text("ALTER TABLE cm_portal_files ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
        # DROP NOT NULL needs exclusive lock — set a short timeout so startup never hangs
        _conn.execute(_text("SET LOCAL lock_timeout = '4s'"))
        _conn.execute(_text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'cm_portal_files'
                      AND column_name = 'file_data'
                      AND is_nullable = 'NO'
                ) THEN
                    ALTER TABLE cm_portal_files ALTER COLUMN file_data DROP NOT NULL;
                END IF;
            END $$
        """))
        _conn.commit()
except Exception:
    pass

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_pending_item_templates ALTER COLUMN item_text TYPE VARCHAR(2000)"))
        _conn.execute(_text("ALTER TABLE cm_case_pending_items ALTER COLUMN item_text TYPE VARCHAR(2000)"))
        _conn.commit()
except Exception:
    pass

# Normalize property_usage values imported before case-normalization fix
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            UPDATE cm_case_anakainizw SET property_usage = 'ΚΕΝΟ'
            WHERE property_usage ILIKE 'κεν%'
              AND property_usage <> 'ΚΕΝΟ'
        """))
        _conn.execute(_text("""
            UPDATE cm_case_anakainizw SET property_usage = 'ΜΙΣΘΩΜΕΝΟ'
            WHERE property_usage ILIKE '%μισθ%'
              AND property_usage <> 'ΜΙΣΘΩΜΕΝΟ'
        """))
        _conn.execute(_text("""
            UPDATE cm_case_anakainizw SET property_usage = 'ΙΔΙΟΚΑΤΟΙΚΗΣΗ'
            WHERE property_usage ILIKE '%ιδιοκατ%'
              AND property_usage <> 'ΙΔΙΟΚΑΤΟΙΚΗΣΗ'
        """))
        _conn.commit()
except Exception:
    pass
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            UPDATE cm_cases
            SET program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
            WHERE (
                service_type ILIKE '%ανακαιν%'
                OR sheet_import_ref ILIKE '%ανακαιν%'
                OR id IN (SELECT case_id FROM cm_case_anakainizw)
            )
            AND (program_category IS NULL OR program_category <> 'ΑΝΑΚΑΙΝΙΖΩ')
        """))
        _conn.commit()
except Exception:
    pass

# Backfill portal_notified_at from notification_logs (authoritative source)
# Step 1: reset any guessed values — only keep what notification_logs can confirm
# Step 2: set from the earliest portal notification log entry per case
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            UPDATE cm_cases
            SET portal_notified_at = NULL
            WHERE portal_notified_at IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cm_notification_logs nl
                WHERE nl.case_id = cm_cases.id
                  AND nl.subject ILIKE 'Ενεργοποίηση Πύλης%'
                  AND nl.status = 'sent'
              )
        """))
        _conn.execute(_text("""
            UPDATE cm_cases
            SET portal_notified_at = sub.first_sent
            FROM (
                SELECT case_id, MIN(created_at) AS first_sent
                FROM cm_notification_logs
                WHERE subject ILIKE 'Ενεργοποίηση Πύλης%'
                  AND status = 'sent'
                GROUP BY case_id
            ) sub
            WHERE cm_cases.id = sub.case_id
              AND cm_cases.portal_notified_at IS NULL
        """))
        _conn.commit()
except Exception:
    pass

# Backfill status history: seed one entry per case that has no history yet
try:
    with engine.connect() as _conn:
        _result = _conn.execute(_text("""
            INSERT INTO cm_case_status_history (case_id, from_status, to_status, changed_at, changed_by)
            SELECT c.id, NULL, c.status, COALESCE(c.status_changed_at, c.created_at, NOW()), 'System (backfill)'
            FROM cm_cases c
            WHERE NOT EXISTS (
                SELECT 1 FROM cm_case_status_history h WHERE h.case_id = c.id
            )
            AND c.status IS NOT NULL
        """))
        _conn.commit()
        print(f"[migration] Backfilled status history for cases")
except Exception as _e:
    print(f"[migration] Status history backfill skipped: {_e}")

# Seed status descriptions for all three pipelines (once-off; only sets if currently empty)
import json as _json
_PIPELINE_DESCS = {
    "ΕΣΠΑ": {
        "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΕΣΠΑ έχει υποβληθεί. Αναμένουμε τα αποτελέσματα τα οποία θα ανακοινωθούν συνολικά για όλους υποψήφιους.",
        "ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ": "Προχωράμε στις διαδικασίες έναρξης επιχειρηματικής δραστηριότητας ή απόδοσης ΑΦΜ.",
        "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο Α' αίτημα.",
        "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή.",
        "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ ΠΡΟΣ ΠΕΛΑΤΗ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
        "ΠΡΟΣΚΟΜΙΣΗ ΕΚΚΡΕΜΟΤΗΤΩΝ": "Αναμένουμε την προσκόμιση των εγγράφων που ζητήθηκαν.",
        "ΥΠΟΒΟΛΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
        "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις.",
        "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα.",
        "ΕΓΚΡΙΣΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα εγκρίθηκε από τον φορέα.",
        "ΕΚΤΑΜΙΕΥΣΗ Α' ΑΙΤΗΜΑΤΟΣ": "Η επιχορήγηση του πρώτου αιτήματος βρίσκεται σε διαδικασία εκταμίευσης.",
        "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο Β' αίτημα.",
        "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή του Β' αιτήματος.",
        "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς για το Β' αίτημα. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
        "ΥΠΟΒΟΛΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το δεύτερο αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
        "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ Β' ΑΙΤΗΜΑΤΟΣ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις για το Β' αίτημα.",
        "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ Β' ΑΙΤΗΜΑΤΟΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα για το Β' αίτημα.",
        "ΕΓΚΡΙΣΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το δεύτερο αίτημα εγκρίθηκε από τον φορέα.",
        "ΕΚΤΑΜΙΕΥΣΗ Β' ΑΙΤΗΜΑΤΟΣ": "Η επιχορήγηση του δεύτερου αιτήματος βρίσκεται σε διαδικασία εκταμίευσης.",
        "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο τελικό αίτημα.",
        "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή του τελικού αιτήματος.",
        "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς για το τελικό αίτημα. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
        "ΥΠΟΒΟΛΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
        "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις για το τελικό αίτημα.",
        "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα για το τελικό αίτημα.",
        "ΕΓΚΡΙΣΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα εγκρίθηκε από τον φορέα.",
        "ΤΕΛΙΚΗ ΕΚΤΑΜΙΕΥΣΗ": "Η τελική εκταμίευση επιχορήγησης βρίσκεται σε εξέλιξη. Η διαδικασία ολοκληρώνεται σύντομα.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεσή σας έχει ολοκληρωθεί επιτυχώς. Συγχαρητήρια!",
        "ΤΡΟΠΟΠΟΙΗΣΗ": "Γίνεται επεξεργασία τροποποίησης της σύμβασης ή του φακέλου.",
        "ΕΝΣΤΑΣΗ": "Έχει κατατεθεί ένσταση σε απόφαση του φορέα. Αναμένουμε απάντηση.",
        "ΠΑΡΑΙΤΗΣΗ": "Η υπόθεση έχει κλείσει κατόπιν αιτήματος παραίτησης.",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή απάντηση από εσάς για να συνεχίσουμε.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή. Θα σας ενημερώσουμε για την επανεκκίνηση.",
    },
    "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ": {
        "ΠΛΗΡΩΜΗ 150€": "Έχει πραγματοποιηθεί η πληρωμή 150€+ΦΠΑ και έχει ανοιχτεί ο φάκελος.",
        "ΑΠΟΣΤΟΛΗ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ": "Προετοιμάζεται από σύμβουλο ώστε να αποσταλεί ερωτηματολόγιο αξιολόγησης.",
        "ΑΝΑΜΟΝΗ ΑΠΑΝΤΗΣΗΣ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ": "Αναμένουμε τη συμπλήρωση και επιστροφή του ερωτηματολογίου που σας στείλαμε. Συμπληρώστε το συντομότερο δυνατόν, έστω και πολύ συνοπτικά και κατ' εκτίμηση.",
        "ΣΥΝΤΑΞΗ BUSINESS PLAN": "Βρισκόμαστε στη σύνταξη του επιχειρηματικού σας σχεδίου (Business Plan) βάσει των στοιχείων που μας έχετε δώσει.",
        "ΑΝΑΜΟΝΗ ΥΠΟΓΡΑΦΗΣ BUSINESS PLAN": "Το Business Plan έχει ετοιμαστεί και αναμένει την υπογραφή σας. Κάντε ψηφιακή βεβαίωση εγγράφου από https://www.gov.gr/ipiresies/polites-kai-kathemerinoteta/psephiaka-eggrapha-gov-gr/psephiake-bebaiose-eggraphou",
        "ΥΠΟΓΡΑΦΗ BUSINESS PLAN ΟΛΟΚΛΗΡΩΘΗΚΕ": "Το επιχειρηματικό σχέδιο έχει υπογραφεί επιτυχώς. Προχωράμε στο επόμενο στάδιο.",
        "ΥΠΟΒΟΛΗ BUSINESS PLAN ΣΤΗΝ HDB": "Το Business Plan έχει υποβληθεί στην Ελληνική Αναπτυξιακή Τράπεζα (HDB) για αξιολόγηση.",
        "ΑΝΑΜΟΝΗ ΑΠΟΔΟΧΩΝ ΑΠΟ ΤΑΜΕΙΑ": "Αναμένουμε την απόφαση αποδοχής από τα 3 χρηματοδοτικά ταμεία για τον φάκελό σας. ΤΜΕΔΕ / AFI / MICROSMART. Οι απαντήσεις έρχονται σε 10 ημέρες ακριβώς.",
        "ΑΠΟΔΟΧΗ ΑΠΟ ΤΑΜΕΙΑ": "Ο φάκελός σας έχει γίνει αποδεκτός από ένα ή περισσότερα ταμεία. Συνεχίζουμε με τα επόμενα βήματα της διαδικασίας.",
        "ΠΛΗΡΩΜΗ 310€": "Αναμένεται η εξόφληση του ποσού των 250€+ΦΠΑ=310€ για να προχωρήσουμε στο επόμενο στάδιο της διαδικασίας.",
        "OPSKE / ESG": "Βρισκόμαστε στο στάδιο συμπλήρωσης των απαιτούμενων στοιχείων στις πλατφόρμες ΟΠΣΚΕ και κριτηρίων ESG.",
        "ΕΠΙΚΟΙΝΩΝΙΑ ΜΕ ΤΑΜΕΙΟ": "Το γραφείο μας βρίσκεται σε επικοινωνία με το χρηματοδοτικό ταμείο που έχουμε επιλέξει για τη λήψη του δανείου.",
        "ΣΥΛΛΟΓΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ & ΥΠΕΥΘΥΝΩΝ ΔΗΛΩΣΕΩΝ": "Συγκεντρώνουμε τα απαραίτητα δικαιολογητικά και υπεύθυνες δηλώσεις για την υποβολή. Ανάλογα με το ποιο ταμείο επιλέγουμε, διαφοροποιούνται τα ζητούμενα έγγραφα.",
        "ΑΝΑΜΟΝΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ ΑΠΟ ΠΕΛΑΤΗ": "Χρειαζόμαστε έγγραφα ή δικαιολογητικά από εσάς για να συνεχίσουμε. Παρακαλούμε αποστείλετε άμεσα τα στοιχεία ώστε να προχωρήσουμε.",
        "ΥΠΟΒΟΛΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ ΣΤΑ ΤΑΜΕΙΑ": "Ο φάκελος με όλα τα δικαιολογητικά έχει υποβληθεί στο χρηματοδοτικό ταμείο που έχουμε επιλέξει.",
        "ΥΠΟ ΑΞΙΟΛΟΓΗΣΗ": "Ο φάκελός σας βρίσκεται στην τελική αξιολόγηση από το επιλεχθέν ταμείο. Ελέγχεται ο Τειρεσίας καθώς και αν έχετε λάβει άλλο δάνειο ΕΑΤ ή ΤΕΠΙΧ.",
        "ΕΓΚΡΙΣΗ": "Αυτή είναι η οριστική και τελική έγκριση του δανείου. Πρέπει να υπογραφεί η σύμβαση του δανείου ηλεκτρονικά.",
        "ΕΚΤΑΜΙΕΥΣΗ": "Η εκταμίευση του δανείου βρίσκεται σε εξέλιξη. Το ποσό θα κατατεθεί σύντομα στον τραπεζικό σας λογαριασμό.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεσή σας έχει ολοκληρωθεί επιτυχώς. Σας ευχαριστούμε για τη συνεργασία!",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή πληροφορίες από εσάς.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή.",
        "ΑΠΟΡΡΙΨΗ": "Ο φάκελός σας δεν εγκρίθηκε από τα ταμεία. Το γραφείο μας θα σας ενημερώσει για τις επόμενες επιλογές.",
        "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί. Επικοινωνήστε μαζί μας για οποιαδήποτε διευκρίνιση.",
    },
    "ΔΥΠΑ": {
        "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΔΥΠΑ έχει υποβληθεί. Αναμένουμε τα αποτελέσματα τα οποία θα ανακοινωθούν συνολικά για όλους υποψήφιους.",
        "ΕΓΚΡΙΣΗ": "Η αίτησή σας εγκρίθηκε από τη ΔΥΠΑ! Προχωράμε στις διαδικασίες έναρξης της επιχείρησής σας.",
        "ΕΝΑΡΞΗ ΕΠΙΧΕΙΡΗΣΗΣ": "Βρισκόμαστε στη διαδικασία έναρξης της επιχειρηματικής σας δραστηριότητας.",
        "ΑΠΟΔΟΣΗ ΑΦΜ": "Προχωράμε στις διαδικασίες έναρξης επιχειρηματικής δραστηριότητας ή απόδοσης ΑΦΜ.",
        "ΤΡΟΠΟΠΟΙΗΣΗ ΕΔΡΑΣ": "Βρισκόμαστε στη διαδικασία τροποποίησης ή καταχώρισης της έδρας της επιχείρησής σας στο πληροφοριακό σύστημα OPSKE.",
        "ΑΝΑΜΟΝΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ Α' ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε δικαιολογητικά από εσάς για την υποβολή του Α' αιτήματος εκταμίευσης.",
        "ΥΠΟΒΟΛΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα εκταμίευσης (Α' Ορόσημο) έχει υποβληθεί στη ΔΥΠΑ/ΟΠΣΚΕ.",
        "ΕΠΙΤΟΠΙΟΣ ΕΛΕΓΧΟΣ Α' ΑΙΤΗΜΑΤΟΣ": "Έχει προγραμματιστεί επιτόπιος έλεγχος από εκπρόσωπο της ΔΥΠΑ για επαλήθευση της λειτουργίας της επιχείρησής σας.",
        "ΑΣΦΑΛΙΣΤΙΚΗ & ΦΟΡΟΛΟΓΙΚΗ ΕΝΗΜΕΡΟΤΗΤΑ Α' ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα πιστοποιητικά ασφαλιστικής και φορολογικής ενημερότητας που απαιτούνται για το Α' αίτημα.",
        "ΕΓΚΡΙΣΗ ΑΙΤΗΜΑΤΟΣ ΑΠΟ ΟΠΣΚΕ": "Το αίτημα εγκρίθηκε από το ΟΠΣΚΕ. Αναμένουμε την εκταμίευση στον λογαριασμό σας.",
        "ΑΠΟΔΟΧΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το Α' αίτημα έχει γίνει αποδεκτό. Η εκταμίευση βρίσκεται σε εξέλιξη.",
        "1η ΕΚΤΑΜΙΕΥΣΗ": "Η 1η εκταμίευση (Α' Ορόσημο) έχει πραγματοποιηθεί ή βρίσκεται σε διαδικασία κατάθεσης στον λογαριασμό σας.",
        "ΑΝΑΜΟΝΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε δικαιολογητικά από εσάς για την υποβολή του Β' αιτήματος εκταμίευσης.",
        "ΥΠΟΒΟΛΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το Β' αίτημα εκταμίευσης (Β' Ορόσημο) έχει υποβληθεί στη ΔΥΠΑ/ΟΠΣΚΕ.",
        "ΕΠΙΤΟΠΙΟΣ ΕΛΕΓΧΟΣ Β' ΑΙΤΗΜΑΤΟΣ": "Έχει προγραμματιστεί επιτόπιος έλεγχος για το Β' Ορόσημο.",
        "ΑΣΦΑΛΙΣΤΙΚΗ & ΦΟΡΟΛΟΓΙΚΗ ΕΝΗΜΕΡΟΤΗΤΑ Β' ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα πιστοποιητικά ενημερότητας για το Β' αίτημα.",
        "ΕΓΚΡΙΣΗ Β' ΑΙΤΗΜΑΤΟΣ ΑΠΟ ΟΠΣΚΕ": "Το Β' αίτημα εγκρίθηκε από τη ΔΥΠΑ στο ΟΠΣΚΕ.",
        "ΑΠΟΔΟΧΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το Β' αίτημα έχει γίνει αποδεκτό. Η 2η εκταμίευση βρίσκεται σε εξέλιξη.",
        "2η ΕΚΤΑΜΙΕΥΣΗ": "Η 2η εκταμίευση (Β' Ορόσημο) έχει πραγματοποιηθεί ή βρίσκεται σε διαδικασία κατάθεσης.",
        "ΑΝΑΜΟΝΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ Γ' ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε δικαιολογητικά για την υποβολή του τελικού Γ' αιτήματος.",
        "ΥΠΟΒΟΛΗ Γ' ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα (Γ' Ορόσημο) έχει υποβληθεί.",
        "ΕΠΙΤΟΠΙΟΣ ΕΛΕΓΧΟΣ Γ' ΑΙΤΗΜΑΤΟΣ": "Έχει προγραμματιστεί ο τελικός επιτόπιος έλεγχος για το Γ' Ορόσημο.",
        "ΑΣΦΑΛΙΣΤΙΚΗ & ΦΟΡΟΛΟΓΙΚΗ ΕΝΗΜΕΡΟΤΗΤΑ Γ' ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα πιστοποιητικά ενημερότητας για το τελικό αίτημα.",
        "ΕΓΚΡΙΣΗ Γ' ΑΙΤΗΜΑΤΟΣ ΑΠΟ ΟΠΣΚΕ": "Το τελικό αίτημα εγκρίθηκε από το ΟΠΣΚΕ.",
        "ΑΠΟΔΟΧΗ Γ' ΑΙΤΗΜΑΤΟΣ": "Το Γ' αίτημα έχει γίνει αποδεκτό. Βρισκόμαστε στο τελικό βήμα.",
        "3η / ΤΕΛΙΚΗ ΕΚΤΑΜΙΕΥΣΗ": "Η τελική εκταμίευση (Γ' Ορόσημο) πραγματοποιείται. Η υπόθεση ολοκληρώνεται σύντομα.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Και τα τρία ορόσημα ολοκληρώθηκαν επιτυχώς. Η επιχορήγησή σας από τη ΔΥΠΑ έχει καταβληθεί πλήρως. Συγχαρητήρια!",
        "ΕΝΣΤΑΣΗ": "Έχει κατατεθεί ένσταση σε απόφαση του φορέα. Αναμένουμε την εξέταση και απάντησή της.",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή έγγραφα από εσάς. Παρακαλούμε προσκομίστε τα το συντομότερο δυνατόν.",
        "ΕΚΚΡΕΜΟΤΗΤΑ ΑΠΟ ΟΠΣΚΕ": "Στο ΟΠΣΚΕ έχουν ζητηθεί συμπληρωματικά στοιχεία ή διευκρινίσεις. Εργαζόμαστε για την επίλυση.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή.",
        "ΑΠΟΡΡΙΨΗ": "Ο φάκελος δεν εγκρίθηκε. Το γραφείο μας θα σας ενημερώσει για τις επόμενες διαθέσιμες επιλογές.",
        "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί. Επικοινωνήστε μαζί μας για οποιαδήποτε διευκρίνιση.",
    },
}
try:
    with engine.connect() as _conn:
        for _prog, _descs in _PIPELINE_DESCS.items():
            _conn.execute(_text("""
                INSERT INTO cm_pipeline_configs (program_category, phases_json, extra_statuses_json, status_descriptions_json)
                VALUES (:prog, '[]', '[]', :descs)
                ON CONFLICT (program_category) DO UPDATE SET
                    status_descriptions_json = CASE
                        WHEN COALESCE(cm_pipeline_configs.status_descriptions_json, '{}') IN ('{}', '', 'null')
                        THEN EXCLUDED.status_descriptions_json
                        ELSE cm_pipeline_configs.status_descriptions_json
                    END
            """), {"prog": _prog, "descs": _json.dumps(_descs, ensure_ascii=False)})
        _conn.commit()
        print("[migration] Status descriptions seeded for ΕΣΠΑ, ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ, ΔΥΠΑ")
except Exception as _e:
    print(f"[migration] Status descriptions seed skipped: {_e}")

# Force-update ΕΣΠΑ descriptions (previous guard blocked it because row had existing data)
_ESPA_DESCS = {
    "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΕΣΠΑ έχει υποβληθεί. Αναμένουμε τα αποτελέσματα τα οποία θα ανακοινωθούν συνολικά για όλους υποψήφιους.",
    "ΕΝΑΡΞΗ / ΑΠΟΔΟΣΗ ΑΦΜ": "Προχωράμε στις διαδικασίες έναρξης επιχειρηματικής δραστηριότητας ή απόδοσης ΑΦΜ.",
    "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο Α' αίτημα.",
    "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή.",
    "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ ΠΡΟΣ ΠΕΛΑΤΗ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
    "ΠΡΟΣΚΟΜΙΣΗ ΕΚΚΡΕΜΟΤΗΤΩΝ": "Αναμένουμε την προσκόμιση των εγγράφων που ζητήθηκαν.",
    "ΥΠΟΒΟΛΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
    "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις.",
    "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα.",
    "ΕΓΚΡΙΣΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα εγκρίθηκε από τον φορέα.",
    "ΕΚΤΑΜΙΕΥΣΗ Α' ΑΙΤΗΜΑΤΟΣ": "Η επιχορήγηση του πρώτου αιτήματος βρίσκεται σε διαδικασία εκταμίευσης.",
    "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο Β' αίτημα.",
    "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή του Β' αιτήματος.",
    "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ Β' ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς για το Β' αίτημα. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
    "ΥΠΟΒΟΛΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το δεύτερο αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
    "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ Β' ΑΙΤΗΜΑΤΟΣ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις για το Β' αίτημα.",
    "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ Β' ΑΙΤΗΜΑΤΟΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα για το Β' αίτημα.",
    "ΕΓΚΡΙΣΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το δεύτερο αίτημα εγκρίθηκε από τον φορέα.",
    "ΕΚΤΑΜΙΕΥΣΗ Β' ΑΙΤΗΜΑΤΟΣ": "Η επιχορήγηση του δεύτερου αιτήματος βρίσκεται σε διαδικασία εκταμίευσης.",
    "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών που θα συμπεριληφθούν στο τελικό αίτημα.",
    "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών πριν την υποβολή του τελικού αιτήματος.",
    "ΛΙΣΤΑ ΕΚΚΡΕΜΟΤΗΤΩΝ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Χρειαζόμαστε επιπλέον έγγραφα ή στοιχεία από εσάς για το τελικό αίτημα. Παρακαλούμε ελέγξτε τις εκκρεμότητες.",
    "ΥΠΟΒΟΛΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα πιστοποίησης δαπανών έχει υποβληθεί στον φορέα.",
    "ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΠΟ ΑΝΑΠΤΥΞΙΑΚΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ο φορέας (Αναπτυξιακή) ζήτησε συμπληρωματικά στοιχεία ή διευκρινίσεις για το τελικό αίτημα.",
    "ΚΑΛΥΨΗ ΕΚΚΡΕΜΟΤΗΤΩΝ ΑΝΑΠΤΥΞΙΑΚΗΣ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Ετοιμάζουμε τις απαντήσεις στις εκκρεμότητες του φορέα για το τελικό αίτημα.",
    "ΕΓΚΡΙΣΗ ΤΕΛΙΚΟΥ ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα εγκρίθηκε από τον φορέα.",
    "ΤΕΛΙΚΗ ΕΚΤΑΜΙΕΥΣΗ": "Η τελική εκταμίευση επιχορήγησης βρίσκεται σε εξέλιξη. Η διαδικασία ολοκληρώνεται σύντομα.",
    "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεσή σας έχει ολοκληρωθεί επιτυχώς. Συγχαρητήρια!",
    "ΤΡΟΠΟΠΟΙΗΣΗ": "Γίνεται επεξεργασία τροποποίησης της σύμβασης ή του φακέλου.",
    "ΕΝΣΤΑΣΗ": "Έχει κατατεθεί ένσταση σε απόφαση του φορέα. Αναμένουμε απάντηση.",
    "ΠΑΡΑΙΤΗΣΗ": "Η υπόθεση έχει κλείσει κατόπιν αιτήματος παραίτησης.",
    "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή απάντηση από εσάς για να συνεχίσουμε.",
    "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή. Θα σας ενημερώσουμε για την επανεκκίνηση.",
}
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            UPDATE cm_pipeline_configs
            SET status_descriptions_json = :descs, updated_at = NOW()
            WHERE program_category = 'ΕΣΠΑ'
        """), {"descs": _json.dumps(_ESPA_DESCS, ensure_ascii=False)})
        _conn.commit()
        print("[migration] ΕΣΠΑ status descriptions force-updated")
except Exception as _e:
    print(f"[migration] ΕΣΠΑ force-update skipped: {_e}")

from pipelines import get_all_statuses_for_program as _get_statuses

_UNIQUE_MIKRO = set(_get_statuses('ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ')) - set(_get_statuses('ΔΥΠΑ')) - set(_get_statuses('ΕΣΠΑ'))
_UNIQUE_DYPA = set(_get_statuses('ΔΥΠΑ')) - set(_get_statuses('ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ')) - set(_get_statuses('ΕΣΠΑ'))

def _detect_prog(status, service_type):
    st = (service_type or '').upper()
    if 'ΜΙΚΡΟ' in st:
        return 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'
    if 'ΔΥΠΑ' in st or 'ΟΑΕΔ' in st:
        return 'ΔΥΠΑ'
    if 'ΑΝΑΚΑΙΝ' in st:
        return 'ΑΝΑΚΑΙΝΙΖΩ'
    if status in _UNIQUE_MIKRO:
        return 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'
    if status in _UNIQUE_DYPA:
        return 'ΔΥΠΑ'
    return 'ΕΣΠΑ'

with SessionLocal() as _db:
    from models_cases import CMCase as _CMCase
    _fixed = 0
    for _c in _db.query(_CMCase).all():
        if _c.status in _OSM:
            _c.status = _OSM[_c.status]
        _correct = _detect_prog(_c.status, _c.service_type)
        # Never override an explicitly-set non-ΕΣΠΑ category back to ΕΣΠΑ
        # (e.g. ΑΝΑΚΑΙΝΙΖΩ cases without the keyword in service_type)
        if _c.program_category and _c.program_category not in (None, 'ΕΣΠΑ') and _correct == 'ΕΣΠΑ':
            _correct = _c.program_category
        if _c.program_category != _correct:
            _c.program_category = _correct
            _fixed += 1
        if not _c.share_token:
            _c.share_token = str(uuid.uuid4())
            _fixed += 1
        # Activate ΑΝΑΚΑΙΝΙΖΩ cases that have a share_token and phone but portal_active=False
        # (covers duplicates that failed import due to unique constraint and got UUID via migration)
        if _c.program_category == 'ΑΝΑΚΑΙΝΙΖΩ' and _c.share_token and _c.phone and not _c.portal_active:
            _c.portal_active = True
            _fixed += 1
    if _fixed:
        _db.commit()
        print(f"[migration] Fixed program_category / backfilled share_token for {_fixed} cases")

# Fix duplicate share_tokens: keep the first (oldest) case's token, assign new UUIDs to the rest.
# Happens when multiple ΑΝΑΚΑΙΝΙΖΩ cases were imported with the same phone number before the
# duplicate-check was added to the Sheets importer.
with SessionLocal() as _db:
    from collections import defaultdict as _dd
    _by_token = _dd(list)
    for _c in _db.query(_CMCase).filter(_CMCase.share_token.isnot(None)).all():
        _by_token[_c.share_token].append(_c)
    _dedup_fixed = 0
    for _tok, _cases in _by_token.items():
        if len(_cases) <= 1:
            continue
        # Sort by id: keep the lowest (oldest) case's token; reassign the rest
        _cases.sort(key=lambda x: x.id)
        for _dup in _cases[1:]:
            _dup.share_token = str(uuid.uuid4())
            _dedup_fixed += 1
    if _dedup_fixed:
        _db.commit()
        print(f"[migration] Deduplicated share_tokens: assigned new UUIDs to {_dedup_fixed} cases")

# Rename "ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ" → "ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ" for ΑΝΑΚΑΙΝΙΖΩ
try:
    with engine.connect() as _conn:
        _r = _conn.execute(_text("""
            UPDATE cm_cases
            SET status = 'ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ'
            WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
              AND status = 'ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ'
        """))
        if _r.rowcount:
            print(f"[migration] Renamed status for {_r.rowcount} ΑΝΑΚΑΙΝΙΖΩ cases", flush=True)
        # Also update the stored pipeline JSON in cm_pipeline_configs
        _conn.execute(_text("""
            UPDATE cm_pipeline_configs
            SET phases_json = REPLACE(
                phases_json,
                'ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ',
                'ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ'
            )
            WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
        """))
        # Also update status history entries
        _conn.execute(_text("""
            UPDATE cm_case_status_history
            SET from_status = 'ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ'
            WHERE from_status = 'ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ'
        """))
        _conn.execute(_text("""
            UPDATE cm_case_status_history
            SET to_status = 'ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ'
            WHERE to_status = 'ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ'
        """))
        _conn.commit()
except Exception as _e:
    print(f"[migration] Status rename skipped: {_e}", flush=True)

# ONE-TIME RECOVERY: restore ΑΝΑΚΑΙΝΙΖΩ case statuses overwritten by sheet import.
# The import (2/6/26) silently reset all existing cases to the first pipeline status
# because it unconditionally overwrote status from the sheet column (which contained
# non-pipeline values). This restores each case to the last recorded status_history entry.
try:
    with engine.connect() as _conn:
        _r = _conn.execute(_text("""
            UPDATE cm_cases c
            SET status = h.to_status,
                status_changed_at = h.changed_at
            FROM (
                SELECT DISTINCT ON (case_id) case_id, to_status, changed_at
                FROM cm_case_status_history
                ORDER BY case_id, changed_at DESC
            ) h
            WHERE c.id = h.case_id
              AND c.program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
              AND c.status != h.to_status
        """))
        if _r.rowcount:
            _conn.commit()
            print(f"[migration] Restored status for {_r.rowcount} ΑΝΑΚΑΙΝΙΖΩ cases from history", flush=True)
except Exception as _e:
    print(f"[migration] ΑΝΑΚΑΙΝΙΖΩ status restore skipped: {_e}", flush=True)

# Fix duplicate statuses across phases in ΑΝΑΚΑΙΝΙΖΩ pipeline config
try:
    with engine.connect() as _conn:
        _row = _conn.execute(_text(
            "SELECT phases_json FROM cm_pipeline_configs WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'"
        )).fetchone()
        if _row and _row[0]:
            _phases = _json.loads(_row[0])
            _seen = set()
            _changed = False
            for _ph in _phases:
                _before = list(_ph.get("statuses", []))
                _ph["statuses"] = [s for s in _before if s not in _seen]
                _seen.update(_ph["statuses"])
                if _ph["statuses"] != _before:
                    _changed = True
            if _changed:
                _conn.execute(_text(
                    "UPDATE cm_pipeline_configs SET phases_json = :pj WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'"
                ), {"pj": _json.dumps(_phases, ensure_ascii=False)})
                _conn.commit()
                print("[migration] Removed duplicate statuses from ΑΝΑΚΑΙΝΙΖΩ phases_json", flush=True)
except Exception as _e:
    print(f"[migration] ΑΝΑΚΑΙΝΙΖΩ dedup phases skipped: {_e}", flush=True)

# Force-update ΑΝΑΚΑΙΝΙΖΩ status descriptions
_ANAKAINIZW_DESCS = {
    "ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ": "Η αίτηση ενδιαφέροντος σας έχει ληφθεί! Για να ξεκινήσει η διαδικασία, παρακαλούμε συνδεθείτε στην Πύλη Πελάτη και συμπληρώστε τα απαιτούμενα στοιχεία.",
    "ΣΥΜΠΛΗΡΩΣΗ ΣΤΟΙΧΕΙΩΝ ΝΟΙΚΟΚΥΡΙΟΥ & ΕΙΔΙΚΩΝ ΣΥΝΘΗΚΩΝ": "Παρακαλούμε συνδεθείτε στην Πύλη Πελάτη και συμπληρώστε τη φόρμα με τα στοιχεία του νοικοκυριού σας (εισόδημα, σύνθεση) και τυχόν ειδικές συνθήκες (ΑμΕΑ, τρίτεκνοι κ.λπ.). Τα στοιχεία αυτά είναι απαραίτητα για τον προκαταρκτικό έλεγχο επιλεξιμότητάς σας.",
    "ΑΠΟΣΤΟΛΗ ΕΓΓΡΑΦΩΝ ΑΚΙΝΗΤΟΥ": "Αναμένουμε τα απαραίτητα έγγραφα του ακινήτου σας (τίτλοι ιδιοκτησίας, Ε9, ΕΝΦΙΑ κ.λπ.). Μπορείτε να τα αποστείλετε εύκολα μέσω της Πύλης Πελάτη.",
    "ΠΛΗΡΩΜΗ 49€+ΦΠΑ": "Για να προχωρήσει ο έλεγχος εγγράφων και επιλεξιμότητας από τον σύμβουλό σας, απαιτείται η καταβολή 49€+ΦΠΑ. Τα στοιχεία πληρωμής (iban) εμφανίζονται στο portal σας.",
    "ΕΛΕΓΧΟΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ ΑΠΟ ΣΥΜΒΟΥΛΟ": "Ο σύμβουλός σας ελέγχει τα στοιχεία και τα έγγραφά σας για να επιβεβαιώσει ότι πληρείτε τα κριτήρια επιλεξιμότητας του προγράμματος Ανακαινίζω. Δεν απαιτείται καμία ενέργεια από εσάς αυτή τη στιγμή.",
    "ΟΛΟΚΛΗΡΩΣΗ ΕΛΕΓΧΟΥ ΑΠΟ ΣΥΜΒΟΥΛΟ": "Ο προκαταρκτικός έλεγχος επιλεξιμότητας ολοκληρώθηκε. Σύντομα θα ενημερωθείτε από τον σύμβουλό σας για το αποτέλεσμα και τα επόμενα βήματα της αίτησής σας.",
    "ΕΓΚΡΙΣΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας εγκρίθηκε από το πρόγραμμα Ανακαινίζω! Προχωράμε στη φάση υλοποίησης των εργασιών.",
    "ΕΝΑΡΞΗ ΕΡΓΑΣΙΩΝ ΑΝΑΚΑΙΝΙΣΗΣ": "Οι εργασίες ανακαίνισης έχουν ξεκινήσει. Φροντίστε να διατηρείτε όλα τα τιμολόγια και παραστατικά δαπανών.",
    "ΣΥΓΚΕΝΤΡΩΣΗ ΤΙΜΟΛΟΓΙΩΝ": "Συγκεντρώνουμε τα τιμολόγια και παραστατικά δαπανών για τον τελικό φάκελο ολοκλήρωσης.",
    "ΕΛΕΓΧΟΣ ΤΙΜΟΛΟΓΙΩΝ": "Ελέγχουμε την πληρότητα και εγκυρότητα των παραστατικών δαπανών πριν την υποβολή του φακέλου.",
    "ΤΡΑΠΕΖΙΚΕΣ ΠΛΗΡΩΜΕΣ": "Γίνεται επαλήθευση των τραπεζικών πληρωμών προς τους εργολάβους/προμηθευτές, όπως απαιτεί το πρόγραμμα.",
    "ΕΚΚΡΕΜΟΤΗΤΕΣ ΥΛΟΠΟΙΗΣΗΣ": "Υπάρχουν εκκρεμότητες στη φάση υλοποίησης που χρειάζονται τη συνδρομή σας. Ο σύμβουλός σας θα σας ενημερώσει.",
    "ΠΡΟΣΚΟΜΙΣΗ ΕΚΚΡΕΜΟΤΗΤΩΝ": "Αναμένουμε την προσκόμιση των εγγράφων ή στοιχείων που ζητήθηκαν για να ολοκληρωθεί ο φάκελος.",
    "ΟΛΟΚΛΗΡΩΣΗ ΕΡΓΑΣΙΩΝ": "Οι εργασίες ανακαίνισης έχουν ολοκληρωθεί. Προχωράμε στην έκδοση Πιστοποιητικού Ενεργειακής Απόδοσης (ΠΕΑ Β').",
    "ΕΚΔΟΣΗ ΠΕΑ Β'": "Ο ενεργειακός επιθεωρητής πραγματοποιεί τον τελικό ενεργειακό έλεγχο για την έκδοση του ΠΕΑ μετά την ανακαίνιση.",
    "ΥΠΟΒΟΛΗ ΦΑΚΕΛΟΥ ΟΛΟΚΛΗΡΩΣΗΣ": "Ο πλήρης φάκελος ολοκλήρωσης (τιμολόγια, ΠΕΑ, δηλώσεις) έχει υποβληθεί στο σύστημα για αξιολόγηση.",
    "ΤΕΛΙΚΗ ΕΓΚΡΙΣΗ": "Ο φάκελος ολοκλήρωσης εγκρίθηκε από τον φορέα. Αναμένουμε την εκταμίευση της επιδότησης.",
    "ΕΚΤΑΜΙΕΥΣΗ ΕΠΙΔΟΤΗΣΗΣ": "Η επιδότηση βρίσκεται σε διαδικασία εκταμίευσης. Το ποσό θα κατατεθεί σύντομα στον τραπεζικό σας λογαριασμό.",
    "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεσή σας έχει ολοκληρωθεί επιτυχώς και η επιδότηση έχει καταβληθεί. Συγχαρητήρια για την ανακαίνισή σας!",
    "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή έγγραφα από εσάς. Παρακαλούμε προσκομίστε τα το συντομότερο δυνατόν.",
    "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή. Θα σας ενημερώσουμε για την επανεκκίνηση.",
    "ΑΠΟΡΡΙΨΗ": "Ο φάκελος δεν εγκρίθηκε από το πρόγραμμα. Ο σύμβουλός σας θα σας ενημερώσει για τις επόμενες διαθέσιμες επιλογές.",
    "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί. Επικοινωνήστε μαζί μας για οποιαδήποτε διευκρίνιση.",
}
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            UPDATE cm_pipeline_configs
            SET status_descriptions_json = :descs, updated_at = NOW()
            WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
        """), {"descs": _json.dumps(_ANAKAINIZW_DESCS, ensure_ascii=False)})
        _conn.commit()
        print("[migration] ΑΝΑΚΑΙΝΙΖΩ status descriptions force-updated", flush=True)
except Exception as _e:
    print(f"[migration] ΑΝΑΚΑΙΝΙΖΩ descriptions update skipped: {_e}", flush=True)

# Import new models so create_all creates their tables
from models_cases import CMNotificationTemplate, CMStatusSLA, CMCaseModification, CMPortalFile, CMPaymentLog

# Seed notification templates (only if table is empty)
_DEFAULT_TEMPLATES = [
    {"key": "deadline_reminder", "label": "Υπενθύμιση Προθεσμίας",
     "subject": "Υπενθύμιση Προθεσμίας Έργου - {client_name}",
     "content": "Αγαπητέ/ή {client_name},\n\nΣας υπενθυμίζουμε ότι η προθεσμία ολοκλήρωσης του έργου σας πλησιάζει ({deadline}).\n\nΠαρακαλούμε επικοινωνήστε μαζί μας για τα επόμενα βήματα.\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "both"},
    {"key": "payment_reminder", "label": "Υπενθύμιση Πληρωμής",
     "subject": "Υπενθύμιση Εκκρεμούς Οφειλής - {client_name}",
     "content": "Αγαπητέ/ή {client_name},\n\nΣας υπενθυμίζουμε ότι υπάρχει εκκρεμής οφειλή για την υπηρεσία {service_type}.\n\nΠαρακαλούμε επικοινωνήστε μαζί μας για τη διευθέτηση.\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "both"},
    {"key": "documents_needed", "label": "Αίτημα Εγγράφων",
     "subject": "Απαιτούμενα Έγγραφα - {client_name}",
     "content": "Αγαπητέ/ή {client_name},\n\nΓια την υπόθεσή σας ({service_type}) απαιτείται η προσκόμιση εγγράφων.\n\nΠαρακαλούμε επικοινωνήστε μαζί μας το συντομότερο δυνατό.\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "both"},
    {"key": "status_update", "label": "Ενημέρωση Κατάστασης",
     "subject": "Ενημέρωση για την Υπόθεσή σας - {client_name}",
     "content": "Αγαπητέ/ή {client_name},\n\nΘέλουμε να σας ενημερώσουμε για την πρόοδο της υπόθεσής σας.\n\nΤρέχουσα κατάσταση: {status}\n\nΓια οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας.\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "both"},
    {"key": "google_review", "label": "Αίτημα Google Review",
     "subject": "Η γνώμη σας μετράει! - iMentor Consulting",
     "content": "Αγαπητέ/ή {client_name},\n\nΕυχαριστούμε για την εμπιστοσύνη σας στην iMentor Consulting!\n\nΘα μας βοηθούσε πολύ αν αφήνατε μια κριτική στο Google:\nhttps://g.page/r/YOUR_GOOGLE_REVIEW_LINK\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "email"},
]
# Re-create tables for new models
try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    print(f"[startup] second create_all failed: {_e}")
try:
    with SessionLocal() as _db:
        if _db.query(CMNotificationTemplate).count() == 0:
            for _t in _DEFAULT_TEMPLATES:
                _db.add(CMNotificationTemplate(**_t))
            _db.commit()
except Exception as _e:
    print(f"[startup] template seed failed: {_e}")

# Remove old default templates; add pending items template
_OLD_TEMPLATE_KEYS = {"deadline_reminder", "payment_reminder", "documents_needed", "status_update", "google_review"}
_PENDING_ITEMS_TEMPLATE = {
    "key": "pending_items_reminder",
    "label": "Υπενθύμιση Εκκρεμοτήτων",
    "subject": "Απαιτούμενα στοιχεία για την υπόθεσή σας - {client_name}",
    "content": (
        "Αγαπητέ/ή {client_name},\n\n"
        "Για την προχώρηση της υπόθεσής σας ({service_type}) "
        "χρειαζόμαστε τα παρακάτω:\n\n"
        "• \n• \n• \n\n"
        "Παρακαλούμε αποστείλετε τα παραπάνω το συντομότερο δυνατό.\n\n"
        "Με εκτίμηση,\niMentor Consulting"
    ),
    "notification_type": "both",
}
try:
    with SessionLocal() as _db:
        for _key in _OLD_TEMPLATE_KEYS:
            _t = _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == _key).first()
            if _t:
                _db.delete(_t)
        if not _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == "pending_items_reminder").first():
            _db.add(CMNotificationTemplate(**_PENDING_ITEMS_TEMPLATE))
        _db.commit()
except Exception as _e:
    print(f"[startup] old template cleanup failed: {_e}")

# Seed ΑΝΑΚΑΙΝΙΖΩ portal activation template (upsert — updates content if already exists)
_ANA_PORTAL_TEMPLATE = {
    "key": "anakainizw_portal_activation",
    "label": "Ενεργοποίηση Πύλης — Ανακαινίζω",
    "subject": "Η Πύλη Πελάτη σας είναι έτοιμη — {client_name}",
    "content": (
        "Αγαπητέ/ή {client_name},\n\n"
        "Η iMentor Consulting ενεργοποίησε για εσάς την Πύλη Πελάτη για το πρόγραμμα Ανακαινίζω.\n\n"
        "🔗 {portal_url}\n\n"
        "Για είσοδο χρειάζεστε μόνο το κινητό τηλέφωνό σας (το ίδιο που μας έχετε δηλώσει).\n\n"
        "Τι χρειάζεται να κάνετε άμεσα:\n"
        "📝 Συμπληρώστε / επιβεβαιώστε τα στοιχεία του ακινήτου και του νοικοκυριού σας\n"
        "📎 Ανεβάστε τα έγγραφα που σας ζητάμε\n\n"
        "Επίσης μέσα από την πύλη μπορείτε να:\n"
        "✅ Παρακολουθείτε σε πραγματικό χρόνο την πορεία της υπόθεσής σας\n"
        "🔍 Δείτε τα αποτελέσματα του ελέγχου επιλεξιμότητάς σας\n"
        "💬 Επικοινωνήσετε με τον σύμβουλό σας\n\n"
        "Για οποιαδήποτε απορία επικοινωνήστε μαζί μας:\n"
        "📞 2810 363007\n"
        "🌐 www.i-mentor.gr\n\n"
        "Η ομάδα iMentor"
    ),
    "notification_type": "both",
}
try:
    with SessionLocal() as _db:
        _ana_t = _db.query(CMNotificationTemplate).filter(
            CMNotificationTemplate.key == "anakainizw_portal_activation"
        ).first()
        if _ana_t:
            _ana_t.label = _ANA_PORTAL_TEMPLATE["label"]
            _ana_t.subject = _ANA_PORTAL_TEMPLATE["subject"]
            _ana_t.content = _ANA_PORTAL_TEMPLATE["content"]
            _ana_t.notification_type = _ANA_PORTAL_TEMPLATE["notification_type"]
        else:
            _db.add(CMNotificationTemplate(**_ANA_PORTAL_TEMPLATE))
        _db.commit()
except Exception as _e:
    print(f"[startup] anakainizw template seed failed: {_e}")

# Seed default admin user
from auth_cases import seed_admin
try:
    with SessionLocal() as _db:
        seed_admin(_db)
except Exception as _e:
    print(f"[startup] seed_admin failed: {_e}")



import pytz as _pytz
from apscheduler.schedulers.background import BackgroundScheduler as _BGScheduler

_athens_tz = _pytz.timezone("Europe/Athens")


def _run_scheduled_refresh():
    from routes.cm_finance_sync import _do_sync_from_finance, _last_sync
    import routes.cm_finance_sync as _finance_mod
    db = SessionLocal()
    try:
        result = _do_sync_from_finance(db)
        _finance_mod._last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": result["imported"],
            "updated_paid": result["updated_paid"],
            "total_records": result["total_records"],
            "error": None,
        })
        print(f"[scheduler] Finance sync OK — imported={result['imported']}, updated_paid={result['updated_paid']}, total={result['total_records']}")
    except Exception as e:
        _finance_mod._last_sync.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": None,
            "updated_paid": None,
            "error": str(e),
        })
        print(f"[scheduler] Finance sync ERROR: {e}")
    finally:
        db.close()


from datetime import datetime

def _run_agent_sla_digest():
    """Send each agent a daily digest of their SLA-overdue cases."""
    from routes.cm_notifications import _send_email
    from models_cases import CMCase as _CMCase, CMStatusSLA as _CMSLA, CMUser as _CMUser
    from datetime import datetime as _dt2
    db = SessionLocal()
    try:
        sla_map = {s.status: s.sla_days for s in db.query(_CMSLA).all()}
        if not sla_map:
            return
        now = _dt2.utcnow()
        from pipelines import TERMINAL_STATUSES as _TERM
        active_cases = db.query(_CMCase).filter(~_CMCase.status.in_(list(_TERM))).all()
        agent_overdue: dict[int, list] = {}
        for c in active_cases:
            if not c.status_changed_at or c.status not in sla_map:
                continue
            age = (now - c.status_changed_at).days
            if age > sla_map[c.status] and c.assigned_agent_id:
                agent_overdue.setdefault(c.assigned_agent_id, []).append((c, age - sla_map[c.status]))
        for agent_id, items in agent_overdue.items():
            agent = db.query(_CMUser).filter(_CMUser.id == agent_id).first()
            if not agent or not agent.email:
                continue
            lines = "\n".join(
                f"• {c.client_name} — {c.status} (+{days} ημ. εκτός SLA)"
                for c, days in sorted(items, key=lambda x: -x[1])
            )
            body = (
                f"Καλημέρα {agent.full_name},\n\n"
                f"Οι παρακάτω υποθέσεις σου έχουν υπερβεί το SLA:\n\n{lines}\n\n"
                f"Παρακαλώ ενημέρωσε ή προχώρα σε επόμενο στάδιο.\n\nΜε εκτίμηση,\niMentor Consulting"
            )
            _send_email(agent.email, "Ημερήσια Αναφορά SLA — iMentor Consulting", body)
    except Exception as e:
        print(f"[scheduler] SLA digest ERROR: {e}")
    finally:
        db.close()


def _scheduled_backup():
    from routes.cm_backup import run_db_backup
    _db = SessionLocal()
    try:
        run_db_backup(_db, trigger="auto")
    except Exception as e:
        print(f"[Backup] Scheduled backup failed: {e}")
    finally:
        _db.close()


def _run_leads_sheet_sync():
    """Daily import of new leads from each program's Google Sheet."""
    from routes.cm_leads_sync import _do_lead_sync
    db = SessionLocal()
    try:
        result = _do_lead_sync(db, dry_run=False, auto_ermis=True)
        print(f"[scheduler] Leads sheet sync OK — imported={result['imported']} auto_ermis={result.get('auto_ermis_started')}")
    except Exception as e:
        print(f"[scheduler] Leads sheet sync ERROR: {e}")
    finally:
        db.close()


def _run_lead_reminder_digest():
    """Send each agent a daily Viber summary of leads whose next call is due/overdue."""
    from routes.cm_notifications import _send_viber
    from models_cases import CMLead as _CMLead, CMUser as _CMUser
    from datetime import date as _date
    db = SessionLocal()
    try:
        today = _date.today()
        due = db.query(_CMLead).filter(
            _CMLead.next_call_date != None,  # noqa: E711
            _CMLead.next_call_date <= today,
            ~_CMLead.status.in_(["DEAL", "CANCEL"]),
        ).all()
        by_agent: dict = {}
        for l in due:
            if l.assigned_agent_id:
                by_agent.setdefault(l.assigned_agent_id, []).append(l)
        for agent_id, items in by_agent.items():
            agent = db.query(_CMUser).filter(_CMUser.id == agent_id).first()
            if not agent or not agent.phone:
                continue
            lines = "\n".join(
                f"• {l.name or '—'} ({l.phone or 'χωρίς τηλ.'}) — {l.next_call_date.isoformat()}"
                for l in sorted(items, key=lambda x: x.next_call_date)
            )
            msg = f"Καλημέρα {agent.full_name},\nLeads για κλήση σήμερα/εκπρόθεσμα ({len(items)}):\n{lines}"
            _send_viber(agent.phone, msg, agent.full_name)
    except Exception as e:
        print(f"[scheduler] Lead reminder digest ERROR: {e}")
    finally:
        db.close()


_scheduler = _BGScheduler(timezone=_athens_tz)
_scheduler.add_job(_run_scheduled_refresh, "cron", hour=12, minute=0, id="refresh_12")
_scheduler.add_job(_run_scheduled_refresh, "cron", hour=22, minute=0, id="refresh_22")
_scheduler.add_job(_run_agent_sla_digest, "cron", hour=9, minute=0, id="sla_digest_09")
_scheduler.add_job(_run_leads_sheet_sync, "cron", hour=7, minute=0, id="leads_sync_07")
_scheduler.add_job(_run_lead_reminder_digest, "cron", hour=8, minute=30, id="lead_reminders")
_backup_hour = int(os.getenv("BACKUP_SCHEDULE_HOUR", "2"))
_scheduler.add_job(_scheduled_backup, "cron", hour=_backup_hour, minute=0, id="drive_backup")
_scheduler.start()

app = FastAPI(
    title="iMentor Consulting - Case Management",
    description="Σύστημα Διαχείρισης Υποθέσεων iMentor Consulting",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cm_auth_router)
app.include_router(cm_users_router)
app.include_router(cases_router)
app.include_router(cm_dashboard_router)
app.include_router(cm_sheets_router)
app.include_router(cm_notifications_router)
app.include_router(cm_admin_router)
app.include_router(cm_pending_items_router)
app.include_router(cm_portal_router)
app.include_router(cm_pipeline_router)
app.include_router(cm_worklists_router)
app.include_router(cm_analytics_router)
app.include_router(cm_modifications_router)
app.include_router(cm_portal_files_router)
app.include_router(cm_revenue_router)
app.include_router(cm_backup_router)
app.include_router(cm_anakainizw_router)
app.include_router(cm_finance_sync_router)
app.include_router(finance_api_router)
app.include_router(cm_portal_integration_router)
app.include_router(cm_leads_router)
app.include_router(cm_leads_sync_router)
app.include_router(cm_leads_ermis_router)


try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_import_blocklist (
                id SERIAL PRIMARY KEY,
                sheet_import_ref TEXT NOT NULL UNIQUE,
                program_category VARCHAR(50),
                blocked_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_import_blocklist create skipped: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_portal_assignments (
                id SERIAL PRIMARY KEY,
                case_number INTEGER NOT NULL,
                afm VARCHAR(20),
                onomasia VARCHAR(200),
                accountant_office VARCHAR(200),
                case_type VARCHAR(200),
                description TEXT,
                priority VARCHAR(50),
                program_title VARCHAR(200),
                status VARCHAR(20) DEFAULT 'pending',
                cm_case_id INTEGER REFERENCES cm_cases(id),
                created_at TIMESTAMP DEFAULT NOW(),
                resolved_at TIMESTAMP
            )
        """))
        _conn.execute(_text("ALTER TABLE cm_portal_assignments ADD COLUMN IF NOT EXISTS phone VARCHAR(50)"))
        _conn.execute(_text("ALTER TABLE cm_portal_assignments ADD COLUMN IF NOT EXISTS email VARCHAR(200)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_portal_assignments create skipped: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_portal_assignment_requests (
                id SERIAL PRIMARY KEY,
                email VARCHAR(200) NOT NULL,
                program VARCHAR(100) NOT NULL,
                note TEXT,
                requested_by VARCHAR(100),
                status VARCHAR(20) DEFAULT 'sent',
                portal_response TEXT,
                case_number INTEGER,
                cm_assignment_id INTEGER REFERENCES cm_portal_assignments(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_portal_assignment_requests create skipped: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_business_profiles (
                id SERIAL PRIMARY KEY,
                afm VARCHAR(20) NOT NULL UNIQUE,
                onomasia VARCHAR(200),
                commercial_title VARCHAR(200),
                legal_status_descr VARCHAR(200),
                regdate DATE,
                doy VARCHAR(50),
                doy_descr VARCHAR(200),
                postal_address VARCHAR(200),
                postal_address_no VARCHAR(20),
                postal_zip_code VARCHAR(20),
                postal_area_description VARCHAR(200),
                perifereia VARCHAR(100),
                klados VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_business_activities (
                id SERIAL PRIMARY KEY,
                business_id INTEGER NOT NULL REFERENCES cm_business_profiles(id) ON DELETE CASCADE,
                firm_act_code VARCHAR(20),
                firm_act_descr VARCHAR(300),
                firm_act_kind VARCHAR(50)
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_business_activities_business_id ON cm_business_activities (business_id)"))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_business_matched_programs (
                id SERIAL PRIMARY KEY,
                business_id INTEGER NOT NULL REFERENCES cm_business_profiles(id) ON DELETE CASCADE,
                title VARCHAR(300),
                status VARCHAR(50)
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_business_matched_programs_business_id ON cm_business_matched_programs (business_id)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_business_profiles create skipped: {_e}", flush=True)


# ── Leads tables ────────────────────────────────────────────────────────────
try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_lead_sheet_configs (
                id SERIAL PRIMARY KEY,
                program VARCHAR(100) NOT NULL UNIQUE,
                spreadsheet_id VARCHAR(200),
                sheet_tab VARCHAR(100),
                header_row INTEGER DEFAULT 1,
                column_map JSON,
                program_field_map JSON,
                enabled BOOLEAN DEFAULT TRUE,
                last_sync_at TIMESTAMP,
                last_row_num INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_leads (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200),
                phone VARCHAR(50),
                phone2 VARCHAR(50),
                email VARCHAR(200),
                afm VARCHAR(20),
                program VARCHAR(100),
                service_type VARCHAR(150),
                total_amount DOUBLE PRECISION DEFAULT 0,
                status VARCHAR(30) DEFAULT 'NEW LEAD',
                assigned_agent_id INTEGER REFERENCES cm_users(id),
                source VARCHAR(200),
                notes TEXT,
                next_call_date DATE,
                linked_case_id INTEGER REFERENCES cm_cases(id),
                ermis_token VARCHAR(100),
                ermis_chat_url VARCHAR(500),
                ermis_status VARCHAR(30),
                ermis_transcript TEXT,
                ermis_started_at TIMESTAMP,
                ermis_completed_at TIMESTAMP,
                sheet_config_id INTEGER REFERENCES cm_lead_sheet_configs(id),
                sheet_row_num INTEGER,
                sheet_import_ref VARCHAR(200),
                program_fields JSON,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_leads_afm ON cm_leads (afm)"))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_leads_status ON cm_leads (status)"))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_leads_ermis_token ON cm_leads (ermis_token)"))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_leads_sheet_import_ref ON cm_leads (sheet_import_ref)"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS assigned_name VARCHAR(150)"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS ermis_error VARCHAR(500)"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS portal_case_number INTEGER"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS portal_case_link VARCHAR(500)"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS program_title VARCHAR(300)"))
        _conn.execute(_text("ALTER TABLE cm_portal_assignments ADD COLUMN IF NOT EXISTS cm_lead_id INTEGER"))
        _conn.execute(_text("ALTER TABLE cm_portal_assignments ADD COLUMN IF NOT EXISTS ermis_completed BOOLEAN DEFAULT FALSE"))
        _conn.execute(_text("ALTER TABLE cm_portal_assignments ADD COLUMN IF NOT EXISTS program_exact_title VARCHAR(300)"))
        # Backfill: pad existing 8-digit ΑΦΜ to 9 with a leading zero
        _conn.execute(_text("UPDATE cm_leads SET afm = '0' || afm WHERE afm ~ '^[0-9]{8}$'"))
        # Backfill: fix the common yahoo.fr → yahoo.gr email typo
        _conn.execute(_text("UPDATE cm_leads SET email = regexp_replace(email, '@yahoo\\.fr$', '@yahoo.gr', 'i') WHERE email ~* '@yahoo\\.fr$'"))
        # Backfill: extract program_title from notes for LOGISTIS leads that have none.
        # LOGISTIS description format: "Ανάθεση … — PROGRAM_TITLE" (em-dash, en-dash, or spaced hyphen)
        _conn.execute(_text(r"""
            UPDATE cm_leads
            SET program_title = TRIM(REGEXP_REPLACE(notes, '^.*?[—– -]\s*', '', 'i'))
            WHERE program_title IS NULL
              AND source ILIKE 'LOGISTIS%'
              AND notes ~ '[—– -]'
              AND LENGTH(TRIM(REGEXP_REPLACE(notes, '^.*?[—– -]\s*', '', 'i'))) > 5
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_lead_comments (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER NOT NULL REFERENCES cm_leads(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES cm_users(id),
                content TEXT NOT NULL,
                author_name VARCHAR(100),
                edited BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_lead_comments_lead_id ON cm_lead_comments (lead_id)"))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_lead_notification_logs (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER REFERENCES cm_leads(id) ON DELETE CASCADE,
                notification_type VARCHAR(50),
                recipient_name VARCHAR(200),
                recipient_contact VARCHAR(200),
                subject VARCHAR(300),
                content TEXT,
                status VARCHAR(30) DEFAULT 'sent',
                sent_by VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_lead_notification_logs_lead_id ON cm_lead_notification_logs (lead_id)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_leads create skipped: {_e}", flush=True)


@app.on_event("shutdown")
def _shutdown_scheduler():
    _scheduler.shutdown(wait=False)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Serve built React frontend (SPA) ──────────────────────────────────────────
_static_dir = os.path.join(os.path.dirname(__file__), "static")
_index_html = os.path.join(_static_dir, "index.html")

if os.path.isfile(_index_html):
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = os.path.join(_static_dir, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(
            _index_html,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
else:
    @app.get("/")
    def root():
        return {"message": "iMentor Consulting - Case Management API v1.0 (frontend not built yet)"}
