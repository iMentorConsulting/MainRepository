"""
Backup system: local + Google Drive. Both are best-effort and independent —
a failure in one (e.g. the Railway volume running out of space) must never
block the other.

LOCAL BACKUPS (Railway volume /data):
  Kept for 3 days, auto-pruned — the volume is disk-constrained and shares
  space with the live SQLite DB, so Google Drive is the long-term archive.

GOOGLE DRIVE BACKUPS:
  Permanent archive — never auto-pruned.
  Requires: GOOGLE_DRIVE_BACKUP_FOLDER_ID (shared drive, NOT personal folder)
  Service accounts: Need a Shared Drive (personal Drive has zero quota)
"""

import json
import os
import io
from datetime import datetime, timedelta
import pathlib

from sqlalchemy.orm import Session
from database import SessionLocal
from models import Case, AppConfig, Lead


def _load_service_account_json() -> dict:
    """
    Load and parse GOOGLE_SERVICE_ACCOUNT_JSON, cleaning up common env-var issues.
    Railway and similar platforms sometimes wrap the value in extra quotes.
    """
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON not set")

    # Strip BOM if present
    raw = raw.lstrip('﻿')

    # Strip wrapping single or double quotes added by some platforms
    if (raw.startswith('"') and raw.endswith('"')) or \
       (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1]

    # Unescape \" → " (Railway sometimes double-escapes)
    if '\\"' in raw and '"' not in raw.replace('\\"', ''):
        raw = raw.replace('\\"', '"')

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON: {e}. "
            f"Tip: paste the JSON as a single minified line in Railway env vars, with no surrounding quotes."
        )


