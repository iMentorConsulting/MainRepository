"""
Daily backup to Google Drive.

Requires env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON  — service account key JSON (already used for email)
  GOOGLE_DRIVE_BACKUP_FOLDER_ID — ID of the Drive folder shared with the service account

The service account must have Editor access to the target folder.
Backups are named:  Exodikastikos-backup_YYYY-MM-DD_HH-MM.json
Files older than 90 days in that folder are deleted automatically.
"""

import json
import os
import io
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from database import SessionLocal
from models import Case, AppConfig


def _get_drive_service():
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON not set")
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    creds = Credentials.from_service_account_info(
        json.loads(sa_json),
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _serialize_case(c: Case) -> dict:
    def dt(v):
        return v.isoformat() if v else None
    return {
        "id": c.id,
        "client_name": c.client_name,
        "client_phone": c.client_phone or "",
        "client_email": c.client_email or "",
        "client_vat": c.client_vat,
        "employee": c.employee,
        "status": c.status,
        "debtor_type": c.debtor_type,
        "debts": c.debts or [],
        "assets": c.assets or [],
        "income_data": c.income_data or {},
        "estimates": c.estimates or {},
        "actual_results": c.actual_results,
        "notes": c.notes or "",
        "share_token": c.share_token,
        "portal_active": c.portal_active,
        "contact_stage": c.contact_stage or "Νέα Ανάλυση",
        "last_contacted_at": dt(c.last_contacted_at),
        "reminder_count": c.reminder_count or 0,
        "commercial_offer": c.commercial_offer or {},
        "portal_visit_count": c.portal_visit_count or 0,
        "portal_visits": c.portal_visits or [],
        "created_at": dt(c.created_at),
        "updated_at": dt(c.updated_at),
        "submitted_at": dt(c.submitted_at),
        "completed_at": dt(c.completed_at),
        "stage_changed_at": dt(c.stage_changed_at),
    }


def build_backup_payload() -> dict:
    db: Session = SessionLocal()
    try:
        cases = db.query(Case).order_by(Case.id).all()
        configs = db.query(AppConfig).all()
        return {
            "exported_at": datetime.utcnow().isoformat(),
            "case_count": len(cases),
            "cases": [_serialize_case(c) for c in cases],
            "app_config": [{"key": cfg.key, "value": cfg.value} for cfg in configs],
        }
    finally:
        db.close()


def run_backup() -> dict:
    """Upload a JSON backup to Google Drive. Returns info dict."""
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if not folder_id:
        raise RuntimeError("GOOGLE_DRIVE_BACKUP_FOLDER_ID not set")

    payload = build_backup_payload()
    filename = f"Exodikastikos-backup_{datetime.utcnow().strftime('%Y-%m-%d_%H-%M')}.json"
    content = json.dumps(payload, ensure_ascii=False, indent=2)

    svc = _get_drive_service()

    # Upload
    from googleapiclient.http import MediaIoBaseUpload
    media = MediaIoBaseUpload(
        io.BytesIO(content.encode("utf-8")),
        mimetype="application/json",
        resumable=False,
    )
    file_meta = {"name": filename, "parents": [folder_id]}
    uploaded = svc.files().create(body=file_meta, media_body=media, fields="id,name").execute()

    # Prune files older than 90 days in the same folder
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    old_files = svc.files().list(
        q=f"'{folder_id}' in parents and createdTime < '{cutoff}' and trashed = false",
        fields="files(id,name)",
    ).execute().get("files", [])
    for f in old_files:
        try:
            svc.files().delete(fileId=f["id"]).execute()
        except Exception:
            pass

    return {
        "ok": True,
        "filename": filename,
        "file_id": uploaded.get("id"),
        "case_count": payload["case_count"],
        "pruned": len(old_files),
    }


def restore_from_payload(payload: dict, wipe_first: bool = False) -> dict:
    """
    Restore cases and app_config from a backup payload dict.

    wipe_first=False  →  upsert (safe merge — existing newer cases are kept)
    wipe_first=True   →  delete everything first, then insert (full reset)
    """
    from sqlalchemy import text as _text
    db: Session = SessionLocal()
    try:
        if wipe_first:
            db.query(Case).delete()
            db.query(AppConfig).delete()
            db.commit()

        inserted = 0
        updated = 0

        for c in payload.get("cases", []):
            def _dt(v):
                from datetime import datetime as _datetime
                if not v:
                    return None
                try:
                    return _datetime.fromisoformat(v)
                except Exception:
                    return None

            existing = db.query(Case).filter(Case.id == c["id"]).first()
            fields = dict(
                client_name=c.get("client_name", ""),
                client_phone=c.get("client_phone", ""),
                client_email=c.get("client_email", ""),
                client_vat=c.get("client_vat"),
                employee=c.get("employee", ""),
                status=c.get("status", "draft"),
                debtor_type=c.get("debtor_type", "Φυσικό Πρόσωπο"),
                debts=c.get("debts", []),
                assets=c.get("assets", []),
                income_data=c.get("income_data", {}),
                estimates=c.get("estimates", {}),
                actual_results=c.get("actual_results"),
                notes=c.get("notes", ""),
                share_token=c.get("share_token", ""),
                portal_active=c.get("portal_active", True),
                contact_stage=c.get("contact_stage", "Νέα Ανάλυση"),
                last_contacted_at=_dt(c.get("last_contacted_at")),
                reminder_count=c.get("reminder_count", 0),
                commercial_offer=c.get("commercial_offer", {}),
                portal_visit_count=c.get("portal_visit_count", 0),
                portal_visits=c.get("portal_visits", []),
                created_at=_dt(c.get("created_at")),
                updated_at=_dt(c.get("updated_at")),
                submitted_at=_dt(c.get("submitted_at")),
                completed_at=_dt(c.get("completed_at")),
                stage_changed_at=_dt(c.get("stage_changed_at")),
            )
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Case(id=c["id"], **fields))
                inserted += 1

        for cfg in payload.get("app_config", []):
            existing = db.query(AppConfig).filter(AppConfig.key == cfg["key"]).first()
            if existing:
                existing.value = cfg["value"]
            else:
                db.add(AppConfig(key=cfg["key"], value=cfg["value"]))

        db.commit()
        return {"ok": True, "inserted": inserted, "updated": updated, "wiped_first": wipe_first}
    finally:
        db.close()
