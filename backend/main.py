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

load_dotenv()

# Create all DB tables
Base.metadata.create_all(bind=engine)

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
        # Recreate cm_portal_files with new service_type-based schema (drop old case_id version if exists)
        _conn.execute(_text("DROP TABLE IF EXISTS cm_portal_files"))
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
        if _c.program_category != _correct:
            _c.program_category = _correct
            _fixed += 1
        if not _c.share_token:
            _c.share_token = str(uuid.uuid4())
            _fixed += 1
    if _fixed:
        _db.commit()
        print(f"[migration] Fixed program_category / backfilled share_token for {_fixed} cases")

# Import new models so create_all creates their tables
from models_cases import CMNotificationTemplate, CMStatusSLA, CMCaseModification, CMPortalFile

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
Base.metadata.create_all(bind=engine)
with SessionLocal() as _db:
    if _db.query(CMNotificationTemplate).count() == 0:
        for _t in _DEFAULT_TEMPLATES:
            _db.add(CMNotificationTemplate(**_t))
        _db.commit()

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
with SessionLocal() as _db:
    for _key in _OLD_TEMPLATE_KEYS:
        _t = _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == _key).first()
        if _t:
            _db.delete(_t)
    if not _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == "pending_items_reminder").first():
        _db.add(CMNotificationTemplate(**_PENDING_ITEMS_TEMPLATE))
    _db.commit()

# Seed default admin user
from auth_cases import seed_admin
with SessionLocal() as _db:
    seed_admin(_db)

# ── Scheduled sheet auto-refresh (08:00 and 14:00 Athens time) ────────────────
import pytz as _pytz
from apscheduler.schedulers.background import BackgroundScheduler as _BGScheduler

_athens_tz = _pytz.timezone("Europe/Athens")


def _run_scheduled_refresh():
    from routes.cm_google_sheets import _do_import, _do_sync_paid, _last_auto_refresh
    import routes.cm_google_sheets as _sheets_mod
    db = SessionLocal()
    try:
        import_res = _do_import(db)
        sync_res = _do_sync_paid(db)
        _sheets_mod._last_auto_refresh.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": import_res["imported"],
            "updated_paid": sync_res["updated"],
            "error": None,
        })
        print(f"[scheduler] Auto-refresh OK — imported={import_res['imported']}, updated_paid={sync_res['updated']}")
    except Exception as e:
        _sheets_mod._last_auto_refresh.update({
            "last_run_at": datetime.utcnow().isoformat() + "Z",
            "imported": None,
            "updated_paid": None,
            "error": str(e),
        })
        print(f"[scheduler] Auto-refresh ERROR: {e}")
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


_scheduler = _BGScheduler(timezone=_athens_tz)
_scheduler.add_job(_run_scheduled_refresh, "cron", hour=8, minute=0, id="refresh_08")
_scheduler.add_job(_run_scheduled_refresh, "cron", hour=14, minute=0, id="refresh_14")
_scheduler.add_job(_run_agent_sla_digest, "cron", hour=9, minute=0, id="sla_digest_09")
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
        return FileResponse(_index_html)
else:
    @app.get("/")
    def root():
        return {"message": "iMentor Consulting - Case Management API v1.0 (frontend not built yet)"}
