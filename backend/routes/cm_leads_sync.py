"""
Multi-sheet lead ingestion.

Reads one Google Sheet per program (configured in cm_lead_sheet_configs) using
the shared service-account client, and imports new rows as CMLead records with a
watermark (last_row_num) + sheet_import_ref dedup guard so re-runs never create
duplicates. Modeled on cm_finance_sync.py; scheduled daily in main.py.
"""
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user, CMUser
from database import get_db
from models_cases import CMLead, CMLeadSheetConfig, LEAD_STATUSES
from routes.cm_google_sheets import (
    _get_sheets_service, _parse_date, _parse_float, _strip_accents, _match_agent_id,
)
from routes.cm_portal_integration import _verify_portal_key

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/leads-sync", tags=["cm-leads-sync"])

# In-process status, lost on restart (acceptable, mirrors finance sync)
_last_sync: dict = {"last_run_at": None, "imported": None, "per_program": None}

# Logical lead fields resolvable from the sheet via column_map
LOGICAL_FIELDS = ["name", "phone", "phone2", "email", "afm", "service_type",
                  "total_amount", "source", "notes", "assigned_to", "next_call_date",
                  "status", "created_date"]

# Common sheet spellings → canonical LEAD_STATUSES value
_STATUS_SYNONYMS = {
    "NEWLEAD": "NEW LEAD", "NEW": "NEW LEAD", "ΝΕΟ": "NEW LEAD", "ΝΕΟLEAD": "NEW LEAD",
    "ΚΛΗΣΗ": "CALL", "CALL": "CALL",
    "HOT": "HOT", "ΖΕΣΤΟ": "HOT",
    "ACTIVE": "ACTIVE", "ΕΝΕΡΓΟ": "ACTIVE",
    "DEAL": "DEAL", "ΣΥΜΦΩΝΙΑ": "DEAL",
    "CANCEL": "CANCEL", "CANCELLED": "CANCEL", "ΑΚΥΡΟ": "CANCEL", "ΑΚΥΡΩΣΗ": "CANCEL",
}


def _normalize_status(raw: str) -> str:
    """Map a raw sheet status cell to a canonical LEAD_STATUSES value.
    Falls back to 'NEW LEAD' when the cell is empty or unrecognized."""
    if not raw:
        return "NEW LEAD"
    up = _strip_accents(str(raw)).strip().upper()
    if up in LEAD_STATUSES:
        return up
    compact = up.replace(" ", "")
    return _STATUS_SYNONYMS.get(up) or _STATUS_SYNONYMS.get(compact) or "NEW LEAD"


# ── Column resolution ───────────────────────────────────────────────────────

def _col_letter_to_index(letter: str) -> Optional[int]:
    """'A' -> 0, 'B' -> 1, 'AA' -> 26. Only ASCII A-Z (1-3 chars) count as a
    column-letter reference; anything else (Greek words, longer text) is None."""
    up = (letter or "").strip().upper()
    if not (1 <= len(up) <= 3) or not all("A" <= c <= "Z" for c in up):
        return None
    idx = 0
    for ch in up:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _resolve_index(ref, header: List[str]) -> Optional[int]:
    """A mapping value can be a header name, a 0-based int index, or a short
    Latin column letter ('B'). Header names are matched FIRST (accent-insensitive)
    so single-word headers like 'Email'/'Status' are not mistaken for columns."""
    if ref is None:
        return None
    if isinstance(ref, int):
        return ref
    ref = str(ref).strip()
    if ref == "":
        return None
    # 1) header-name match (what users normally type)
    target = _strip_accents(ref).lower()
    for i, h in enumerate(header):
        if _strip_accents(str(h)).lower() == target:
            return i
    # 2) explicit integer index
    if ref.isdigit():
        return int(ref)
    # 3) short Latin column letter (A, B, .. AA), only if not found as a header
    idx = _col_letter_to_index(ref)
    if idx is not None:
        return idx
    return None


def _cell(row: List[str], idx: Optional[int]) -> str:
    if idx is None or idx < 0 or idx >= len(row):
        return ""
    return str(row[idx]).strip()


# ── Sheet read ──────────────────────────────────────────────────────────────

def _read_config_rows(cfg: CMLeadSheetConfig) -> List[List[str]]:
    if not cfg.spreadsheet_id:
        return []
    service = _get_sheets_service()
    tab = cfg.sheet_tab or "Sheet1"
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=cfg.spreadsheet_id, range=f"{tab}!A:ZZ")
        .execute()
    )
    return result.get("values", [])


def _trunc(val, n):
    if val is None:
        return None
    s = str(val)
    return s[:n] if len(s) > n else s


