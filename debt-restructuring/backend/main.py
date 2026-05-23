from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
import os
from dotenv import load_dotenv

from database import engine, Base
from models import Case, AppConfig
from routers import cases, statistics, public, config

load_dotenv()

app = FastAPI(title="Debt Restructuring API", version="1.0.0")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

# Safe migration: add columns if missing
def run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN submitted_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN completed_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN client_vat VARCHAR"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_active INTEGER DEFAULT 1"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN contact_stage VARCHAR DEFAULT 'Νέα Ανάλυση'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN last_contacted_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN reminder_count INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN commercial_offer TEXT DEFAULT '{}'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_visit_count INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_visits TEXT DEFAULT '[]'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN stage_changed_at DATETIME"))
            conn.commit()
        except Exception:
            pass

run_migrations()

app.include_router(cases.router)
app.include_router(statistics.router)
app.include_router(public.router)
app.include_router(config.router)


# ── Daily backup scheduler ────────────────────────────────────────────────────
def _run_backup_safe():
    try:
        from backup import run_backup
        result = run_backup()
        print(f"[Backup] OK — {result['filename']} ({result['case_count']} cases)")
    except Exception as e:
        print(f"[Backup] FAILED — {e}")

if os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID"):
    from apscheduler.schedulers.background import BackgroundScheduler
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_run_backup_safe, "cron", hour=18, minute=0)  # 18:00 UTC daily
    _scheduler.start()
    print("[Backup] Scheduler started — daily at 02:00 UTC")


@app.get("/")
def root():
    return {"status": "ok", "app": "Debt Restructuring API"}


@app.post("/admin/backup-now")
def backup_now():
    """Trigger an immediate backup to Google Drive."""
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if not folder_id:
        raise HTTPException(status_code=503, detail="GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured")
    try:
        from backup import run_backup
        result = run_backup()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/service-account-email")
def service_account_email():
    """Return just the client_email from GOOGLE_SERVICE_ACCOUNT_JSON."""
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json:
        raise HTTPException(status_code=404, detail="GOOGLE_SERVICE_ACCOUNT_JSON not set")
    import json as _json
    try:
        email = _json.loads(sa_json).get("client_email", "")
        if not email:
            raise HTTPException(status_code=404, detail="client_email not found in JSON")
        return {"client_email": email}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/export")
def export_data():
    """Download a full JSON export of all cases (no Drive upload)."""
    from backup import build_backup_payload
    payload = build_backup_payload()
    return JSONResponse(content=payload, headers={
        "Content-Disposition": f"attachment; filename=Exodikastikos-backup_{payload['exported_at'][:10]}.json"
    })


@app.post("/admin/restore")
def restore_data(request: dict, wipe_first: bool = False):
    """
    Restore cases from a backup JSON payload.
    POST the full backup JSON as the request body.
    ?wipe_first=true  → deletes ALL existing data first (full reset)
    ?wipe_first=false → safe merge, keeps cases not in backup (default)
    """
    from backup import restore_from_payload
    try:
        result = restore_from_payload(request, wipe_first=wipe_first)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    from database import get_db
    from sqlalchemy import text
    db_ok = False
    case_count = 0
    db_url = os.getenv("DATABASE_URL", "sqlite:///./debt_cases.db")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM cases"))
            case_count = result.scalar() or 0
            db_ok = True
    except Exception as e:
        pass
    return {
        "status": "healthy" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "case_count": case_count,
        "db_type": "postgres" if db_url.startswith("postgres") else "sqlite",
    }
