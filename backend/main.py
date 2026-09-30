import os
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from models_cases import CMUser, CMCase, CMTask, CMPayment, CMMessage, CMDocument, CMNotificationLog, CMBudgetCategory, CMPendingItemTemplate, CMCasePendingItem, CMPipelineConfig, CMCaseStatusHistory, CMCaseDypaHiring

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
from routes.cm_portal_files import router as cm_portal_files_router
from routes.cm_revenue import router as cm_revenue_router
from routes.cm_backup import router as cm_backup_router
from models_cases import CMBackupLog
from routes.cm_anakainizw import router as cm_anakainizw_router
from routes.cm_finance_sync import router as cm_finance_sync_router
from routes.cm_portal_integration import router as cm_portal_integration_router
from routes.finance_api import router as finance_api_router, router_legacy as finance_api_legacy_router
from routes.finance_payroll_targets import router as finance_payroll_targets_router
from routes.finance_payments import router as finance_payments_router
from routes.cm_leads import router as cm_leads_router
from routes.cm_leads_sync import router as cm_leads_sync_router
from routes.cm_leads_ermis import router as cm_leads_ermis_router
from routes.cm_dypa_hiring import router as cm_dypa_hiring_router
from routes.cm_webhook import router_public as cm_webhook_public_router, router_admin as cm_webhook_admin_router

load_dotenv()

import time as _time
from sqlalchemy import text as _text_ping

def _wait_for_db(max_attempts: int = 30, delay: float = 2.0) -> bool:
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

