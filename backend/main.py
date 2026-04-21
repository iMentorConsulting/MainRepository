import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from models_cases import CMUser, CMCase, CMTask, CMPayment, CMMessage, CMDocument, CMNotificationLog, CMBudgetCategory

# Case management routes
from routes.cm_auth import router as cm_auth_router
from routes.cm_users import router as cm_users_router
from routes.cases import router as cases_router
from routes.cm_dashboard import router as cm_dashboard_router
from routes.cm_google_sheets import router as cm_sheets_router
from routes.cm_notifications import router as cm_notifications_router
from routes.cm_admin import router as cm_admin_router

load_dotenv()

# Create all DB tables
Base.metadata.create_all(bind=engine)

# Startup migration: add new columns and backfill status data
from sqlalchemy import text as _text
from pipelines import OLD_STATUS_MAP as _OSM, STATUS_CATEGORY_MAP as _SCM
from database import SessionLocal
try:
    with engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS status_category VARCHAR(50)"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS program_category VARCHAR(50)"))
        _conn.execute(_text("ALTER TABLE cm_cases ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP"))
        _conn.execute(_text("ALTER TABLE cm_status_sla ADD COLUMN IF NOT EXISTS notification_message TEXT"))
        _conn.commit()
except Exception:
    pass

with SessionLocal() as _db:
    from models_cases import CMCase as _CMCase
    for _c in _db.query(_CMCase).all():
        if _c.status in _OSM:
            _c.status = _OSM[_c.status]
        if not _c.program_category:
            _c.program_category = 'ΕΣΠΑ'
        _c.status_category = _SCM.get(_c.status, 'INTERNAL PROCESS')
    _db.commit()

# Import new models so create_all creates their tables
from models_cases import CMNotificationTemplate, CMStatusSLA

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

# Seed default admin user
from auth_cases import seed_admin
with SessionLocal() as _db:
    seed_admin(_db)

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
