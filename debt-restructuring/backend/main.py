from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
import os
from dotenv import load_dotenv

from database import engine, Base
from models import Case, AppConfig, Lead
from routers import cases, statistics, public, config, leads, auth
from auth_utils import get_current_user

load_dotenv()

app = FastAPI(title="Debt Restructuring API", version="1.0.0")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
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

        # Leads table columns (safe adds for existing deployments)
        for col_ddl in [
            "ALTER TABLE leads ADD COLUMN app_comments TEXT DEFAULT '[]'",
            "ALTER TABLE leads ADD COLUMN app_next_call DATETIME",
            "ALTER TABLE leads ADD COLUMN linked_case_id INTEGER",
            "ALTER TABLE leads ADD COLUMN status_raw VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN month_sheet VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN platform_result VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN extra_fields TEXT DEFAULT '{}'",
            "ALTER TABLE leads ADD COLUMN taxisnet_username VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN taxisnet_password VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN spouse_name VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN taxisnet_username_2 VARCHAR DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN taxisnet_password_2 VARCHAR DEFAULT ''",
        ]:
            try:
                conn.execute(text(col_ddl))
                conn.commit()
            except Exception:
                pass

run_migrations()

app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(statistics.router)
app.include_router(public.router)
app.include_router(config.router)
app.include_router(leads.router)


# ── Daily scheduler: sync then backup at 18:00 Athens (15:00 UTC) ────────────
def _run_backup_safe():
    try:
        from backup import run_backup
        result = run_backup()
        drive_ok = "Drive ✓" if result.get("drive_backup") else f"Drive ✗ {result.get('drive_error','')}"
        print(f"[Backup] OK — {result['filename']} ({result['case_count']} cases) {drive_ok}")
    except Exception as e:
        print(f"[Backup] FAILED — {e}")

def _run_leads_sync_safe():
    try:
        from sheets_sync import sync_leads
        from database import SessionLocal
        db = SessionLocal()
        try:
            result = sync_leads(db)
            print(f"[LeadsSync] OK — {result['inserted']} inserted, skipped {result['skipped']}")
        finally:
            db.close()
    except Exception as e:
        print(f"[LeadsSync] FAILED — {e}")

from apscheduler.schedulers.background import BackgroundScheduler
_scheduler = BackgroundScheduler()
_scheduler.add_job(_run_leads_sync_safe, "cron", hour=4, minute=45)   # 04:45 UTC = 07:45 Athens
_scheduler.add_job(_run_backup_safe,     "cron", hour=15, minute=0)   # 15:00 UTC = 18:00 Athens
_scheduler.start()
print("[Scheduler] Leads sync daily 04:45 UTC (07:45 Athens) | Backup daily 15:00 UTC (18:00 Athens)")


@app.get("/")
def root():
    return {"status": "ok", "app": "Debt Restructuring API"}


@app.post("/admin/backup-now")
def backup_now(_: str = Depends(get_current_user)):
    """Trigger an immediate backup (local + Google Drive if configured)."""
    try:
        from backup import run_backup
        result = run_backup()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/service-account-email")
def service_account_email(_: str = Depends(get_current_user)):
    """Return just the client_email from GOOGLE_SERVICE_ACCOUNT_JSON."""
    try:
        from backup import _load_service_account_json
        info = _load_service_account_json()
        email = info.get("client_email", "")
        if not email:
            raise HTTPException(status_code=404, detail="client_email not found in JSON")
        return {"client_email": email}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/drive-check")
def drive_check(_: str = Depends(get_current_user)):
    """Diagnose Drive connectivity: validates JSON, gets service account email, lists folder."""
    result = {"json_ok": False, "client_email": None, "folder_id": None, "folder_accessible": False, "error": None}
    try:
        from backup import _load_service_account_json, _get_drive_service
        info = _load_service_account_json()
        result["json_ok"] = True
        result["client_email"] = info.get("client_email")
        folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
        result["folder_id"] = folder_id or "NOT SET"
        if folder_id:
            svc = _get_drive_service()
            meta = svc.files().get(fileId=folder_id, fields="id,name", supportsAllDrives=True).execute()
            result["folder_accessible"] = True
            result["folder_name"] = meta.get("name")
    except Exception as e:
        result["error"] = str(e)
    return result


@app.get("/admin/export")
def export_data(_: str = Depends(get_current_user)):
    """Download a full JSON export of all cases (no Drive upload)."""
    from backup import build_backup_payload
    payload = build_backup_payload()
    return JSONResponse(content=payload, headers={
        "Content-Disposition": f"attachment; filename=Exodikastikos-backup_{payload['exported_at'][:10]}.json"
    })


