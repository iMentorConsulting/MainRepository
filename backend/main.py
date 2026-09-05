import os
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from models_cases import CMUser, CMCase, CMTask, CMPayment, CMMessage, CMDocument, CMNotificationLog, CMBudgetCategory, CMPendingItemTemplate, CMCasePendingItem, CMPipelineConfig, CMCaseStatusHistory

# Booking system routes
from routes.auth import router as auth_router
from routes.units import router as units_router
from routes.customers import router as customers_router
from routes.bookings import router as bookings_router
from routes.reports import router as reports_router
from routes.ai_advisor import router as ai_router
from routes.cleaning import router as cleaning_router
from routes.guest import router as guest_router
from routes.ical import router as ical_router
from routes.portal_admin import router as portal_admin_router

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
from routes.finance_api import router as finance_api_router

load_dotenv()

# Create all DB tables (covers both booking and CRM models)
Base.metadata.create_all(bind=engine)

# Booking system migrations (idempotent — fail silently on SQLite)
from sqlalchemy import text as _text_b
try:
    with engine.connect() as _bc:
        _bc.execute(_text_b("ALTER TABLE guest_portal_settings ADD COLUMN smtp_host VARCHAR(200)"))
        _bc.execute(_text_b("ALTER TABLE guest_portal_settings ADD COLUMN smtp_port INTEGER DEFAULT 587"))
        _bc.execute(_text_b("ALTER TABLE guest_portal_settings ADD COLUMN smtp_user VARCHAR(200)"))
        _bc.execute(_text_b("ALTER TABLE guest_portal_settings ADD COLUMN smtp_pass VARCHAR(200)"))
        _bc.execute(_text_b("ALTER TABLE guest_portal_settings ADD COLUMN notification_email VARCHAR(200)"))
        _bc.commit()
except Exception:
    pass

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
        _conn.execute(_text("UPDATE cm_cases SET portal_visit_count = 0 WHERE portal_last_visit_at IS NULL"))
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
        "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΕΣΠΑ έχει υποβληθεί. Αναμένουμε τα αποτελέσματα τα οποία θα ανακοινωθούν συνολικά για όλους υποψήφιους."
    },
    "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ": {
        "ΠΛΗΡΩΜΗ 150€": "Έχει πραγματοποιηθεί η πληρωμή 150€+ΦΠΑ και έχει ανοιχτεί ο φάκελος."
    },
    "ΔΥΠΑ": {
        "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ": "Η αίτησή σας για το πρόγραμμα ΔΥΠΑ έχει υποβληθεί. Αναμένουμε τα αποτελέσματα."
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

from models_cases import CMNotificationTemplate, CMStatusSLA, CMCaseModification, CMPortalFile, CMPaymentLog

_PENDING_ITEMS_TEMPLATE = {
    "key": "pending_items_reminder",
    "label": "Υπενθύμιση Εκκρεμοτήτων",
    "subject": "Απαιτούμενα στοιχεία για την υπόθεσή σας - {client_name}",
    "content": "Αγαπητέ/ή {client_name},\n\nΓια την προχώρηση της υπόθεσής σας ({service_type}) χρειαζόμαστε τα παρακάτω:\n\n• \n• \n• \n\nΠαρακαλούμε αποστείλατε τα παραπάνω το συντομότερο δυνατό.\n\nΜε εκτίμηση,\niMentor Consulting",
    "notification_type": "both",
}
Base.metadata.create_all(bind=engine)
with SessionLocal() as _db:
    if not _db.query(CMNotificationTemplate).filter(CMNotificationTemplate.key == "pending_items_reminder").first():
        _db.add(CMNotificationTemplate(**_PENDING_ITEMS_TEMPLATE))
    _db.commit()

from auth_cases import seed_admin
with SessionLocal() as _db:
    seed_admin(_db)

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
        print(f"[scheduler] Auto-refresh OK")
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
                f"Παρακαλώ ενημέρωσε ή προχώρησε σε επόμενο στάδιο.\n\nΜε εκτίμηση,\niMentor Consulting"
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

# Booking system
app.include_router(auth_router)
app.include_router(units_router)
app.include_router(customers_router)
app.include_router(bookings_router)
app.include_router(reports_router)
app.include_router(ai_router)
app.include_router(cleaning_router)
app.include_router(guest_router)
app.include_router(ical_router)
app.include_router(portal_admin_router)

# Case management
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
app.include_router(finance_api_router)


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
        return FileResponse(_index_html)
else:
    @app.get("/")
    def root():
        return {"message": "iMentor Consulting - Case Management API v1.0 (frontend not built yet)"}
