import io
import json
import os
import re
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_tenant
from models import (
    AvailabilityRule, Unit, Customer, Booking, GuestCommunication,
    CleaningSettings, WelcomeGuideItem, LocalRecommendation, MarketplaceItem,
    ServiceRequest, GuestMessage, GuestPortalSettings, BookingInquiry,
    Expense, Loan, Owner, MaintenanceIssue, GapAlertTemplate, SeasonalRate,
    Discount, ChannelRate, TenantSettings, EmailLog, InstallationLicense,
)

router = APIRouter(prefix="/backup", tags=["backup"])

BACKUP_VERSION = "1.0"

# Ordered so dependencies come first (foreign key safety on restore)
TENANT_MODELS = [
    ("tenant_settings", TenantSettings),
    ("owners", Owner),
    ("units", Unit),
    ("customers", Customer),
    ("bookings", Booking),
    ("availability_rules", AvailabilityRule),
    ("guest_communications", GuestCommunication),
    ("cleaning_settings", CleaningSettings),
    ("welcome_guide_items", WelcomeGuideItem),
    ("local_recommendations", LocalRecommendation),
    ("marketplace_items", MarketplaceItem),
    ("service_requests", ServiceRequest),
    ("guest_messages", GuestMessage),
    ("guest_portal_settings", GuestPortalSettings),
    ("booking_inquiries", BookingInquiry),
    ("expenses", Expense),
    ("loans", Loan),
    ("maintenance_issues", MaintenanceIssue),
    ("gap_alert_templates", GapAlertTemplate),
    ("seasonal_rates", SeasonalRate),
    ("discounts", Discount),
    ("channel_rates", ChannelRate),
    ("email_logs", EmailLog),
    ("installation_licenses", InstallationLicense),
]

_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_DT_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T')


def _row_to_dict(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if hasattr(val, 'isoformat'):
            val = val.isoformat()
        d[col.name] = val
    return d


def _coerce_dates(row_dict, Model):
    for col in Model.__table__.columns:
        val = row_dict.get(col.name)
        if not isinstance(val, str):
            continue
        if _DATE_RE.match(val):
            try:
                row_dict[col.name] = date.fromisoformat(val)
            except ValueError:
                pass
        elif _DT_RE.match(val):
            try:
                row_dict[col.name] = datetime.fromisoformat(val)
            except ValueError:
                pass


def _export_tenant(db: Session, tenant: str) -> dict:
    tables = {}
    for key, Model in TENANT_MODELS:
        rows = db.query(Model).filter(Model.tenant == tenant).all()
        tables[key] = [_row_to_dict(r) for r in rows]
    return {
        "version": BACKUP_VERSION,
        "tenant": tenant,
        "exported_at": datetime.utcnow().isoformat(),
        "tables": tables,
    }


def _get_drive_service():
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
    except ImportError:
        return None

    creds_env = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")

    try:
        # Cloud deployments (e.g. Railway) store the raw JSON content as the env var value
        info = json.loads(creds_env)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/drive"]
        )
        return build("drive", "v3", credentials=creds)
    except (json.JSONDecodeError, ValueError):
        pass

    # Fall back to treating env var as a file path
    creds_path = creds_env or "service_account.json"
    if not os.path.exists(creds_path):
        return None
    try:
        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=["https://www.googleapis.com/auth/drive"]
        )
        return build("drive", "v3", credentials=creds)
    except Exception:
        return None


@router.get("/drive-status")
def drive_status(tenant: str = Depends(get_tenant)):
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    creds_env = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")

    # Check whether the env var holds JSON content or a valid file path
    has_creds = False
    try:
        json.loads(creds_env)
        has_creds = True  # raw JSON content (Railway-style)
    except (json.JSONDecodeError, ValueError):
        has_creds = os.path.exists(creds_env) if creds_env else False

    svc = _get_drive_service()
    return {
        "drive_configured": bool(folder_id and svc),
        "has_folder_id": bool(folder_id),
        "has_credentials": has_creds,
    }


@router.get("/export")
def export_backup(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Download tenant backup as JSON file."""
    data = _export_tenant(db, tenant)
    filename = f"backup_{tenant}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(body),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/upload-drive")
def upload_to_drive(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Export tenant data and upload to Google Drive."""
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not folder_id:
        raise HTTPException(status_code=400, detail="GOOGLE_DRIVE_FOLDER_ID δεν έχει οριστεί στο .env")
    svc = _get_drive_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Google Drive credentials δεν βρέθηκαν")

    data = _export_tenant(db, tenant)
    filename = f"backup_{tenant}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

    try:
        from googleapiclient.http import MediaIoBaseUpload
        meta = {"name": filename, "parents": [folder_id], "mimeType": "application/json"}
        media = MediaIoBaseUpload(io.BytesIO(body), mimetype="application/json")
        f = svc.files().create(
            body=meta, media_body=media, fields="id,name,size,createdTime",
            supportsAllDrives=True,
        ).execute()
        return {"ok": True, "file": f, "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Σφάλμα ανεβάσματος: {e}")


@router.get("/list-drive")
def list_drive_backups(tenant: str = Depends(get_tenant)):
    """List existing backups for this tenant from Google Drive."""
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not folder_id:
        return {"files": [], "drive_configured": False}
    svc = _get_drive_service()
    if svc is None:
        return {"files": [], "drive_configured": False}
    try:
        q = f"'{folder_id}' in parents and name contains 'backup_{tenant}_' and trashed=false"
        result = svc.files().list(
            q=q,
            fields="files(id,name,size,createdTime)",
            orderBy="createdTime desc",
            pageSize=30,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        return {"files": result.get("files", []), "drive_configured": True}
    except Exception as e:
        return {"files": [], "drive_configured": True, "error": str(e)}


@router.get("/download-drive/{file_id}")
def download_from_drive(file_id: str, tenant: str = Depends(get_tenant)):
    """Fetch backup JSON from Drive (used before restore)."""
    svc = _get_drive_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Google Drive δεν είναι διαθέσιμο")
    try:
        from googleapiclient.http import MediaIoBaseDownload
        req = svc.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf.seek(0)
        data = json.loads(buf.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Σφάλμα λήψης: {e}")

    if data.get("tenant") != tenant:
        raise HTTPException(status_code=403, detail="Αυτό το backup ανήκει σε άλλο tenant")
    return data


@router.post("/restore")
def restore_backup(payload: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Restore tenant from backup JSON. Clears existing data first."""
    if payload.get("tenant") != tenant:
        raise HTTPException(status_code=400, detail="Το backup ανήκει σε διαφορετικό tenant")

    tables = payload.get("tables", {})

    # Delete in reverse order to avoid FK issues
    for _, Model in reversed(TENANT_MODELS):
        db.query(Model).filter(Model.tenant == tenant).delete(synchronize_session=False)
    db.flush()

    # Re-insert in dependency order
    for key, Model in TENANT_MODELS:
        for row_data in tables.get(key, []):
            row_data = dict(row_data)  # copy
            _coerce_dates(row_data, Model)
            db.add(Model(**row_data))

    db.commit()
    counts = {key: len(tables.get(key, [])) for key, _ in TENANT_MODELS}
    return {"ok": True, "restored_at": datetime.utcnow().isoformat(), "counts": counts}