def _map_row(row: List[str], cfg: CMLeadSheetConfig, header: List[str], users: list) -> dict:
    cmap = cfg.column_map or {}
    data = {}
    for field in LOGICAL_FIELDS:
        if field in cmap:
            data[field] = _cell(row, _resolve_index(cmap[field], header))

    # Guard against values longer than the DB column limits (VARCHAR sizes).
    lead_kwargs = {
        "name": _trunc(data.get("name") or None, 200),
        "phone": _trunc(data.get("phone") or None, 50),
        "phone2": _trunc(data.get("phone2") or None, 50),
        "email": _trunc(data.get("email") or None, 200),
        "afm": _trunc(data.get("afm") or None, 20),
        "service_type": _trunc(data.get("service_type") or None, 150),
        "source": _trunc(data.get("source") or None, 200),
        "notes": data.get("notes") or None,  # TEXT, no limit
        "total_amount": _parse_float(data.get("total_amount")) if data.get("total_amount") else 0,
        "next_call_date": _parse_date(data.get("next_call_date")) if data.get("next_call_date") else None,
        # Starting status read from the sheet (normalized), default NEW LEAD
        "status": _normalize_status(data.get("status")),
    }

    # Creation date read from the sheet (falls back to DB default = import time)
    if data.get("created_date"):
        parsed_created = _parse_date(data.get("created_date"))
        if parsed_created:
            lead_kwargs["created_at"] = datetime.combine(parsed_created, datetime.min.time())

    # Assigned consultant: always keep the raw sheet name (free text, e.g. STELLA),
    # and additionally link to a CM user when the name matches one.
    if data.get("assigned_to"):
        lead_kwargs["assigned_name"] = _trunc(data["assigned_to"], 150)
        if users:
            try:
                lead_kwargs["assigned_agent_id"] = _match_agent_id(data["assigned_to"], users)
            except Exception:
                pass

    # Program-specific columns → program_fields JSON
    pfm = cfg.program_field_map or {}
    program_fields = {}
    for ref, meta in pfm.items():
        idx = _resolve_index(ref, header)
        val = _cell(row, idx)
        if val:
            key = (meta or {}).get("key") if isinstance(meta, dict) else None
            label = (meta or {}).get("label") if isinstance(meta, dict) else None
            program_fields[key or ref] = {"value": val, "label": label or (key or ref)}
    lead_kwargs["program_fields"] = program_fields or None

    return lead_kwargs


# ── Core sync ───────────────────────────────────────────────────────────────

def _sync_config(db: Session, cfg: CMLeadSheetConfig, dry_run: bool = False) -> dict:
    # Base diagnostics so the UI can explain a "0 rows" result.
    diag = {"program": cfg.program, "imported": 0, "scanned_to_row": cfg.last_row_num or 0,
            "total_rows": 0, "data_rows": 0, "already_imported": 0, "skipped_empty": 0,
            "tab": cfg.sheet_tab, "error": None, "preview": [] if dry_run else None}

    if not cfg.spreadsheet_id:
        diag["error"] = "Δεν έχει οριστεί Spreadsheet ID (και Αποθήκευση)."
        return diag
    try:
        rows = _read_config_rows(cfg)
    except Exception as exc:
        diag["error"] = f"Αποτυχία ανάγνωσης φύλλου: {exc}. Ελέγξτε το tab «{cfg.sheet_tab}» και ότι το sheet είναι κοινόχρηστο με τον service account."
        return diag

    header_row = max(1, cfg.header_row or 1)
    header = rows[header_row - 1] if len(rows) >= header_row else []
    diag["total_rows"] = len(rows)

    # Preload once (avoid per-row queries): existing refs for this config + all users.
    existing_refs = {
        r[0] for r in db.query(CMLead.sheet_import_ref)
        .filter(CMLead.sheet_config_id == cfg.id).all() if r[0]
    }
    users = db.query(CMUser).all()

    imported = 0
    errors_skipped = 0
    new_preview = []
    max_row = cfg.last_row_num or 0
    watermark = cfg.last_row_num or header_row
    BATCH = 500

    for i, row in enumerate(rows):
        row_num = i + 1  # 1-based
        if row_num <= header_row:
            continue
        if not any(str(c).strip() for c in row):
            diag["skipped_empty"] += 1
            continue
        diag["data_rows"] += 1
        if row_num <= watermark:
            continue

        ref = f"{cfg.spreadsheet_id}:{row_num}"
        if ref in existing_refs:
            diag["already_imported"] += 1
            max_row = max(max_row, row_num)
            continue

        try:
            kwargs = _map_row(row, cfg, header, users)
        except Exception:
            errors_skipped += 1
            continue
        status = kwargs.pop("status", None) or "NEW LEAD"
        if dry_run:
            new_preview.append({"row_num": row_num, "status": status,
                                **{k: v for k, v in kwargs.items() if k != "program_fields"}})
        else:
            db.add(CMLead(
                program=cfg.program,
                status=status,
                sheet_config_id=cfg.id,
                sheet_row_num=row_num,
                sheet_import_ref=ref,
                **kwargs,
            ))
            imported += 1
            existing_refs.add(ref)
            if imported % BATCH == 0:
                cfg.last_row_num = max(max_row, row_num)
                cfg.last_sync_at = datetime.utcnow()
                db.commit()
        max_row = max(max_row, row_num)

    if not dry_run:
        cfg.last_row_num = max_row
        cfg.last_sync_at = datetime.utcnow()
        db.commit()

    diag.update({"imported": imported, "scanned_to_row": max_row,
                 "errors_skipped": errors_skipped,
                 "preview": new_preview if dry_run else None})
    return diag