@app.get("/admin/upload-docs")
def upload_docs(_: str = Depends(get_current_user)):
    """Upload the backup & restore instructions PDF to Google Drive."""
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if not folder_id:
        raise HTTPException(status_code=503, detail="GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured")
    try:
        from backup import _get_drive_service
        from googleapiclient.http import MediaIoBaseUpload
        import io as _io

        content = """ΟΔΗΓΙΕΣ BACKUP & RESTORE — ΕΞΩΔΙΚΑΣΤΙΚΟΣ CRM (iMentor)
═══════════════════════════════════════════════════════════════
Τελευταία ενημέρωση: 2026-05-23
Backend: https://innovative-nourishment-production.up.railway.app
═══════════════════════════════════════════════════════════════


1. ΤΙ ΠΕΡΙΕΧΕΙ ΤΟ BACKUP
────────────────────────
Κάθε αρχείο backup περιέχει ΟΛΑ τα δεδομένα της εφαρμογής:
  • Όλες τις υποθέσεις (πελάτης, ΑΦΜ, τηλ, email, υπάλληλος)
  • Οφειλές, περιουσιακά στοιχεία, εισοδηματικά στοιχεία
  • Εκτιμήσεις & πραγματικά αποτελέσματα ρύθμισης
  • Pipeline stage, commercial offer, portal visits
  • Σημειώσεις, share tokens, χρονοσφραγίδες
  • Ρυθμίσεις εφαρμογής (app_config / τιμολόγηση)


2. ΠΟΥ ΑΠΟΘΗΚΕΥΕΤΑΙ
────────────────────
  [A] Railway Volume  →  /data/debt_cases.db  (live, πάντα ενημερωμένο)
  [B] Google Drive    →  αυτός ο φάκελος (αυτόματα κάθε μέρα 18:00 UTC / 21:00 ώρα Ελλάδας)
  [C] Κώδικας εφαρμογής  →  GitHub, branch: claude/new-online-app-T89Sn

  Αρχεία backup: Exodikastikos-backup_YYYY-MM-DD_HH-MM.json
  Διατήρηση:     90 μέρες (τα παλαιότερα διαγράφονται αυτόματα)


3. ΧΕΙΡΟΚΙΝΗΤΟ BACKUP (οποιαδήποτε στιγμή)
────────────────────────────────────────────
  Από την εφαρμογή:
    → Οικονομικά Dashboard → κουμπί "Backup Drive"   (αποθηκεύει στο Drive)
    → Οικονομικά Dashboard → κουμπί "Export JSON"    (κατεβάζει στον υπολογιστή)


4. ΑΠΟΚΑΤΑΣΤΑΣΗ ΔΕΔΟΜΕΝΩΝ (RESTORE)
────────────────────────────────────

  ΣΕΝΑΡΙΟ Α — Η βάση δεδομένων άδειασε (π.χ. μετά από redeploy)
  ──────────────────────────────────────────────────────────────
  1. Κατέβασε το τελευταίο backup από αυτόν τον φάκελο
     (πχ. Exodikastikos-backup_2026-05-23_18-00.json)

  2. Τρέξε την παρακάτω εντολή (σε terminal ή Postman):

     curl -X POST https://innovative-nourishment-production.up.railway.app/admin/restore?wipe_first=true \\
       -H "Content-Type: application/json" \\
       -d @Exodikastikos-backup_2026-05-23_18-00.json

  3. Η εφαρμογή επιστρέφει: {"ok": true, "inserted": 102, "updated": 0}
     Όλες οι υποθέσεις είναι πίσω.


  ΣΕΝΑΡΙΟ Β — Κάποιος διέγραψε υποθέσεις κατά λάθος
  ────────────────────────────────────────────────────
  Ίδιο με Σενάριο Α αλλά χωρίς το ?wipe_first=true:

     curl -X POST https://innovative-nourishment-production.up.railway.app/admin/restore \\
       -H "Content-Type: application/json" \\
       -d @Exodikastikos-backup_2026-05-23_18-00.json

  Αυτό κάνει safe merge — δεν διαγράφει νεότερες υποθέσεις που δεν είναι στο backup.


  ΣΕΝΑΡΙΟ Γ — Θέλουμε να γυρίσουμε σε παλαιότερη έκδοση του κώδικα
  ──────────────────────────────────────────────────────────────────
  1. Βρες το commit hash που θέλεις στο GitHub
  2. Τρέξε:
       git revert <commit-hash>
       git push origin claude/new-online-app-T89Sn
  3. Το Railway κάνει redeploy αυτόματα. Τα δεδομένα δεν επηρεάζονται.


5. ΣΗΜΑΝΤΙΚΕΣ ΠΛΗΡΟΦΟΡΙΕΣ
───────────────────────────
  • Το backup τρέχει 18:00 UTC = 21:00 ώρα Ελλάδας (θερινή ώρα)
  • Αν γίνει κάτι λίγο πριν τις 21:00, χάνεις max 24 ώρες δεδομένων
    → Λύση: πάτα "Backup Drive" πριν κάνεις οποιαδήποτε αλλαγή στο Railway
  • ΜΗΝ αλλάζεις το DATABASE_URL χωρίς πρώτα να κάνεις manual backup
  • ΜΗΝ διαγράφεις τον φάκελο αυτό στο Drive


6. ΕΠΙΚΟΙΝΩΝΙΑ / ΤΕΧΝΙΚΗ ΥΠΟΣΤΗΡΙΞΗ
──────────────────────────────────────
  Εφαρμογή:    https://mainrepository-production.up.railway.app
  Backend:     https://innovative-nourishment-production.up.railway.app
  GitHub:      iMentorConsulting/MainRepository
  Branch:      claude/new-online-app-T89Sn
  Health check: https://innovative-nourishment-production.up.railway.app/health

═══════════════════════════════════════════════════════════════
"""

        svc = _get_drive_service()
        media = MediaIoBaseUpload(
            _io.BytesIO(content.encode("utf-8")),
            mimetype="text/plain; charset=utf-8",
            resumable=False,
        )
        # Delete existing docs file if present to avoid duplicates
        existing = svc.files().list(
            q=f"'{folder_id}' in parents and name='ΟΔΗΓΙΕΣ-BACKUP-RESTORE.txt' and trashed=false",
            fields="files(id)",
        ).execute().get("files", [])
        for f in existing:
            try:
                svc.files().delete(fileId=f["id"]).execute()
            except Exception:
                pass

        uploaded = svc.files().create(
            body={"name": "ΟΔΗΓΙΕΣ-BACKUP-RESTORE.txt", "parents": [folder_id]},
            media_body=media,
            fields="id,name",
        ).execute()
        return {"ok": True, "file": uploaded.get("name"), "id": uploaded.get("id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/restore")
def restore_data(request: dict, wipe_first: bool = False, _: str = Depends(get_current_user)):
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
