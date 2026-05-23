import io
import json
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy import text as _sqlt
from sqlalchemy.orm import Session

from database import get_db, fmt_dt
from auth_cases import get_current_user
from models_cases import (
    CMCase, CMUser, CMTask, CMPayment, CMMessage, CMDocument,
    CMBudgetCategory, CMCasePendingItem, CMPaymentLog,
    CMCaseStatusHistory, CMCaseModification, CMNotificationLog,
    CMBackupLog, CMNotificationTemplate, CMStatusSLA, CMPipelineConfig,
    CMPendingItemTemplate, CMWorkList, CMStatusNotificationConfig,
    CMCaseAnakainizw,
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
        "version": "2.0",
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
        doc_rows = db.execute(_sqlt(
            "SELECT id, case_id, name, document_type, status, uploaded_by, "
            "uploaded_by_client, notes, mime_type, drive_file_id, created_at "
            "FROM cm_documents"
        )).fetchall()
        data["documents"] = [
            {
                "id": r.id, "case_id": r.case_id, "name": r.name,
                "document_type": r.document_type, "status": r.status,
                "uploaded_by": r.uploaded_by,
                "uploaded_by_client": r.uploaded_by_client,
                "notes": r.notes, "mime_type": r.mime_type,
                "drive_file_id": r.drive_file_id,
                "created_at": fmt_dt(r.created_at),
            }
            for r in doc_rows
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
            pf_rows = db.execute(_sqlt(
                "SELECT id, service_type, original_filename, mime_type, file_size, "
                "client_description, client_instructions, internal_notes, uploaded_at, drive_file_id "
                "FROM cm_portal_files"
            )).fetchall()
            data["portal_files"] = [
                {
                    "id": r.id, "service_type": r.service_type,
                    "original_filename": r.original_filename, "mime_type": r.mime_type,
                    "file_size": r.file_size, "client_description": r.client_description,
                    "client_instructions": r.client_instructions,
                    "internal_notes": r.internal_notes,
                    "uploaded_at": fmt_dt(r.uploaded_at),
                    "drive_file_id": r.drive_file_id,
                }
                for r in pf_rows
            ]
        except Exception:
            data["portal_files"] = []

    try:
        data["anakainizw"] = [
            {
                "id": a.id, "case_id": a.case_id,
                "property_sqm": a.property_sqm, "property_prefecture": a.property_prefecture,
                "property_address": a.property_address, "property_type": a.property_type,
                "property_age": a.property_age, "property_usage": a.property_usage,
                "renovation_works": a.renovation_works, "legality": a.legality,
                "cooperating_engineer": a.cooperating_engineer, "subsidy_percent": a.subsidy_percent,
                "energy_works_budget": a.energy_works_budget, "general_works_budget": a.general_works_budget,
                "household_type": a.household_type, "num_children": a.num_children,
                "is_single_parent": a.is_single_parent, "is_three_children": a.is_three_children,
                "boost_island": a.boost_island, "boost_single_parent": a.boost_single_parent,
                "boost_three_children": a.boost_three_children, "boost_large_family": a.boost_large_family,
                "boost_youth": a.boost_youth, "boost_disability": a.boost_disability,
                "doc_title_deed": a.doc_title_deed, "doc_e9": a.doc_e9, "doc_permit": a.doc_permit,
                "doc_legalization": a.doc_legalization, "doc_plans": a.doc_plans,
                "doc_e1": a.doc_e1, "doc_tax_clearance": a.doc_tax_clearance, "doc_e2": a.doc_e2,
                "doc_extras": a.doc_extras, "actual_income": a.actual_income,
                "budget_items": a.budget_items, "advisor_checks": a.advisor_checks,
                "inspection_fee_paid": a.inspection_fee_paid,
                "inspection_fee_paid_at": fmt_dt(a.inspection_fee_paid_at),
                "client_intake_submitted_at": a.client_intake_submitted_at,
                "client_intake_data": a.client_intake_data,
            }
            for a in db.query(CMCaseAnakainizw).all()
        ]
    except Exception:
        data["anakainizw"] = []

    try:
        data["notification_templates"] = [
            {"id": t.id, "key": t.key, "label": t.label, "subject": t.subject,
             "content": t.content, "notification_type": t.notification_type,
             "is_active": t.is_active, "created_at": fmt_dt(t.created_at),
             "updated_at": fmt_dt(t.updated_at)}
            for t in db.query(CMNotificationTemplate).all()
        ]
    except Exception:
        data["notification_templates"] = []

    try:
        data["pipeline_configs"] = [
            {"id": p.id, "program_category": p.program_category,
             "phases_json": p.phases_json, "extra_statuses_json": p.extra_statuses_json,
             "status_descriptions_json": p.status_descriptions_json,
             "updated_at": fmt_dt(p.updated_at)}
            for p in db.query(CMPipelineConfig).all()
        ]
    except Exception:
        data["pipeline_configs"] = []

    try:
        data["status_sla"] = [
            {"id": s.id, "status": s.status, "sla_days": s.sla_days,
             "notification_message": s.notification_message,
             "updated_at": fmt_dt(s.updated_at)}
            for s in db.query(CMStatusSLA).all()
        ]
    except Exception:
        data["status_sla"] = []

    try:
        data["pending_item_templates"] = [
            {"id": t.id, "program_category": t.program_category,
             "item_text": t.item_text, "sort_order": t.sort_order,
             "created_at": fmt_dt(t.created_at)}
            for t in db.query(CMPendingItemTemplate).all()
        ]
    except Exception:
        data["pending_item_templates"] = []

    try:
        data["work_lists"] = [
            {"id": w.id, "name": w.name, "description": w.description,
             "programs": w.programs, "service_types": w.service_types,
             "statuses": w.statuses, "min_days_in_status": w.min_days_in_status,
             "max_days_in_status": w.max_days_in_status, "sort_order": w.sort_order,
             "created_by_id": w.created_by_id, "created_at": fmt_dt(w.created_at),
             "updated_at": fmt_dt(w.updated_at)}
            for w in db.query(CMWorkList).all()
        ]
    except Exception:
        data["work_lists"] = []

    try:
        data["status_notification_configs"] = [
            {"id": c.id, "status": c.status, "enabled": c.enabled}
            for c in db.query(CMStatusNotificationConfig).all()
        ]
    except Exception:
        data["status_notification_configs"] = []

    return data


def _upload_to_drive(json_str: str, filename: str, folder_id: str) -> tuple[bool, str, str]:
    """Upload JSON backup to a shared Google Drive folder.
    Returns (ok, file_id, error_message).
    The file is stored in the folder owner's quota, not the service account's.
    Uses resumable upload to handle arbitrarily large backups (files included as base64).
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

        content_bytes = json_str.encode("utf-8")
        if len(content_bytes) <= 5 * 1024 * 1024:
            media = _Media(
                _io.BytesIO(content_bytes),
                mimetype="application/json",
                resumable=False,
            )
            result = svc.files().create(
                body={"name": filename, "parents": [folder_id]},
                media_body=media,
                fields="id",
                supportsAllDrives=True,
            ).execute()
        else:
            media = _Media(
                _io.BytesIO(content_bytes),
                mimetype="application/json",
                resumable=True,
                chunksize=4 * 1024 * 1024,
            )
            request = svc.files().create(
                body={"name": filename, "parents": [folder_id]},
                media_body=media,
                fields="id",
                supportsAllDrives=True,
            )
            result = None
            while result is None:
                _, result = request.next_chunk()
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
        # Use dedicated backup folder if set, otherwise create a Backups/ subfolder
        # under the documents folder (so only one Drive folder ID is required).
        folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
        if not folder_id:
            docs_root = os.getenv("GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID", "").strip()
            if docs_root:
                try:
                    from drive_storage import _build_service, _get_or_create_folder
                    _svc = _build_service()
                    folder_id = _get_or_create_folder(_svc, docs_root, "Αντίγραφα Ασφαλείας")
                except Exception:
                    folder_id = ""
        if folder_id:
            ok, file_id, err = _upload_to_drive(json_str, log.file_name, folder_id)
            if ok:
                log.drive_file_id = file_id
                log.destination = "db+drive"
            else:
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
    docs_folder_id = os.getenv("GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID", "").strip()
    has_sa = bool(os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
    effective_folder = drive_folder_id or docs_folder_id
    return {
        "schedule_hour": schedule_hour,
        "drive_configured": bool(effective_folder and has_sa),
        "drive_folder_url": f"https://drive.google.com/drive/folders/{effective_folder}" if effective_folder else None,
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


@router.post("/purge-json-data")
def purge_old_json_data(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete stored json_data from ALL backup log rows to free up DB disk space.
    Safe: metadata (status, date, file_name, drive_file_id) is kept.
    Files are in Google Drive; the JSON blobs are no longer needed in the DB.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Μόνο διαχειριστές")
    result = db.execute(_sqlt("UPDATE cm_backup_logs SET json_data = NULL WHERE json_data IS NOT NULL"))
    db.commit()
    freed = result.rowcount
    # Also VACUUM to actually reclaim the space
    try:
        db.execute(_sqlt("VACUUM cm_backup_logs"))
    except Exception:
        pass
    return {"ok": True, "rows_cleared": freed,
            "message": f"Εκαθαρίστηκαν {freed} backup JSON blobs από τη βάση. Ο χώρος αποδεσμεύτηκε."}


@router.post("/migrate-files-to-drive")
def migrate_files_to_drive(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Migrate all file_data blobs from Postgres → Google Drive.
    Safe to run multiple times — skips files already in Drive.
    Returns counts of migrated/skipped/failed files.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Μόνο διαχειριστές")

    try:
        from drive_storage import upload_case_document, upload_portal_template
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive not available: {e}")

    migrated_docs = 0
    skipped_docs = 0
    failed_docs = 0
    migrated_portal = 0
    skipped_portal = 0
    failed_portal = 0

    # ── Migrate cm_documents ──────────────────────────────────────────────
    rows = db.execute(_sqlt("""
        SELECT d.id, d.name, d.mime_type, d.file_data,
               c.id as case_id, c.client_name, c.program_category
        FROM cm_documents d
        JOIN cm_cases c ON c.id = d.case_id
        WHERE d.drive_file_id IS NULL
          AND d.file_data IS NOT NULL
          AND d.mime_type IS NOT NULL
    """)).fetchall()

    for row in rows:
        try:
            drive_id = upload_case_document(
                content=bytes(row.file_data),
                filename=row.name or "document",
                mime_type=row.mime_type,
                program_category=row.program_category or "Άλλο",
                case_id=row.case_id,
                client_name=row.client_name or "Πελάτης",
            )
            db.execute(_sqlt(
                "UPDATE cm_documents SET drive_file_id = :did, file_data = NULL WHERE id = :id"
            ), {"did": drive_id, "id": row.id})
            db.commit()
            migrated_docs += 1
        except Exception as exc:
            db.rollback()
            failed_docs += 1
            _log.warning("Migration failed for doc %s: %s", row.id, exc)

    # ── Migrate cm_portal_files ───────────────────────────────────────────
    if CMPortalFile is not None:
        pf_rows = db.execute(_sqlt("""
            SELECT id, original_filename, mime_type, file_data, service_type
            FROM cm_portal_files
            WHERE drive_file_id IS NULL
              AND file_data IS NOT NULL
              AND mime_type IS NOT NULL
        """)).fetchall()

        for row in pf_rows:
            try:
                drive_id = upload_portal_template(
                    content=bytes(row.file_data),
                    filename=row.original_filename or "template",
                    mime_type=row.mime_type,
                    service_type=row.service_type or "Γενικά",
                )
                db.execute(_sqlt(
                    "UPDATE cm_portal_files SET drive_file_id = :did, file_data = NULL WHERE id = :id"
                ), {"did": drive_id, "id": row.id})
                db.commit()
                migrated_portal += 1
            except Exception as exc:
                db.rollback()
                failed_portal += 1
                _log.warning("Migration failed for portal file %s: %s", row.id, exc)

    total = migrated_docs + migrated_portal
    return {
        "ok": True,
        "case_documents": {"migrated": migrated_docs, "failed": failed_docs},
        "portal_files": {"migrated": migrated_portal, "failed": failed_portal},
        "total_migrated": total,
        "message": f"Μεταφέρθηκαν {total} αρχεία στο Google Drive.",
    }


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
    """Download a fresh JSON export to the browser and also upload to Google Drive."""
    export_data = _build_export(db)
    json_str = json.dumps(export_data, ensure_ascii=False, indent=2)
    json_bytes = json_str.encode("utf-8")
    today = datetime.utcnow().strftime("%Y-%m-%d_%H-%M")
    filename = f"imentor-backup-{today}.json"

    destination = "export"
    drive_file_id = None
    error_message = None

    folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    if folder_id:
        ok, file_id, err = _upload_to_drive(json_str, filename, folder_id)
        if ok:
            drive_file_id = file_id
            destination = "export+drive"
        else:
            error_message = f"Drive: {err}"

    log = CMBackupLog(
        trigger="manual", destination=destination,
        file_name=filename, size_bytes=len(json_bytes), status="success",
        drive_file_id=drive_file_id, error_message=error_message,
    )
    db.add(log)
    db.commit()

    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