def _do_lead_sync(db: Session, program: Optional[str] = None, dry_run: bool = False) -> dict:
    q = db.query(CMLeadSheetConfig).filter(CMLeadSheetConfig.enabled == True)  # noqa: E712
    if program:
        q = q.filter(CMLeadSheetConfig.program == program)
    configs = q.all()
    if not configs:
        note = (f"Δεν βρέθηκε αποθηκευμένη/ενεργή ρύθμιση για «{program}». "
                "Συμπληρώστε τα πεδία και πατήστε Αποθήκευση πρώτα.") if program else \
               "Δεν υπάρχουν ενεργές ρυθμίσεις. Πατήστε Αποθήκευση σε ένα πρόγραμμα πρώτα."
        return {"imported": 0, "per_program": [], "note": note}
    per_program = []
    total = 0
    for cfg in configs:
        try:
            res = _sync_config(db, cfg, dry_run=dry_run)
            per_program.append(res)
            total += res["imported"] or 0
        except Exception as exc:
            log.exception("Lead sync failed for %s: %s", cfg.program, exc)
            per_program.append({"program": cfg.program, "error": str(exc)})
    if not dry_run:
        _last_sync["last_run_at"] = datetime.utcnow().isoformat()
        _last_sync["imported"] = total
        _last_sync["per_program"] = per_program
    return {"imported": total, "per_program": per_program}


# ── Config serialization + endpoints ────────────────────────────────────────

def _cfg_to_dict(c: CMLeadSheetConfig) -> dict:
    return {
        "id": c.id,
        "program": c.program,
        "spreadsheet_id": c.spreadsheet_id,
        "sheet_tab": c.sheet_tab,
        "header_row": c.header_row or 1,
        "column_map": c.column_map or {},
        "program_field_map": c.program_field_map or {},
        "enabled": bool(c.enabled),
        "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
        "last_row_num": c.last_row_num or 0,
    }


class ConfigIn(BaseModel):
    spreadsheet_id: Optional[str] = None
    sheet_tab: Optional[str] = None
    header_row: Optional[int] = None
    column_map: Optional[dict] = None
    program_field_map: Optional[dict] = None
    enabled: Optional[bool] = None
    reset_watermark: Optional[bool] = False


@router.get("/configs")
def list_configs(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_cfg_to_dict(c) for c in db.query(CMLeadSheetConfig).order_by(CMLeadSheetConfig.program).all()]


@router.put("/configs/{program}")
def upsert_config(
    program: str,
    req: ConfigIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cfg = db.query(CMLeadSheetConfig).filter(CMLeadSheetConfig.program == program).first()
    if not cfg:
        cfg = CMLeadSheetConfig(program=program)
        db.add(cfg)
    for field in ("spreadsheet_id", "sheet_tab", "header_row", "column_map", "program_field_map", "enabled"):
        val = getattr(req, field)
        if val is not None:
            setattr(cfg, field, val)
    if req.reset_watermark:
        cfg.last_row_num = 0
    db.commit()
    db.refresh(cfg)
    return _cfg_to_dict(cfg)


@router.get("/status")
def sync_status(current_user: CMUser = Depends(get_current_user)):
    return _last_sync


@router.get("/preview")
def preview_sync(
    program: Optional[str] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _do_lead_sync(db, program=program, dry_run=True)


@router.post("/run")
def run_sync(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _do_lead_sync(db, dry_run=False)


@router.post("/run/{program}")
def run_sync_program(
    program: str,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _do_lead_sync(db, program=program, dry_run=False)


@router.post("/webhook-trigger")
def webhook_trigger(
    _key: None = Depends(_verify_portal_key),
    db: Session = Depends(get_db),
):
    """External trigger (e.g. Pabbly on a new sheet row) to force a sync."""
    return _do_lead_sync(db, dry_run=False)
