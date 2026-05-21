import io
import json
import os
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
    from models_cases import CMPortalFile
except ImportError:
    CMPortalFile = None

router = APIRouter(prefix="/api/cm/backup", tags=["backup"])

KEEP_BACKUPS = 30  # keep last N stored backups


def _d(val):
    return val.isoformat() if val else None


def _build_export(db: Session) -> dict:
    data: dict = {
        "exported_at": fmt_dt(datetime.utcnow()),
        "version": "1.0",
        "app": "iMentor CRM",
    }

    try:
        data["cases"] = [
            {
                "id": c.id, "client_name": c.client_name, "phone": c.phone,
                "email": c.email, "afm": c.afm, "accountant": c.accountant,
                "sale_date": _d(getattr(c, "sale_date", None)),
                "service_type": c.service_type, "status": c.status,
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
                "portal_notified_at": fmt_dt(getattr(c, "portal_notified_at", None)),
                "sheet_import_ref": getattr(c, "sheet_import_ref", None),
                "risk_score": getattr(c, "risk_score", None),
                "notes": c.notes,
                "created_at": fmt_dt(c.created_at),
                "updated_at": fmt_dt(getattr(c, "updated_at", None)),
            }
            for c in db.query(CMCase).all()
        ]
    except Exception:
        data["cases"] = []

    try:
        data["users"] = [
            {"id": u.id, "username": u.username, "full_name": u.full_name,
             "email": u.email, "role": u.role, "created_at": fmt_dt(u.created_at)}
            for u in db.query(CMUser).all()
        ]
    except Exception:
        data["users"] = []

    try:
        data["tasks"] = [
            {"id": t.id, "case_id": t.case_id, "title": t.title,
             "description": t.description, "status": t.status, "priority": t.priority,
             "assigned_to": t.assigned_to, "due_date": _d(getattr(t, "due_date", None)),
             "completed_at": fmt_dt(getattr(t, "completed_at", None)),
             "notes": t.notes, "created_at": fmt_dt(t.created_at)}
            for t in db.query(CMTask).all()
        ]
    except Exception:
        data["tasks"] = []

    try:
        data["payments"] = [
            {"id": p.id, "case_id": p.case_id, "amount": p.amount,
             "payment_date": _d(getattr(p, "payment_date", None)),
             "payment_type": p.payment_type, "description": p.description,
             "created_at": fmt_dt(p.created_at)}
            for p in db.query(CMPayment).all()
        ]
    except Exception:
        data["payments"] = []

    try:
        data["messages"] = [
            {"id": m.id, "case_id": m.case_id, "user_id": m.user_id,
             "content": m.content, "is_internal": m.is_internal,
             "sent_by_client": getattr(m, "sent_by_client", None),
             "author_name": getattr(m, "author_name", None),
             "created_at": fmt_dt(m.created_at)}
            for m in db.query(CMMessage).all()
        ]
    except Exception:
        data["messages"] = []

    try:
        data["documents"] = [
            {"id": d.id, "case_id": d.case_id, "name": d.name,
             "document_type": d.document_type, "status": d.status,
             "uploaded_by": d.uploaded_by,
             "uploaded_by_client": getattr(d, "uploaded_by_client", None),
             "notes": d.notes, "mime_type": getattr(d, "mime_type", None),
             "created_at": fmt_dt(d.created_at)}
            for d in db.query(CMDocument).all()
        ]
    except Exception:
        data["documents"] = []

    try:
        data["budget_categories"] = [
            {"id": b.id, "case_id": b.case_id, "category_name": b.category_name,
             "approved_amount": b.approved_amount, "percent_of_budget": b.percent_of_budget,
             "certified_request1": b.certified_request1, "certified_request2": b.certified_request2,
             "certified_final": b.certified_final, "notes": b.notes}
            for b in db.query(CMBudgetCategory).all()
        ]
    except Exception:
        data["budget_categories"] = []

    try:
        data["pending_items"] = [
            {"id": it.id, "case_id": it.case_id, "item_text": it.item_text,
             "comment": getattr(it, "comment", None), "sort_order": it.sort_order,
             "created_at": fmt_dt(it.created_at)}
            for it in db.query(CMCasePendingItem).all()
        ]
    except Exception:
        data["pending_items"] = []

    try:
        data["status_history"] = [
            {"id": h.id, "case_id": h.case_id, "from_status": h.from_status,
             "to_status": h.to_status, "changed_at": fmt_dt(h.changed_at),
             "changed_by": h.changed_by}
            for h in db.query(CMCaseStatusHistory).all()
        ]
    except Exception:
        data["status_history"] = []

    try:
        data["modifications"] = [
            {"id": m.id, "case_id": m.case_id,
             "modification_date": _d(getattr(m, "modification_date", None)),
             "title": m.title, "justification": m.justification,
             "approval_date": _d(getattr(m, "approval_date", None)),
             "created_at": fmt_dt(m.created_at)}
            for m in db.query(CMCaseModification).all()
        ]
    except Exception:
        data["modifications"] = []

    try:
        data["payment_logs"] = [
            {"id": pl.id, "case_id": pl.case_id, "log_date": fmt_dt(pl.log_date),
             "previous_total": pl.previous_total, "new_total": pl.new_total,
             "delta": pl.delta, "source": pl.source}
            for pl in db.query(CMPaymentLog).all()
        ]
    except Exception:
        data["payment_logs"] = []

    try:
        data["notification_logs"] = [
            {"id": nl.id, "case_id": nl.case_id,
             "notification_type": nl.notification_type,
             "subject": nl.subject, "status": nl.status,
             "sent_by": nl.sent_by, "created_at": fmt_dt(nl.created_at)}
            for nl in db.query(CMNotificationLog).all()
        ]
    except Exception:
        data["notification_logs"] = []

    if CMPortalFile is not None:
        try:
            data["portal_files"] = [
                {"id": pf.id, "service_type": pf.service_type,
                 "original_filename": pf.original_filename, "mime_type": pf.mime_type,
                 "file_size": pf.file_size, "client_description": pf.client_description,
                 "client_instructions": getattr(pf, "client_instructions", None),
                 "internal_notes": getattr(pf, "internal_notes", None),
                 "uploaded_at": fmt_dt(pf.uploaded_at)}
                for pf in db.query(CMPortalFile).all()
            ]
        except Exception:
            data["portal_files"] = []

    return data