def _get_drive_service():
    sa_info = _load_service_account_json()
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    creds = Credentials.from_service_account_info(
        sa_info,
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


def _serialize_lead(l: Lead) -> dict:
    def dt(v):
        return v.isoformat() if v else None
    return {
        "id": l.id,
        "sheet_row_num": l.sheet_row_num,
        "status": l.status or "",
        "status_raw": l.status_raw or "",
        "assigned_to": l.assigned_to or "",
        "date": l.date or "",
        "name": l.name or "",
        "phone": l.phone or "",
        "email": l.email or "",
        "total_debt": l.total_debt or "",
        "offer_sent": l.offer_sent or False,
        "offer_sent_date": l.offer_sent_date or "",
        "offer_amount": l.offer_amount or "",
        "success_fee": l.success_fee or "",
        "referrer": l.referrer or "",
        "service_type": l.service_type or "",
        "application_number": l.application_number or "",
        "app_comments": l.app_comments or [],
        "app_next_call": dt(l.app_next_call),
        "linked_case_id": l.linked_case_id,
        "taxisnet_username": getattr(l, "taxisnet_username", "") or "",
        "taxisnet_password": getattr(l, "taxisnet_password", "") or "",
        "spouse_name": getattr(l, "spouse_name", "") or "",
        "taxisnet_username_2": getattr(l, "taxisnet_username_2", "") or "",
        "taxisnet_password_2": getattr(l, "taxisnet_password_2", "") or "",
        "created_at": dt(l.created_at),
        "updated_at": dt(l.updated_at),
    }


def build_backup_payload() -> dict:
    db: Session = SessionLocal()
    try:
        cases = db.query(Case).order_by(Case.id).all()
        leads = db.query(Lead).order_by(Lead.id).all()
        configs = db.query(AppConfig).all()
        return {
            "exported_at": datetime.utcnow().isoformat(),
            "case_count": len(cases),
            "lead_count": len(leads),
            "cases": [_serialize_case(c) for c in cases],
            "leads": [_serialize_lead(l) for l in leads],
            "app_config": [{"key": cfg.key, "value": cfg.value} for cfg in configs],
        }
    finally:
        db.close()


def run_backup() -> dict:
    """
    Backup to local volume (guaranteed) + Google Drive (best-effort).
    Local backups are the primary safety mechanism.
    """
    payload = build_backup_payload()
    filename = f"Exodikastikos-backup_{datetime.utcnow().strftime('%Y-%m-%d_%H-%M')}.json"
    content = json.dumps(payload, ensure_ascii=False, indent=2)

    # === LOCAL BACKUP (best-effort — must never block the Drive backup below) ===
    local_path = None
    local_pruned = 0
    local_error = None
    try:
        backup_dir = pathlib.Path("/data/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        local_path = backup_dir / filename
        local_path.write_text(content, encoding="utf-8")

        # Prune local backups older than 3 days — Google Drive (below) is the
        # long-term archive; local only needs to survive a short outage.
        cutoff = datetime.utcnow() - timedelta(days=3)
        for f in backup_dir.glob("Exodikastikos-backup_*.json"):
            try:
                if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
                    f.unlink()
                    local_pruned += 1
            except Exception:
                pass
    except Exception as e:
        local_error = str(e)
        local_path = None

    result = {
        "ok": True,
        "filename": filename,
        "case_count": payload["case_count"],
        "lead_count": payload.get("lead_count", 0),
        "local_backup": str(local_path) if local_path else None,
        "local_pruned": local_pruned,
        "local_error": local_error,
        "drive_backup": None,
        "drive_error": None,
    }

    # === GOOGLE DRIVE BACKUP (optional, best-effort) ===
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if folder_id:
        try:
            svc = _get_drive_service()
            from googleapiclient.http import MediaIoBaseUpload
            media = MediaIoBaseUpload(
                io.BytesIO(content.encode("utf-8")),
                mimetype="application/json",
                resumable=False,
            )
            file_meta = {"name": filename, "parents": [folder_id]}
            uploaded = svc.files().create(
                body=file_meta, media_body=media, fields="id,name",
                supportsAllDrives=True,
            ).execute()
            result["drive_backup"] = uploaded.get("id")
            # Drive is the permanent long-term archive — no pruning here.
        except Exception as e:
            result["drive_error"] = str(e)
            # Don't raise — local backup is safe

    return result


def restore_from_payload(payload: dict, wipe_first: bool = False) -> dict:
    """
    Restore cases, leads, and app_config from a backup payload dict.

    wipe_first=False  →  upsert (safe merge — existing newer entries are kept)
    wipe_first=True   →  delete everything first, then insert (full reset)
    """
    from sqlalchemy import text as _text
    db: Session = SessionLocal()
    try:
        if wipe_first:
            db.query(Case).delete()
            db.query(Lead).delete()
            db.query(AppConfig).delete()
            db.commit()

        def _dt(v):
            from datetime import datetime as _datetime
            if not v:
                return None
            try:
                return _datetime.fromisoformat(v)
            except Exception:
                return None

        inserted_cases = 0
        updated_cases = 0
        inserted_leads = 0
        updated_leads = 0

        # Restore cases
        for c in payload.get("cases", []):
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
                updated_cases += 1
            else:
                db.add(Case(id=c["id"], **fields))
                inserted_cases += 1

        # Restore leads
        for l in payload.get("leads", []):
            existing = db.query(Lead).filter(Lead.id == l["id"]).first()
            fields = dict(
                sheet_row_num=l.get("sheet_row_num"),
                status=l.get("status", ""),
                status_raw=l.get("status_raw", ""),
                assigned_to=l.get("assigned_to", ""),
                date=l.get("date", ""),
                name=l.get("name", ""),
                phone=l.get("phone", ""),
                email=l.get("email", ""),
                total_debt=l.get("total_debt", ""),
                offer_sent=l.get("offer_sent", False),
                offer_sent_date=l.get("offer_sent_date", ""),
                offer_amount=l.get("offer_amount", ""),
                success_fee=l.get("success_fee", ""),
                referrer=l.get("referrer", ""),
                service_type=l.get("service_type", ""),
                application_number=l.get("application_number", ""),
                app_comments=l.get("app_comments", []),
                app_next_call=_dt(l.get("app_next_call")),
                linked_case_id=l.get("linked_case_id"),
                taxisnet_username=l.get("taxisnet_username", ""),
                taxisnet_password=l.get("taxisnet_password", ""),
                created_at=_dt(l.get("created_at")),
                updated_at=_dt(l.get("updated_at")),
            )
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated_leads += 1
            else:
                db.add(Lead(id=l["id"], **fields))
                inserted_leads += 1

        # Restore app config
        for cfg in payload.get("app_config", []):
            existing = db.query(AppConfig).filter(AppConfig.key == cfg["key"]).first()
            if existing:
                existing.value = cfg["value"]
            else:
                db.add(AppConfig(key=cfg["key"], value=cfg["value"]))

        db.commit()
        return {
            "ok": True,
            "cases_inserted": inserted_cases,
            "cases_updated": updated_cases,
            "leads_inserted": inserted_leads,
            "leads_updated": updated_leads,
            "wiped_first": wipe_first
        }
    finally:
        db.close()