try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    print(f"[startup] create_all failed (DB may still be recovering): {_e}")

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
            CREATE TABLE IF NOT EXISTS cm_case_dypa_hiring (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES cm_cases(id) ON DELETE CASCADE UNIQUE NOT NULL,
                program_duration_months INTEGER DEFAULT 12,
                hiring_date DATE,
                requests_submitted INTEGER DEFAULT 0,
                periods_paid INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
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
        _conn.execute(_text("UPDATE cm_cases SET portal_visit_count = 0 WHERE portal_last_visit_at IS NULL"))
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

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_backup_logs ADD COLUMN IF NOT EXISTS json_data TEXT"))
        _conn.execute(_text("ALTER TABLE cm_backup_logs ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
        _conn.commit()
except Exception:
    pass

try:
    import re as _re_bf
    with engine.connect() as _conn:
        _rows = _conn.execute(_text("""
            SELECT l.id,
                   COALESCE(l.notes, '') || ' ' ||
                   COALESCE((SELECT string_agg(content, ' ') FROM cm_lead_comments WHERE lead_id = l.id), '') AS all_text
            FROM cm_leads l
            WHERE l.source IS NULL OR l.source = '' OR l.source ILIKE 'LOGISTIS%'
        """)).fetchall()
        _updated = 0
        for _row in _rows:
            _upper = (_row[1] or "").upper()
            if _re_bf.search(r'\bFB\b', _upper):
                _conn.execute(_text("UPDATE cm_leads SET source = 'Facebook' WHERE id = :id"), {"id": _row[0]})
                _updated += 1
            elif _re_bf.search(r'\bTIKTOK\b', _upper):
                _conn.execute(_text("UPDATE cm_leads SET source = 'TikTok' WHERE id = :id"), {"id": _row[0]})
                _updated += 1
        if _updated:
            print(f"[startup] Backfilled source keyword for {_updated} leads")
        _conn.commit()
except Exception as _e:
    print(f"[startup] source-keyword backfill skipped: {_e}")

try:
    with engine.connect() as _conn:
        result = _conn.execute(_text(
            "DELETE FROM cm_leads WHERE notes LIKE '%δημιουργήθηκε αυτόματα από multi-program ΕΡΜΗΣ%' RETURNING id"
        ))
        deleted_ids = [r[0] for r in result]
        if deleted_ids:
            print(f"[startup] Deleted {len(deleted_ids)} auto-created sibling leads: {deleted_ids}")
        _conn.commit()
except Exception as _e:
    print(f"[startup] sibling-lead cleanup skipped: {_e}")

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

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS file_data BYTEA"))
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)"))
        _conn.commit()
except Exception:
    pass

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
        _conn.execute(_text("ALTER TABLE cm_portal_files ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(200)"))
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
        "ΑΝΑΜΟΝΗ ΑΠΑΝΤΗΣΗΣ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ": "Αναμένουμε τη συμπλήρωση και επιστροφή του ερωτηματολογίου που σας στείλαμε.",
        "ΣΥΝΤΑΞΗ BUSINESS PLAN": "Βρισκόμαστε στη σύνταξη του επιχειρηματικού σας σχεδίου (Business Plan).",
        "ΑΝΑΜΟΝΗ ΥΠΟΓΡΑΦΗΣ BUSINESS PLAN": "Το Business Plan έχει ετοιμαστεί και αναμένει την υπογραφή σας.",
        "ΥΠΟΓΡΑΦΗ BUSINESS PLAN ΟΛΟΚΛΗΡΩΘΗΚΕ": "Το επιχειρηματικό σχέδιο έχει υπογραφεί επιτυχώς.",
        "ΥΠΟΒΟΛΗ BUSINESS PLAN ΣΤΗΝ HDB": "Το Business Plan έχει υποβληθεί στην Ελληνική Αναπτυξιακή Τράπεζα (HDB).",
        "ΑΝΑΜΟΝΗ ΑΠΟΔΟΧΩΝ ΑΠΟ ΤΑΜΕΙΑ": "Αναμένουμε την απόφαση αποδοχής από τα 3 χρηματοδοτικά ταμεία.",
        "ΑΠΟΔΟΧΗ ΑΠΟ ΤΑΜΕΙΑ": "Ο φάκελός σας έχει γίνει αποδεκτός από ένα ή περισσότερα ταμεία.",
        "ΠΛΗΡΩΜΗ 310€": "Αναμένεται η εξόφληση του ποσού των 250€+ΦΠΑ=310€.",
        "OPSKE / ESG": "Βρισκόμαστε στο στάδιο συμπλήρωσης των απαιτούμενων στοιχείων στις πλατφόρμες ΟΠΣΚΕ και κριτηρίων ESG.",
        "ΕΠΙΚΟΙΝΩΝΙΑ ΜΕ ΤΑΜΕΙΟ": "Το γραφείο μας βρίσκεται σε επικοινωνία με το χρηματοδοτικό ταμείο.",
        "ΣΥΛΛΟΓΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ & ΥΠΕΥΘΥΝΩΝ ΔΗΛΩΣΕΩΝ": "Συγκεντρώνουμε τα απαραίτητα δικαιολογητικά και υπεύθυνες δηλώσεις.",
        "ΑΝΑΜΟΝΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ ΑΠΟ ΠΕΛΑΤΗ": "Χρειαζόμαστε έγγραφα ή δικαιολογητικά από εσάς για να συνεχίσουμε.",
        "ΥΠΟΒΟΛΗ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ ΣΤΑ ΤΑΜΕΙΑ": "Ο φάκελος έχει υποβληθεί στο χρηματοδοτικό ταμείο.",
        "ΥΠΟ ΑΞΙΟΛΟΓΗΣΗ": "Ο φάκελός σας βρίσκεται στην τελική αξιολόγηση.",
        "ΕΓΚΡΙΣΗ": "Αυτή είναι η οριστική και τελική έγκριση του δανείου.",
        "ΕΚΤΑΜΙΕΥΣΗ": "Η εκταμίευση του δανείου βρίσκεται σε εξέλιξη.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεσή σας έχει ολοκληρωθεί επιτυχώς.",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή πληροφορίες από εσάς.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή.",
        "ΑΠΟΡΡΙΨΗ": "Ο φάκελός σας δεν εγκρίθηκε από τα ταμεία.",
        "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί.",
    },
    "ΔΥΠΑ": {
        "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΔΥΠΑ έχει υποβληθεί.",
        "ΕΓΚΡΙΣΗ": "Η αίτησή σας εγκρίθηκε από τη ΔΥΠΑ!",
        "ΕΝΑΡΞΗ ΕΠΙΧΕΙΡΗΣΗΣ": "Βρισκόμαστε στη διαδικασία έναρξης της επιχειρηματικής σας δραστηριότητας.",
        "ΑΠΟΔΟΣΗ ΑΦΜ": "Προχωράμε στις διαδικασίες έναρξης επιχειρηματικής δραστηριότητας ή απόδοσης ΑΦΜ.",
        "ΥΠΟΒΟΛΗ Α' ΑΙΤΗΜΑΤΟΣ": "Το πρώτο αίτημα εκταμίευσης (Α' Ορόσημο) έχει υποβληθεί στη ΔΥΠΑ/ΟΠΣΚΕ.",
        "1η ΕΚΤΑΜΙΕΥΣΗ": "Η 1η εκταμίευση (Α' Ορόσημο) έχει πραγματοποιηθεί.",
        "ΥΠΟΒΟΛΗ Β' ΑΙΤΗΜΑΤΟΣ": "Το Β' αίτημα εκταμίευσης (Β' Ορόσημο) έχει υποβληθεί.",
        "2η ΕΚΤΑΜΙΕΥΣΗ": "Η 2η εκταμίευση (Β' Ορόσημο) έχει πραγματοποιηθεί.",
        "ΥΠΟΒΟΛΗ Γ' ΑΙΤΗΜΑΤΟΣ": "Το τελικό αίτημα (Γ' Ορόσημο) έχει υποβληθεί.",
        "3η / ΤΕΛΙΚΗ ΕΚΤΑΜΙΕΥΣΗ": "Η τελική εκταμίευση (Γ' Ορόσημο) πραγματοποιείται.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Και τα τρία ορόσημα ολοκληρώθηκαν επιτυχώς. Συγχαρητήρια!",
        "ΕΝΣΤΑΣΗ": "Έχει κατατεθεί ένσταση σε απόφαση του φορέα.",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή έγγραφα από εσάς.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή.",
        "ΑΠΟΡΡΙΨΗ": "Ο φάκελος δεν εγκρίθηκε.",
        "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί.",
    },
    "ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ": {
        "ΑΙΤΗΣΗ ΣΤΗΝ ΔΥΠΑ": "Η αίτηση για το πρόγραμμα επιδότησης πρόσληψης έχει υποβληθεί στη ΔΥΠΑ.",
        "ΕΓΚΡΙΣΗ ΑΠΟ ΔΥΠΑ": "Η αίτησή σας εγκρίθηκε από τη ΔΥΠΑ!",
        "ΥΛΟΠΟΙΗΣΗ ΠΡΟΓΡΑΜΜΑΤΟΣ": "Το πρόγραμμα βρίσκεται σε φάση υλοποίησης.",
        "ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η επιδότηση πρόσληψης ολοκληρώθηκε επιτυχώς. Συγχαρητήρια!",
        "ΣΕ ΑΝΑΜΟΝΗ ΠΕΛΑΤΗ": "Αναμένουμε ενέργεια ή έγγραφα από εσάς για να συνεχίσουμε.",
        "ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ": "Η υπόθεση βρίσκεται προσωρινά σε αναστολή.",
        "ΑΠΟΡΡΙΨΗ": "Η αίτηση δεν εγκρίθηκε.",
        "ΑΚΥΡΩΣΗ": "Η υπόθεση έχει ακυρωθεί.",
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
        print("[migration] Status descriptions seeded")
except Exception as _e:
    print(f"[migration] Status descriptions seed skipped: {_e}")

try:
    from pipelines import PIPELINES as _PL
    _dypa_phases = _json.dumps(_PL["ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ"]["phases"], ensure_ascii=False)
    _dypa_extras = _json.dumps(_PL["ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ"]["extra_statuses"], ensure_ascii=False)
    _dypa_descs  = _json.dumps(_PIPELINE_DESCS["ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ"], ensure_ascii=False)
    with engine.connect() as _conn:
        _conn.execute(_text("""
            INSERT INTO cm_pipeline_configs (program_category, phases_json, extra_statuses_json, status_descriptions_json)
            VALUES ('ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ', :phases, :extras, :descs)
            ON CONFLICT (program_category) DO UPDATE SET
                phases_json = CASE
                    WHEN COALESCE(cm_pipeline_configs.phases_json, '[]') IN ('[]', '', 'null')
                    THEN EXCLUDED.phases_json
                    ELSE cm_pipeline_configs.phases_json
                END,
                extra_statuses_json = CASE
                    WHEN COALESCE(cm_pipeline_configs.extra_statuses_json, '[]') IN ('[]', '', 'null')
                    THEN EXCLUDED.extra_statuses_json
                    ELSE cm_pipeline_configs.extra_statuses_json
                END,
                status_descriptions_json = EXCLUDED.status_descriptions_json,
                updated_at = NOW()
        """), {"phases": _dypa_phases, "extras": _dypa_extras, "descs": _dypa_descs})
        _conn.commit()
        print("[migration] ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ pipeline phases + descriptions seeded/updated")
except Exception as _e:
    print(f"[migration] ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ pipeline seed skipped: {_e}")

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
        if _c.program_category and _c.program_category not in (None, 'ΕΣΠΑ') and _correct == 'ΕΣΠΑ':
            _correct = _c.program_category
        if _c.program_category != _correct:
            _c.program_category = _correct
            _fixed += 1
        if not _c.share_token:
            _c.share_token = str(uuid.uuid4())
            _fixed += 1
        if _c.program_category == 'ΑΝΑΚΑΙΝΙΖΩ' and _c.share_token and _c.phone and not _c.portal_active:
            _c.portal_active = True
            _fixed += 1
    if _fixed:
        _db.commit()
        print(f"[migration] Fixed program_category / backfilled share_token for {_fixed} cases")

with SessionLocal() as _db:
    from collections import defaultdict as _dd
    _by_token = _dd(list)
    for _c in _db.query(_CMCase).filter(_CMCase.share_token.isnot(None)).all():
        _by_token[_c.share_token].append(_c)
    _dedup_fixed = 0
    for _tok, _cases in _by_token.items():
        if len(_cases) <= 1:
            continue
        _cases.sort(key=lambda x: x.id)
        for _dup in _cases[1:]:
            _dup.share_token = str(uuid.uuid4())
            _dedup_fixed += 1
    if _dedup_fixed:
        _db.commit()
        print(f"[migration] Deduplicated share_tokens: assigned new UUIDs to {_dedup_fixed} cases")

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
        _conn.execute(_text("""
            UPDATE cm_pipeline_configs
            SET phases_json = REPLACE(
                phases_json,
                'ΥΠΟΒΟΛΗ ΣΤΟΙΧΕΙΩΝ ΕΝΔΙΑΦΕΡΟΜΕΝΟΥ',
                'ΥΠΟΒΟΛΗ ΦΟΡΜΑΣ ΕΝΔΙΑΦΕΡΟΝΤΟΣ'
            )
            WHERE program_category = 'ΑΝΑΚΑΙΝΙΖΩ'
        """))
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

from models_cases import CMNotificationTemplate, CMStatusSLA, CMCaseModification, CMPortalFile, CMPaymentLog, FinancePayment  # noqa: F401

try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    print(f"[startup] second create_all failed: {_e}")

_DEFAULT_TEMPLATES = [
    {"key": "pending_items_reminder", "label": "Υπενθύμιση Εκκρεμοτήτων",
     "subject": "Απαιτούμενα στοιχεία για την υπόθεσή σας - {client_name}",
     "content": "Αγαπητέ/ή {client_name},\n\nΓια την προχώρηση της υπόθεσής σας ({service_type}) χρειαζόμαστε τα παρακάτω:\n\n• \n• \n• \n\nΠαρακαλούμε αποστείλετε τα παραπάνω το συντομότερο δυνατό.\n\nΜε εκτίμηση,\niMentor Consulting",
     "notification_type": "both"},
]
try:
    with SessionLocal() as _db:
        for _t in _DEFAULT_TEMPLATES:
            if not _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == _t["key"]).first():
                _db.add(CMNotificationTemplate(**_t))
        _db.commit()
except Exception as _e:
    print(f"[startup] template seed failed: {_e}")

_ANA_PORTAL_TEMPLATE = {
    "key": "anakainizw_portal_activation",
    "label": "Ενεργοποίηση Πύλης — Ανακαινίζω",
    "subject": "Η Πύλη Πελάτη σας είναι έτοιμη — {client_name}",
    "content": "Αγαπητέ/ή {client_name},\n\nΗ iMentor Consulting ενεργοποίησε για εσάς την Πύλη Πελάτη για το πρόγραμμα Ανακαινίζω.\n\n🔗 {portal_url}\n\nΓια είσοδο χρειάζεστε μόνο το κινητό τηλέφωνό σας.\n\nΜε εκτίμηση,\nΗ ομάδα iMentor",
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

from auth_cases import seed_admin
try:
    with SessionLocal() as _db:
        seed_admin(_db)
except Exception as _e:
    print(f"[startup] seed_admin failed: {_e}")

try:
    import calendar as _cal
    from models_cases import CMLead as _CMLead, CMBusinessProfile as _CMBizProfile
    from datetime import date as _date

    def _backfill_ten_months_ago() -> _date:
        _t = _date.today()
        _m, _y = _t.month - 10, _t.year
        if _m <= 0:
            _m += 12; _y -= 1
        return _date(_y, _m, min(_t.day, _cal.monthrange(_y, _m)[1]))

    _BF_NO_VALUES = {"ΟΧΙ", "OXI", "ΌΧΙ", "NO", "OCHI"}
    _BF_DISQUALIFY = {"ΑΣΦ & ΦΟΡ ΕΝΗΜ", "ΤΕΙΡΕΣΙΑΣ & ΤΡΑΠΕΖΕΣ", "ΕΝΕΡΓΗ ΕΠΙΧΕΙΡΗΣΗ"}
    _cutoff_date = _backfill_ten_months_ago()

    with SessionLocal() as _db:
        _leads = _db.query(_CMLead).filter(
            _CMLead.status != "CANCEL",
            _CMLead.program.ilike("%ΜΙΚΡΟΠΙΣΤΩΣ%")
        ).all()
        _bf_cancelled = 0
        for _lead in _leads:
            _done = False
            for _k, _meta in (_lead.program_fields or {}).items():
                if isinstance(_meta, dict):
                    _label = (_meta.get("label") or _k).strip()
                    _val = (_meta.get("value") or "").strip().upper()
                else:
                    _label, _val = _k, str(_meta).strip().upper()
                if _label in _BF_DISQUALIFY and _val in _BF_NO_VALUES:
                    _lead.status = "CANCEL"
                    _bf_cancelled += 1
                    _done = True
                    break
            if _done:
                continue
            _afm = (_lead.afm or "").strip()
            if _afm:
                _biz = _db.query(_CMBizProfile).filter(_CMBizProfile.afm == _afm).first()
                if _biz and _biz.regdate and _biz.regdate > _cutoff_date:
                    _lead.status = "CANCEL"
                    _bf_cancelled += 1
        if _bf_cancelled:
            _db.commit()
        print(f"[backfill] ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ cancel check done — cancelled {_bf_cancelled} leads", flush=True)
except Exception as _e:
    print(f"[backfill] ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ cancel check failed: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_finance_payroll_snapshots (
                id SERIAL PRIMARY KEY,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                month_name VARCHAR(50),
                days_elapsed INTEGER,
                days_in_month INTEGER,
                source VARCHAR(100),
                sent_at VARCHAR(50),
                employees_json TEXT NOT NULL,
                received_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(year, month)
            )
        """))
        _conn.commit()
except Exception as _e:
    print(f"[migration] payroll snapshots table failed: {_e}")

try:
    with engine.connect() as _conn:
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_webhook_sources (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                token VARCHAR(64) UNIQUE NOT NULL,
                default_program VARCHAR(100),
                field_map JSONB,
                program_map JSONB,
                enabled BOOLEAN DEFAULT TRUE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.commit()
        _conn.execute(_text("ALTER TABLE cm_webhook_sources ADD COLUMN IF NOT EXISTS default_program_title VARCHAR(300)"))
        _conn.commit()
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS cm_webhook_logs (
                id SERIAL PRIMARY KEY,
                source_id INTEGER REFERENCES cm_webhook_sources(id) ON DELETE CASCADE,
                content_type VARCHAR(200),
                raw_payload JSONB,
                mapped_fields JSONB,
                lead_created BOOLEAN DEFAULT FALSE,
                lead_id INTEGER,
                skip_reason VARCHAR(100),
                received_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_webhook_logs_source_id ON cm_webhook_logs(source_id)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] webhook_sources table failed: {_e}")

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
    from routes.cm_notifications import _send_viber
    from models_cases import CMLead as _CMLead, CMUser as _CMUser
    from datetime import date as _date
    db = SessionLocal()
    try:
        today = _date.today()
        due = db.query(_CMLead).filter(
            _CMLead.next_call_date != None,
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
_scheduler.add_job(_run_agent_sla_digest, "cron", day="*/3", hour=9, minute=0, id="sla_digest_09")
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
app.include_router(finance_api_legacy_router)
app.include_router(finance_api_router)
app.include_router(finance_payroll_targets_router)
app.include_router(finance_payments_router)
app.include_router(cm_portal_integration_router)
app.include_router(cm_leads_router)
app.include_router(cm_leads_sync_router)
app.include_router(cm_leads_ermis_router)
app.include_router(cm_dypa_hiring_router)
app.include_router(cm_webhook_public_router)
app.include_router(cm_webhook_admin_router)


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
        _conn.execute(_text("UPDATE cm_leads SET afm = '0' || afm WHERE afm ~ '^[0-9]{8}$'"))
        _conn.execute(_text("UPDATE cm_leads SET phone = REGEXP_REPLACE(phone, '^\\+30', '') WHERE phone ~ '^\\+30'"))
        _conn.execute(_text("UPDATE cm_leads SET phone = REGEXP_REPLACE(phone, '^0030', '') WHERE phone ~ '^0030'"))
        _conn.execute(_text("UPDATE cm_leads SET phone2 = REGEXP_REPLACE(phone2, '^\\+30', '') WHERE phone2 ~ '^\\+30'"))
        _conn.execute(_text("UPDATE cm_leads SET phone2 = REGEXP_REPLACE(phone2, '^0030', '') WHERE phone2 ~ '^0030'"))
        _conn.execute(_text("UPDATE cm_leads SET email = regexp_replace(email, '@yahoo\\.fr$', '@yahoo.gr', 'i') WHERE email ~* '@yahoo\\.fr$'"))
        _conn.execute(_text("UPDATE cm_leads SET email = 'metalidis58@yahoo.gr' WHERE email = 'metalidis58@yahoo.com'"))
        _conn.execute(_text(r"""
            UPDATE cm_leads
            SET program_title = TRIM(REGEXP_REPLACE(notes, '^.*?[—– -]\s*', '', 'i'))
            WHERE program_title IS NULL
              AND source ILIKE 'LOGISTIS%'
              AND notes ~ '[—– -]'
              AND LENGTH(TRIM(REGEXP_REPLACE(notes, '^.*?[—– -]\s*', '', 'i'))) > 5
        """))
        _conn.execute(_text("""
            UPDATE cm_leads l
            SET program_title = TRIM(a.program_title)
            FROM cm_portal_assignments a
            WHERE a.cm_lead_id = l.id
              AND l.program_title IS NULL
              AND a.program_title IS NOT NULL
              AND LENGTH(TRIM(a.program_title)) > 10
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

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS onboard_token VARCHAR(36)"))
        _conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_cm_leads_onboard_token ON cm_leads (onboard_token)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_leads onboard_token skipped: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS finance_sent_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS finance_amount_sent FLOAT"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS ermis_pending_link_channel VARCHAR(10)"))
        _conn.execute(_text("ALTER TABLE cm_leads ADD COLUMN IF NOT EXISTS ermis_pending_actor VARCHAR(100)"))
        _conn.commit()
except Exception as _e:
    print(f"[migration] cm_leads finance_sent skipped: {_e}", flush=True)

try:
    with engine.connect() as _conn:
        _conn.execute(_text(
            "UPDATE cm_leads SET assigned_name = 'Στριλιγκά Ελευθερία' WHERE assigned_name = 'ELEFTHERIA'"
        ))
        _conn.execute(_text(
            "UPDATE cm_leads SET assigned_name = 'Στριλιγκά Ελευθερία' WHERE assigned_name = 'Στριλιγκά Ελευθεριά'"
        ))
        _conn.execute(_text(
            "UPDATE cm_users SET full_name = 'Στριλιγκά Ελευθερία' WHERE full_name = 'Στριλιγκά Ελευθεριά'"
        ))
        _conn.commit()
    print("[migration] Consultant name normalisation done", flush=True)
except Exception as _e:
    print(f"[migration] Consultant name normalisation skipped: {_e}", flush=True)


@app.on_event("shutdown")
def _shutdown_scheduler():
    _scheduler.shutdown(wait=False)


@app.get("/health")
def health():
    return {"status": "ok"}


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