def _upload_to_drive(json_str: str, filename: str, folder_id: str) -> tuple[bool, str, str]:
    """Upload JSON backup to a shared Google Drive folder.
    Returns (ok, file_id, error_message).
    The file is stored in the folder owner's quota, not the service account's.
    """
    sa_json_str = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not sa_json_str or not folder_id:
        return False, "", "Drive not configured (missing env vars)"
    try:
        import io as _io
        from google.oauth2.service_account import Credentials as _Creds
        from googleapiclient.discovery import build as _build
        from googleapiclient.http import MediaIoBaseUpload as _Media

        creds = _Creds.from_service_account_info(
            json.loads(sa_json_str),
            scopes=["https://www.googleapis.com/auth/drive"],
        )
        svc = _build("drive", "v3", credentials=creds, cache_discovery=False)

        media = _Media(
            _io.BytesIO(json_str.encode("utf-8")),
            mimetype="application/json",
            resumable=False,
        )
        result = svc.files().create(
            body={"name": filename, "parents": [folder_id]},
            media_body=media,
            fields="id",
            supportsAllDrives=True,
        ).execute()
        return True, result.get("id", ""), ""
    except Exception as exc:
        return False, "", str(exc)


def run_db_backup(db: Session, trigger: str = "auto") -> CMBackupLog:
    """Build export, store in PostgreSQL + upload to Google Drive, prune old entries."""
    log = CMBackupLog(trigger=trigger, destination="db")
    json_str = None
    try:
        export_data = _build_export(db)
        json_str = json.dumps(export_data, ensure_ascii=False, indent=2)
        now = datetime.utcnow()
        filename = f"CaseMngt-backup_{now.strftime('%Y-%m-%d_%H-%M')}.json"

        log.file_name = filename
        log.size_bytes = len(json_str.encode("utf-8"))
        log.json_data = json_str
        log.status = "success"
    except Exception as exc:
        log.status = "failed"
        log.error_message = str(exc)

    db.add(log)
    db.commit()
    db.refresh(log)

    # ── Google Drive upload (best-effort, never fails the backup) ──────
    if json_str and log.status == "success":
        folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
        if folder_id:
            ok, file_id, err = _upload_to_drive(json_str, log.file_name, folder_id)
            if ok:
                log.drive_file_id = file_id
                log.destination = "db+drive"
            else:
                # Append Drive error to error_message but keep status=success
                log.error_message = f"Drive: {err}"
            db.commit()

    # ── Prune: keep only the last KEEP_BACKUPS stored backups ──────────
    try:
        stored = (
            db.query(CMBackupLog)
            .filter(CMBackupLog.status == "success")
            .filter(CMBackupLog.json_data.isnot(None))
            .order_by(CMBackupLog.created_at.desc())
            .all()
        )
        for old in stored[KEEP_BACKUPS:]:
            db.delete(old)
        db.commit()
    except Exception:
        pass

    return log


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def backup_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule_hour = int(os.getenv("BACKUP_SCHEDULE_HOUR", "2"))
    logs = (
        db.query(CMBackupLog)
        .order_by(CMBackupLog.created_at.desc())
        .limit(30)
        .all()
    )
    drive_folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    return {
        "schedule_hour": schedule_hour,
        "drive_configured": bool(drive_folder_id and os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")),
        "drive_folder_url": f"https://drive.google.com/drive/folders/{drive_folder_id}" if drive_folder_id else None,
        "logs": [
            {
                "id": lg.id,
                "created_at": fmt_dt(lg.created_at),
                "status": lg.status,
                "trigger": lg.trigger,
                "destination": lg.destination,
                "file_name": lg.file_name,
                "size_bytes": lg.size_bytes,
                "error_message": lg.error_message,
                "has_data": bool(lg.json_data),
                "drive_file_id": lg.drive_file_id,
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
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Μόνο διαχειριστές μπορούν να εκτελέσουν backup.")

    def _run():
        from database import SessionLocal
        _db = SessionLocal()
        try:
            run_db_backup(_db, trigger="manual")
        finally:
            _db.close()

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Το backup ξεκίνησε. Ελέγξτε τον πίνακα σε λίγα δευτερόλεπτα."}


@router.get("/download/{backup_id}")
def download_backup(
    backup_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a stored backup by ID."""
    log = db.query(CMBackupLog).filter(CMBackupLog.id == backup_id).first()
    if not log or not log.json_data:
        raise HTTPException(status_code=404, detail="Backup δεν βρέθηκε")
    return Response(
        content=log.json_data.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{log.file_name or "backup.json"}"'},
    )


@router.get("/export-json")
def export_json(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a fresh JSON export directly to the browser (not stored)."""
    export_data = _build_export(db)
    json_bytes = json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"imentor-backup-{today}.json"

    log = CMBackupLog(
        trigger="manual", destination="export",
        file_name=filename, size_bytes=len(json_bytes), status="success",
    )
    db.add(log)
    db.commit()

    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
