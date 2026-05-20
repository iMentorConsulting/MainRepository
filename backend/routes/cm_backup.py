import io
import json
import os
import traceback
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db, fmt_dt
from auth_cases import get_current_user
from models_cases import (
    CMCase, CMUser, CMTask, CMPayment, CMMessage, CMDocument,
    CMBudgetCategory, CMCasePendingItem, CMPaymentLog,
    CMCaseStatusHistory, CMCaseModification, CMNotificationLog,
    CMBackupLog,
)

try:
    from models_cases import CMNotificationTemplate
except ImportError:
    CMNotificationTemplate = None

try:
    from models_cases import CMPortalFile
except ImportError:
    CMPortalFile = None

router = APIRouter(prefix="/api/cm/backup", tags=["backup"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _d(val):
    """Format a date field safely."""
    if val is None:
        return None
    return val.isoformat()


def _build_export(db: Session) -> dict:
    """Build a full JSON-serialisable export of all case-management tables."""
    data: dict = {
        "exported_at": fmt_dt(datetime.utcnow()),
        "version": "1.0",
        "app": "iMentor CRM",
    }

    # cases
    try:
        cases = db.query(CMCase).all()
        data["cases"] = [
            {
                "id": c.id,
                "client_name": c.client_name,
                "phone": c.phone,
                "email": c.email,
                "afm": c.afm,
                "accountant": c.accountant,
                "sale_date": _d(getattr(c, "sale_date", None)),
                "service_type": c.service_type,
                "status": c.status,
                "status_category": getattr(c, "status_category", None),
                "program_category": getattr(c, "program_category", None),
                "status_changed_at": fmt_dt(getattr(c, "status_changed_at", None)),
                "approved_budget": c.approved_budget,
                "subsidy_percent": c.subsidy_percent,
                "project_deadline": _d(getattr(c, "project_deadline", None)),
                "approval_date": _d(getattr(c, "approval_date", None)),
                "follow_up_date": _d(getattr(c, "follow_up_date", None)),
                "dypa_start_date": _d(getattr(c, "dypa_start_date", None)),
                "agreed_fee_application": c.agreed_fee_application,
                "agreed_fee_implementation": c.agreed_fee_implementation,
                "total_paid": c.total_paid,
                "assigned_agent_id": c.assigned_agent_id,
                "drive_folder_url": getattr(c, "drive_folder_url", None),
                "portal_active": getattr(c, "portal_active", None),
                "share_token": getattr(c, "share_token", None),
                "portal_visit_count": getattr(c, "portal_visit_count", None),
                "portal_last_visit_at": fmt_dt(getattr(c, "portal_last_visit_at", None)),
                "portal_nps_score": getattr(c, "portal_nps_score", None),
                "portal_nps_at": fmt_dt(getattr(c, "portal_nps_at", None)),
                "portal_review_clicked": getattr(c, "portal_review_clicked", None),
                "portal_notified_at": fmt_dt(getattr(c, "portal_notified_at", None)),
                "sheet_import_ref": getattr(c, "sheet_import_ref", None),
                "risk_score": getattr(c, "risk_score", None),
                "notes": c.notes,
                "created_at": fmt_dt(c.created_at),
                "updated_at": fmt_dt(getattr(c, "updated_at", None)),
            }
            for c in cases
        ]
    except Exception:
        data["cases"] = []

    # users (no password_hash)
    try:
        users = db.query(CMUser).all()
        data["users"] = [
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "email": u.email,
                "role": u.role,
                "created_at": fmt_dt(u.created_at),
            }
            for u in users
        ]
    except Exception:
        data["users"] = []

    # tasks
    try:
        tasks = db.query(CMTask).all()
        data["tasks"] = [
            {
                "id": t.id,
                "case_id": t.case_id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
                "due_date": _d(getattr(t, "due_date", None)),
                "completed_at": fmt_dt(getattr(t, "completed_at", None)),
                "notes": t.notes,
                "created_at": fmt_dt(t.created_at),
                "updated_at": fmt_dt(getattr(t, "updated_at", None)),
            }
            for t in tasks
        ]
    except Exception:
        data["tasks"] = []

    # payments
    try:
        payments = db.query(CMPayment).all()
        data["payments"] = [
            {
                "id": p.id,
                "case_id": p.case_id,
                "amount": p.amount,
                "payment_date": _d(getattr(p, "payment_date", None)),
                "payment_type": p.payment_type,
                "description": p.description,
                "created_at": fmt_dt(p.created_at),
            }
            for p in payments
        ]
    except Exception:
        data["payments"] = []

    # messages
    try:
        messages = db.query(CMMessage).all()
        data["messages"] = [
            {
                "id": m.id,
                "case_id": m.case_id,
                "user_id": m.user_id,
                "content": m.content,
                "is_internal": m.is_internal,
                "sent_by_client": getattr(m, "sent_by_client", None),
                "author_name": getattr(m, "author_name", None),
                "created_at": fmt_dt(m.created_at),
            }
            for m in messages
        ]
    except Exception:
        data["messages"] = []

    # documents — metadata only, no file_data binary
    try:
        documents = db.query(CMDocument).all()
        data["documents"] = [
            {
                "id": doc.id,
                "case_id": doc.case_id,
                "name": doc.name,
                "document_type": doc.document_type,
                "status": doc.status,
                "uploaded_by": doc.uploaded_by,
                "uploaded_by_client": getattr(doc, "uploaded_by_client", None),
                "notes": doc.notes,
                "file_url": doc.file_url,
                "mime_type": getattr(doc, "mime_type", None),
                "created_at": fmt_dt(doc.created_at),
            }
            for doc in documents
        ]
    except Exception:
        data["documents"] = []

    # budget_categories
    try:
        cats = db.query(CMBudgetCategory).all()
        data["budget_categories"] = [
            {
                "id": cat.id,
                "case_id": cat.case_id,
                "category_name": cat.category_name,
                "approved_amount": cat.approved_amount,
                "percent_of_budget": cat.percent_of_budget,
                "certified_request1": cat.certified_request1,
                "certified_request2": cat.certified_request2,
                "certified_final": cat.certified_final,
                "notes": cat.notes,
            }
            for cat in cats
        ]
    except Exception:
        data["budget_categories"] = []

    # pending_items
    try:
        items = db.query(CMCasePendingItem).all()
        data["pending_items"] = [
            {
                "id": it.id,
                "case_id": it.case_id,
                "item_text": it.item_text,
                "comment": getattr(it, "comment", None),
                "sort_order": it.sort_order,
                "created_at": fmt_dt(it.created_at),
                "updated_at": fmt_dt(getattr(it, "updated_at", None)),
            }
            for it in items
        ]
    except Exception:
        data["pending_items"] = []

    # status_history
    try:
        history = db.query(CMCaseStatusHistory).all()
        data["status_history"] = [
            {
                "id": h.id,
                "case_id": h.case_id,
                "from_status": h.from_status,
                "to_status": h.to_status,
                "changed_at": fmt_dt(h.changed_at),
                "changed_by": h.changed_by,
            }
            for h in history
        ]
    except Exception:
        data["status_history"] = []

    # modifications
    try:
        mods = db.query(CMCaseModification).all()
        data["modifications"] = [
            {
                "id": mod.id,
                "case_id": mod.case_id,
                "modification_date": _d(getattr(mod, "modification_date", None)),
                "title": mod.title,
                "justification": mod.justification,
                "approval_date": _d(getattr(mod, "approval_date", None)),
                "created_at": fmt_dt(mod.created_at),
                "updated_at": fmt_dt(getattr(mod, "updated_at", None)),
            }
            for mod in mods
        ]
    except Exception:
        data["modifications"] = []

    # payment_logs
    try:
        plogs = db.query(CMPaymentLog).all()
        data["payment_logs"] = [
            {
                "id": pl.id,
                "case_id": pl.case_id,
                "log_date": fmt_dt(pl.log_date),
                "previous_total": pl.previous_total,
                "new_total": pl.new_total,
                "delta": pl.delta,
                "source": pl.source,
            }
            for pl in plogs
        ]
    except Exception:
        data["payment_logs"] = []

    # notification_logs
    try:
        nlogs = db.query(CMNotificationLog).all()
        data["notification_logs"] = [
            {
                "id": nl.id,
                "case_id": nl.case_id,
                "notification_type": nl.notification_type,
                "recipient_name": nl.recipient_name,
                "recipient_contact": nl.recipient_contact,
                "subject": nl.subject,
                "content": nl.content,
                "status": nl.status,
                "sent_by": nl.sent_by,
                "created_at": fmt_dt(nl.created_at),
            }
            for nl in nlogs
        ]
    except Exception:
        data["notification_logs"] = []

    # portal_files — metadata only, no file_data binary
    if CMPortalFile is not None:
        try:
            pfiles = db.query(CMPortalFile).all()
            data["portal_files"] = [
                {
                    "id": pf.id,
                    "service_type": pf.service_type,
                    "original_filename": pf.original_filename,
                    "mime_type": pf.mime_type,
                    "file_size": pf.file_size,
                    "client_description": pf.client_description,
                    "client_instructions": getattr(pf, "client_instructions", None),
                    "internal_notes": getattr(pf, "internal_notes", None),
                    "uploaded_at": fmt_dt(pf.uploaded_at),
                }
                for pf in pfiles
            ]
        except Exception:
            data["portal_files"] = []
    else:
        data["portal_files"] = []

    return data


def _upload_to_drive(json_bytes: bytes, filename: str) -> str:
    """Upload json_bytes to Google Drive and return the new file id."""
    creds_json = os.getenv("GOOGLE_DRIVE_CREDENTIALS")
    folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
    if not creds_json:
        raise ValueError(
            "GOOGLE_DRIVE_CREDENTIALS env var is not set. "
            "Set it to the JSON content of a Google service-account key with Drive scope."
        )
    if not folder_id:
        raise ValueError(
            "GOOGLE_DRIVE_FOLDER_ID env var is not set. "
            "Set it to the ID of the target Google Drive folder."
        )

    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload

    creds_info = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    drive = build("drive", "v3", credentials=creds)

    file_metadata = {"name": filename, "parents": [folder_id]}
    media = MediaIoBaseUpload(io.BytesIO(json_bytes), mimetype="application/json")
    created = drive.files().create(body=file_metadata, media_body=media, fields="id").execute()
    return created["id"]


def _cleanup_old_backups(drive_service, folder_id: str, keep_days: int = 30):
    """Delete backup files in the Drive folder older than keep_days."""
    try:
        result = drive_service.files().list(
            q=f"'{folder_id}' in parents and name contains 'imentor-backup'",
            fields="files(id,name,createdTime)",
        ).execute()
        files = result.get("files", [])
        cutoff = datetime.utcnow() - timedelta(days=keep_days)
        for f in files:
            created_str = f.get("createdTime", "")
            try:
                # createdTime is RFC3339: "2024-01-15T02:00:00.000Z"
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00")).replace(tzinfo=None)
                if created_dt < cutoff:
                    drive_service.files().delete(fileId=f["id"]).execute()
                    print(f"[Backup] Deleted old backup: {f['name']}")
            except Exception as ex:
                print(f"[Backup] Could not delete {f.get('name')}: {ex}")
    except Exception as ex:
        print(f"[Backup] Cleanup error: {ex}")


def run_drive_backup(db: Session, trigger: str = "auto") -> CMBackupLog:
    """Build export, upload to Drive, clean up old files, log result."""
    log = CMBackupLog(trigger=trigger, destination="drive")
    try:
        export_data = _build_export(db)
        json_bytes = json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8")
        filename = f"imentor-backup-{datetime.utcnow().strftime('%Y-%m-%d-%H%M')}.json"
        log.file_name = filename
        log.size_bytes = len(json_bytes)

        file_id = _upload_to_drive(json_bytes, filename)
        log.drive_file_id = file_id

        # cleanup — we need a fresh drive service for this
        creds_json = os.getenv("GOOGLE_DRIVE_CREDENTIALS")
        folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
        if creds_json and folder_id:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            creds_info = json.loads(creds_json)
            from google.oauth2 import service_account as _sa
            creds = _sa.Credentials.from_service_account_info(
                creds_info,
                scopes=["https://www.googleapis.com/auth/drive"],
            )
            drive = build("drive", "v3", credentials=creds)
            _cleanup_old_backups(drive, folder_id)

        log.status = "success"
    except Exception as exc:
        log.status = "failed"
        log.error_message = str(exc)
        print(f"[Backup] Drive backup failed: {exc}")

    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def backup_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return last 30 backup logs and Drive configuration status."""
    drive_configured = bool(
        os.getenv("GOOGLE_DRIVE_CREDENTIALS") and os.getenv("GOOGLE_DRIVE_FOLDER_ID")
    )
    backup_hour = int(os.getenv("BACKUP_SCHEDULE_HOUR", "2"))

    logs = (
        db.query(CMBackupLog)
        .order_by(CMBackupLog.created_at.desc())
        .limit(30)
        .all()
    )

    return {
        "drive_configured": drive_configured,
        "schedule_hour": backup_hour,
        "logs": [
            {
                "id": lg.id,
                "created_at": fmt_dt(lg.created_at),
                "status": lg.status,
                "trigger": lg.trigger,
                "destination": lg.destination,
                "file_name": lg.file_name,
                "drive_file_id": lg.drive_file_id,
                "size_bytes": lg.size_bytes,
                "error_message": lg.error_message,
            }
            for lg in logs
        ],
    }


@router.post("/now")
def backup_now(
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger an immediate Drive backup (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Μόνο διαχειριστές μπορούν να εκτελέσουν backup.")

    if not os.getenv("GOOGLE_DRIVE_CREDENTIALS") or not os.getenv("GOOGLE_DRIVE_FOLDER_ID"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Το Google Drive δεν έχει ρυθμιστεί. "
                "Ορίστε τις μεταβλητές GOOGLE_DRIVE_CREDENTIALS και GOOGLE_DRIVE_FOLDER_ID."
            ),
        )

    def _run():
        from database import SessionLocal
        _db = SessionLocal()
        try:
            run_drive_backup(_db, trigger="manual")
        finally:
            _db.close()

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Το backup ξεκίνησε στο παρασκήνιο. Ελέγξτε τα αρχεία καταγραφής σε λίγα δευτερόλεπτα."}


@router.get("/export-json")
def export_json(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a full JSON export directly to the browser."""
    export_data = _build_export(db)
    json_bytes = json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"imentor-backup-{today}.json"

    # Log the export
    log = CMBackupLog(
        trigger="manual",
        destination="export",
        file_name=filename,
        size_bytes=len(json_bytes),
        status="success",
    )
    db.add(log)
    db.commit()

    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
