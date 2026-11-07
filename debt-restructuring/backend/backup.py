"""
Disaster-recovery backup system: complete database dump → local volume + Google Drive, verified, monitored.

WHAT IS BACKED UP
  EVERY table of the application, discovered automatically from the SQLAlchemy models (cases, leads, payments,
  Θέμις conversations, call/Viber logs, notifications, accountant assignments, app config, …). A table added in
  the future is included without touching this file. Every column of every row is stored.

HOW A BACKUP IS MADE (run_backup)
  1. Consistent snapshot of the whole database (REPEATABLE READ on PostgreSQL) → one JSON document (format 2)
     with per-table row counts and a SHA-256 integrity hash, gzip-compressed.
  2. The row counts of the dump are re-checked against COUNT(*) of the live database.
  3. Local copy (atomic write, re-read and hash-verified).
  4. Google Drive upload with retries, then verified: size and MD5 reported by Drive must equal the local file.
  5. The outcome is stored in AppConfig["backup_status"]; ANY failure sends an alert email to the admin.

HOW IT IS KEPT HONEST
  • check_backup_freshness()  — alerts when there is no verified Drive backup newer than 30 hours.
  • run_restore_drill()       — weekly: downloads the newest Drive backup, verifies it and restores it into a
                                throw-away SQLite database, comparing every table's row count. Alerts on failure.
  • restore_from_payload()    — generic restore (all tables, FK order, transaction, Postgres sequences reset),
                                with dry_run. Old format-1 backups (cases/leads/app_config only) still restore.
  • restore_backup.py         — command-line restore that works even when the web app is down.

Drive backups are NEVER pruned (permanent archive). Local copies are kept 7 days (always the 3 newest).
Requires GOOGLE_DRIVE_BACKUP_FOLDER_ID (a shared drive — service accounts have no quota in a personal Drive).
"""

import base64
import gzip
import hashlib
import io
import json
import logging
import os
import pathlib
import time
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import JSON, delete, func, insert, select, text, update
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine as default_engine
import models  # noqa: F401  (registers every table on Base.metadata)
from models import AppConfig, Case, Lead

logger = logging.getLogger(__name__)

FORMAT_VERSION = 2
BACKUP_PREFIX = "Exodikastikos-backup_"
LOCAL_RETENTION_DAYS = 7
LOCAL_KEEP_NEWEST = 3
MAX_BACKUP_AGE_HOURS = 30
STATUS_KEY = "backup_status"
DRILL_KEY = "backup_drill_status"


# ══ Google Drive helpers ═════════════════════════════════════════════════════════════════════════════

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


def _with_retries(fn, attempts: int = 3, delays=(2, 8, 20)):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # network, quota, 5xx…
            last = e
            logger.warning(f"[Backup] attempt {i + 1}/{attempts} failed: {e}")
            if i < attempts - 1:
                time.sleep(delays[min(i, len(delays) - 1)])
    raise last


def _drive_upload(svc, folder_id: str, filename: str, data: bytes, props: dict) -> dict:
    """Upload `data` to the Drive folder; returns the Drive file resource (id, name, size, md5Checksum)."""
    from googleapiclient.http import MediaIoBaseUpload
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/gzip", resumable=True, chunksize=5 * 1024 * 1024)
    body = {"name": filename, "parents": [folder_id], "appProperties": {k: str(v) for k, v in props.items()}}
    request = svc.files().create(body=body, media_body=media, fields="id,name,size,md5Checksum", supportsAllDrives=True)
    response = None
    while response is None:
        _status, response = request.next_chunk(num_retries=3)
    if not response.get("md5Checksum"):
        response = svc.files().get(fileId=response["id"], fields="id,name,size,md5Checksum", supportsAllDrives=True).execute()
    return response


def _drive_list_backups(svc, folder_id: str, limit: int = 20) -> list:
    res = svc.files().list(
        q=f"'{folder_id}' in parents and name contains '{BACKUP_PREFIX}' and trashed=false",
        orderBy="createdTime desc", pageSize=limit,
        fields="files(id,name,size,md5Checksum,createdTime,appProperties)",
        supportsAllDrives=True, includeItemsFromAllDrives=True,
    ).execute()
    return res.get("files", [])


def _drive_download(svc, file_id: str) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, svc.files().get_media(fileId=file_id, supportsAllDrives=True), chunksize=5 * 1024 * 1024)
    done = False
    while not done:
        _status, done = downloader.next_chunk(num_retries=3)
    return buf.getvalue()


# ══ Serialization ════════════════════════════════════════════════════════════════════════════════════

def _ser(v):
    """Python value → JSON-safe value. Non-JSON types are tagged so they restore to exactly the same value."""
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if isinstance(v, date):
        return {"$d": v.isoformat()}
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"$bytes": base64.b64encode(bytes(v)).decode("ascii")}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    return v


def _deser(column, v):
    if isinstance(column.type, JSON):
        return v  # JSON columns hold plain JSON — never reinterpret
    if isinstance(v, dict) and len(v) == 1:
        if "$dt" in v:
            return datetime.fromisoformat(v["$dt"])
        if "$d" in v:
            return date.fromisoformat(v["$d"])
        if "$bytes" in v:
            return base64.b64decode(v["$bytes"])
        if "$dec" in v:
            return Decimal(v["$dec"])
    return v


def _canonical(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")


def _tables_hash(tables: dict) -> str:
    return hashlib.sha256(_canonical(tables)).hexdigest()


def encode_backup(payload: dict) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
    return gzip.compress(raw, compresslevel=6)


def decode_backup(raw: bytes) -> dict:
    """Accepts gzip-compressed or plain JSON backups (current and older ones)."""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def verify_payload(payload: dict) -> dict:
    """Raise ValueError if the backup is damaged. Returns a short report."""
    if payload.get("format") != FORMAT_VERSION:
        # format 1 (cases / leads / app_config) has no integrity hash — only check it is well-formed
        if "cases" not in payload and "leads" not in payload:
            raise ValueError("Unknown backup format")
        return {"format": 1, "tables": {"cases": len(payload.get("cases", [])), "leads": len(payload.get("leads", []))}}
    tables = payload.get("tables")
    if not isinstance(tables, dict) or not tables:
        raise ValueError("Backup has no tables")
    expected = (payload.get("integrity") or {}).get("tables_sha256")
    if not expected:
        raise ValueError("Backup has no integrity hash")
    if _tables_hash(tables) != expected:
        raise ValueError("Integrity hash mismatch — the backup file is damaged or was modified")
    counts = payload.get("counts", {})
    for name, rows in tables.items():
        if counts.get(name) is not None and counts[name] != len(rows):
            raise ValueError(f"Row count mismatch in table {name}: header {counts[name]} vs {len(rows)} rows")
    return {"format": FORMAT_VERSION, "tables": {n: len(r) for n, r in tables.items()}}


# ══ Dump ═════════════════════════════════════════════════════════════════════════════════════════════

def build_backup_payload(engine=None) -> dict:
    """Complete, consistent dump of EVERY table."""
    eng = engine or default_engine
    conn = eng.connect()
    if eng.dialect.name == "postgresql":
        conn = conn.execution_options(isolation_level="REPEATABLE READ")  # one consistent snapshot
    try:
        tables, counts, schema, live_counts = {}, {}, {}, {}
        sorted_tables = Base.metadata.sorted_tables
        for t in sorted_tables:
            rows = conn.execute(select(t)).mappings().all()
            tables[t.name] = [{k: _ser(v) for k, v in r.items()} for r in rows]
            counts[t.name] = len(rows)
            schema[t.name] = [c.name for c in t.columns]
        # verify against COUNT(*) taken inside the same snapshot
        for t in sorted_tables:
            live_counts[t.name] = conn.execute(select(func.count()).select_from(t)).scalar() or 0
        mismatch = {n: (counts[n], live_counts[n]) for n in counts if counts[n] != live_counts[n]}
        if mismatch:
            raise RuntimeError(f"Dump is incomplete (rows read vs COUNT): {mismatch}")
    finally:
        conn.close()
    return {
        "format": FORMAT_VERSION,
        "app": "exodikastikos",
        "exported_at": datetime.utcnow().isoformat(),
        "db_dialect": eng.dialect.name,
        "case_count": counts.get("cases", 0),
        "lead_count": counts.get("leads", 0),
        "counts": counts,
        "schema": schema,
        "integrity": {"algo": "sha256", "tables_sha256": _tables_hash(tables)},
        "tables": tables,
    }


# ══ Status, alerts ═══════════════════════════════════════════════════════════════════════════════════

def _get_status(key: str) -> dict:
    db: Session = SessionLocal()
    try:
        row = db.query(AppConfig).filter(AppConfig.key == key).first()
        return json.loads(row.value) if row and row.value else {}
    except Exception:
        return {}
    finally:
        db.close()


def _set_status(key: str, value: dict) -> None:
    db: Session = SessionLocal()
    try:
        row = db.query(AppConfig).filter(AppConfig.key == key).first()
        text_value = json.dumps(value, ensure_ascii=False)
        if row:
            row.value = text_value
        else:
            db.add(AppConfig(key=key, value=text_value))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[Backup] could not store status {key}: {e}")
    finally:
        db.close()


def _alert(subject: str, body: str) -> None:
    """Email the admin. Never raises."""
    try:
        from routers.leads import _send_gmail
        admin_email = os.getenv("ADMIN_EMAIL", "info@i-mentor.gr")
        ok, err = _send_gmail(admin_email, subject, body)
        if not ok:
            logger.error(f"[Backup] alert email failed: {err}")
    except Exception as e:
        logger.error(f"[Backup] alert email failed: {e}")


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


# ══ Local copy ═══════════════════════════════════════════════════════════════════════════════════════

def _local_dir() -> pathlib.Path:
    configured = os.getenv("BACKUP_LOCAL_DIR", "").strip()
    for candidate in ([configured] if configured else []) + ["/data/backups", "./backups"]:
        try:
            p = pathlib.Path(candidate)
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".write-test"
            probe.write_text("ok")
            probe.unlink()
            return p
        except Exception:
            continue
    raise RuntimeError("No writable local backup directory")


def _write_local(filename: str, data: bytes, sha256: str) -> pathlib.Path:
    d = _local_dir()
    final = d / filename
    tmp = d / (filename + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(final)  # atomic
    # verify what is really on disk
    on_disk = final.read_bytes()
    if hashlib.sha256(on_disk).hexdigest() != sha256:
        final.unlink(missing_ok=True)
        raise RuntimeError("Local backup verification failed (hash mismatch after write)")
    return final


def _prune_local() -> int:
    d = _local_dir()
    files = sorted(
        [f for f in d.glob(BACKUP_PREFIX + "*") if f.is_file()],
        key=lambda f: f.stat().st_mtime, reverse=True,
    )
    cutoff = datetime.utcnow() - timedelta(days=LOCAL_RETENTION_DAYS)
    pruned = 0
    for f in files[LOCAL_KEEP_NEWEST:]:
        try:
            if datetime.utcfromtimestamp(f.stat().st_mtime) < cutoff:
                f.unlink()
                pruned += 1
        except Exception:
            pass
    return pruned


# ══ Backup run ═══════════════════════════════════════════════════════════════════════════════════════

def run_backup() -> dict:
    """Full backup: dump → verify → local copy → Google Drive upload → verify → status → alert on failure."""
    started = _now_iso()
    errors = []
    result = {
        "ok": False, "filename": None, "case_count": 0, "lead_count": 0, "counts": {},
        "size_bytes": 0, "sha256": None,
        "local_backup": None, "local_error": None, "local_pruned": 0,
        "drive_backup": None, "drive_error": None, "drive_verified": False,
    }
    status = _get_status(STATUS_KEY)
    status.update({"last_run_at": started, "last_ok": False})

    try:
        payload = _with_retries(build_backup_payload, attempts=2, delays=(3,))
        data = encode_backup(payload)
        sha256 = hashlib.sha256(data).hexdigest()
        filename = f"{BACKUP_PREFIX}{datetime.utcnow().strftime('%Y-%m-%d_%H-%M')}.json.gz"
        result.update(filename=filename, case_count=payload["case_count"], lead_count=payload["lead_count"],
                      counts=payload["counts"], size_bytes=len(data), sha256=sha256)
        # the backup must be restorable: decode it back and check integrity before it is trusted
        verify_payload(decode_backup(data))
    except Exception as e:
        errors.append(f"dump: {e}")
        status.update({"last_error": "; ".join(errors)})
        _set_status(STATUS_KEY, status)
        _alert("🚨 BACKUP FAILED: δεν δημιουργήθηκε backup",
               f"Το backup της βάσης απέτυχε στο στάδιο της δημιουργίας.\n\nΣφάλμα: {e}\nΏρα (UTC): {started}\n")
        result["error"] = "; ".join(errors)
        return result

    # ── local copy ──
    try:
        path = _write_local(filename, data, sha256)
        result["local_backup"] = str(path)
        result["local_pruned"] = _prune_local()
        status["last_local_ok_at"] = _now_iso()
    except Exception as e:
        result["local_error"] = str(e)
        errors.append(f"local: {e}")

    # ── Google Drive ──
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if not folder_id:
        result["drive_error"] = "GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured"
        errors.append("drive: GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured")
    else:
        try:
            svc = _get_drive_service()
            props = {"sha256": sha256, "format": FORMAT_VERSION, "cases": result["case_count"], "leads": result["lead_count"]}
            uploaded = _with_retries(lambda: _drive_upload(svc, folder_id, filename, data, props))
            local_md5 = hashlib.md5(data).hexdigest()
            if uploaded.get("md5Checksum") != local_md5 or int(uploaded.get("size", -1)) != len(data):
                raise RuntimeError(
                    f"Drive verification failed: md5 {uploaded.get('md5Checksum')} vs {local_md5}, "
                    f"size {uploaded.get('size')} vs {len(data)}")
            result["drive_backup"] = uploaded.get("id")
            result["drive_verified"] = True
            status.update({"last_drive_ok_at": _now_iso(), "drive_file_id": uploaded.get("id")})
        except Exception as e:
            result["drive_error"] = str(e)
            errors.append(f"drive: {e}")

    result["ok"] = not errors
    status.update({
        "last_ok": result["ok"], "filename": filename, "size_bytes": len(data), "sha256": sha256,
        "counts": result["counts"], "last_error": "; ".join(errors),
    })
    _set_status(STATUS_KEY, status)

    if errors:
        _alert(
            "🚨 BACKUP PROBLEM: το backup δεν ολοκληρώθηκε σωστά",
            "Το αυτόματο backup ολοκληρώθηκε με σφάλματα:\n\n" + "\n".join(f"• {e}" for e in errors) +
            f"\n\nΑρχείο: {filename}\nΏρα (UTC): {started}\n\n"
            "Έλεγξε τη σύνδεση με το Google Drive (/admin/drive-check) και τρέξε ξανά το backup (/admin/backup-now).",
        )
        logger.error(f"[Backup] finished with errors: {errors}")
    return result


# ══ Watchdog + restore drill ═════════════════════════════════════════════════════════════════════════

def check_backup_freshness(max_age_hours: int = MAX_BACKUP_AGE_HOURS) -> dict:
    """Alert if the last VERIFIED Drive backup is older than `max_age_hours` (or never happened)."""
    status = _get_status(STATUS_KEY)
    last = status.get("last_drive_ok_at")
    age_h = None
    if last:
        try:
            age_h = (datetime.utcnow() - datetime.fromisoformat(last)).total_seconds() / 3600
        except Exception:
            age_h = None
    stale = age_h is None or age_h > max_age_hours
    if stale:
        _alert(
            "🚨 BACKUP STALE: δεν υπάρχει πρόσφατο backup στο Drive",
            f"Το τελευταίο επιβεβαιωμένο backup στο Google Drive είναι "
            f"{'ΑΓΝΩΣΤΟ' if age_h is None else f'{age_h:.0f} ώρες πριν'} (όριο {max_age_hours} ώρες).\n"
            f"Τελευταίο σφάλμα: {status.get('last_error') or '—'}\n\n"
            "Τρέξε χειροκίνητα /admin/backup-now και έλεγξε /admin/drive-check.",
        )
    return {"stale": stale, "age_hours": age_h, "last_drive_ok_at": last}


def download_latest_from_drive() -> tuple:
    """Newest backup in the Drive folder → (file_meta, bytes), MD5-verified against Drive's own checksum."""
    folder_id = os.getenv("GOOGLE_DRIVE_BACKUP_FOLDER_ID", "").strip()
    if not folder_id:
        raise RuntimeError("GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured")
    svc = _get_drive_service()
    files = _drive_list_backups(svc, folder_id, limit=5)
    if not files:
        raise RuntimeError("No backup found in the Drive folder")
    meta = files[0]
    data = _with_retries(lambda: _drive_download(svc, meta["id"]))
    if meta.get("md5Checksum") and hashlib.md5(data).hexdigest() != meta["md5Checksum"]:
        raise RuntimeError("Downloaded backup does not match Drive's MD5 checksum")
    return meta, data


def run_restore_drill() -> dict:
    """Prove the newest Drive backup can really be restored: download → verify → restore into a throw-away
    SQLite database → compare the row count of every table. The live database is never touched."""
    from sqlalchemy import create_engine
    report = {"ran_at": _now_iso(), "ok": False}
    try:
        meta, data = download_latest_from_drive()
        payload = decode_backup(data)
        check = verify_payload(payload)
        if payload.get("format") != FORMAT_VERSION:
            raise RuntimeError("Newest backup is in the old format (no full restore possible)")
        scratch = create_engine("sqlite://")  # in-memory
        Base.metadata.create_all(scratch)
        restore_from_payload(payload, wipe_first=True, engine=scratch)
        with scratch.connect() as conn:
            restored = {t.name: conn.execute(select(func.count()).select_from(t)).scalar() or 0
                        for t in Base.metadata.sorted_tables if t.name in payload["counts"]}
        bad = {n: (payload["counts"][n], restored.get(n)) for n in payload["counts"] if restored.get(n) != payload["counts"][n]}
        if bad:
            raise RuntimeError(f"Restore drill row-count mismatch: {bad}")
        report.update(ok=True, file=meta.get("name"), created=meta.get("createdTime"), tables=len(restored),
                      rows=sum(restored.values()), cases=restored.get("cases", 0), leads=restored.get("leads", 0),
                      verified=check["format"])
    except Exception as e:
        report["error"] = str(e)
        _alert("🚨 BACKUP RESTORE TEST FAILED",
               f"Το εβδομαδιαίο τεστ επαναφοράς απέτυχε — το backup ΜΠΟΡΕΙ ΝΑ ΜΗΝ είναι αξιοποιήσιμο.\n\nΣφάλμα: {e}\n"
               "Τρέξε άμεσα /admin/backup-now και ξανά /admin/backup-verify.")
    _set_status(DRILL_KEY, report)
    return report


# ══ Restore ══════════════════════════════════════════════════════════════════════════════════════════

def snapshot_before_restore() -> str:
    """Safety net before a destructive restore: write the CURRENT database to the local volume."""
    payload = build_backup_payload()
    data = encode_backup(payload)
    name = f"{BACKUP_PREFIX}PRE-RESTORE_{datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')}.json.gz"
    return str(_write_local(name, data, hashlib.sha256(data).hexdigest()))


def _reset_pg_sequences(conn) -> None:
    for t in Base.metadata.sorted_tables:
        pk = list(t.primary_key.columns)
        if len(pk) == 1 and pk[0].autoincrement is not False and str(pk[0].type).upper().startswith("INT"):
            c = pk[0].name
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{t.name}', '{c}'), "
                f"COALESCE((SELECT MAX({c}) FROM {t.name}), 1), true)"
            ))


def restore_from_payload(payload: dict, wipe_first: bool = False, dry_run: bool = False, engine=None) -> dict:
    """
    Restore a backup (all tables, one transaction).

    wipe_first=False  →  merge: rows with an existing primary key are overwritten, missing rows are inserted,
                         rows that exist only in the database are kept
    wipe_first=True   →  the tables contained in the backup are emptied first (full reset)
    dry_run=True      →  does everything and rolls back; returns what WOULD happen

    Old format-1 backups (cases / leads / app_config only) are handled by the legacy path.
    """
    if payload.get("format") != FORMAT_VERSION:
        return _restore_legacy(payload, wipe_first=wipe_first, dry_run=dry_run)

    verify_payload(payload)
    eng = engine or default_engine
    by_name = {t.name: t for t in Base.metadata.sorted_tables}
    ordered = [by_name[n] for n in by_name if n in payload["tables"]]
    unknown = [n for n in payload["tables"] if n not in by_name]

    conn = eng.connect()
    trans = conn.begin()
    summary = {}
    try:
        if wipe_first:
            for t in reversed(ordered):
                conn.execute(delete(t))
        for t in ordered:
            pk_cols = list(t.primary_key.columns)
            existing = set()
            if not wipe_first and pk_cols:
                existing = {tuple(r) for r in conn.execute(select(*pk_cols)).all()}
            inserted = updated = 0
            groups = {}
            for raw in payload["tables"][t.name]:
                vals = {c.name: _deser(c, raw[c.name]) for c in t.columns if c.name in raw}
                key = tuple(vals.get(c.name) for c in pk_cols)
                if pk_cols and key in existing:
                    conn.execute(
                        update(t).where(*[c == vals[c.name] for c in pk_cols])
                        .values({k: v for k, v in vals.items() if k not in {c.name for c in pk_cols}} or {pk_cols[0].name: vals[pk_cols[0].name]})
                    )
                    updated += 1
                else:
                    groups.setdefault(tuple(sorted(vals)), []).append(vals)
            for rows in groups.values():
                conn.execute(insert(t), rows)
                inserted += len(rows)
            summary[t.name] = {"inserted": inserted, "updated": updated}
        if eng.dialect.name == "postgresql":
            _reset_pg_sequences(conn)
        if dry_run:
            trans.rollback()
        else:
            trans.commit()
    except Exception:
        trans.rollback()
        raise
    finally:
        conn.close()

    return {
        "ok": True, "format": FORMAT_VERSION, "dry_run": dry_run, "wiped_first": wipe_first,
        "tables": summary, "ignored_tables": unknown,
        # compatibility with the old response shape
        "cases_inserted": summary.get("cases", {}).get("inserted", 0), "cases_updated": summary.get("cases", {}).get("updated", 0),
        "leads_inserted": summary.get("leads", {}).get("inserted", 0), "leads_updated": summary.get("leads", {}).get("updated", 0),
    }


def _restore_legacy(payload: dict, wipe_first: bool = False, dry_run: bool = False) -> dict:
    """Format-1 backups: cases, leads and app_config only."""
    db: Session = SessionLocal()
    try:
        if wipe_first:
            db.query(Case).delete()
            db.query(Lead).delete()
            db.query(AppConfig).delete()
            db.flush()

        def _dt(v):
            if not v:
                return None
            try:
                return datetime.fromisoformat(v)
            except Exception:
                return None

        inserted_cases = updated_cases = inserted_leads = updated_leads = 0

        for c in payload.get("cases", []):
            existing = db.query(Case).filter(Case.id == c["id"]).first()
            fields = dict(
                client_name=c.get("client_name", ""), client_phone=c.get("client_phone", ""),
                client_email=c.get("client_email", ""), client_vat=c.get("client_vat"),
                employee=c.get("employee", ""), status=c.get("status", "draft"),
                debtor_type=c.get("debtor_type", "Φυσικό Πρόσωπο"), debts=c.get("debts", []),
                assets=c.get("assets", []), income_data=c.get("income_data", {}),
                estimates=c.get("estimates", {}), actual_results=c.get("actual_results"),
                notes=c.get("notes", ""), share_token=c.get("share_token", ""),
                portal_active=c.get("portal_active", True), contact_stage=c.get("contact_stage", "Νέα Ανάλυση"),
                last_contacted_at=_dt(c.get("last_contacted_at")), reminder_count=c.get("reminder_count", 0),
                commercial_offer=c.get("commercial_offer", {}), portal_visit_count=c.get("portal_visit_count", 0),
                portal_visits=c.get("portal_visits", []), created_at=_dt(c.get("created_at")),
                updated_at=_dt(c.get("updated_at")), submitted_at=_dt(c.get("submitted_at")),
                completed_at=_dt(c.get("completed_at")), stage_changed_at=_dt(c.get("stage_changed_at")),
            )
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated_cases += 1
            else:
                db.add(Case(id=c["id"], **fields))
                inserted_cases += 1

        for l in payload.get("leads", []):
            existing = db.query(Lead).filter(Lead.id == l["id"]).first()
            fields = dict(
                sheet_row_num=l.get("sheet_row_num"), status=l.get("status", ""), status_raw=l.get("status_raw", ""),
                assigned_to=l.get("assigned_to", ""), date=l.get("date", ""), name=l.get("name", ""),
                phone=l.get("phone", ""), email=l.get("email", ""), total_debt=l.get("total_debt", ""),
                offer_sent=l.get("offer_sent", False), offer_sent_date=l.get("offer_sent_date", ""),
                offer_amount=l.get("offer_amount", ""), success_fee=l.get("success_fee", ""),
                referrer=l.get("referrer", ""), service_type=l.get("service_type", ""),
                application_number=l.get("application_number", ""), app_comments=l.get("app_comments", []),
                app_next_call=_dt(l.get("app_next_call")), linked_case_id=l.get("linked_case_id"),
                taxisnet_username=l.get("taxisnet_username", ""), taxisnet_password=l.get("taxisnet_password", ""),
                created_at=_dt(l.get("created_at")), updated_at=_dt(l.get("updated_at")),
            )
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated_leads += 1
            else:
                db.add(Lead(id=l["id"], **fields))
                inserted_leads += 1

        for cfg in payload.get("app_config", []):
            existing = db.query(AppConfig).filter(AppConfig.key == cfg["key"]).first()
            if existing:
                existing.value = cfg["value"]
            else:
                db.add(AppConfig(key=cfg["key"], value=cfg["value"]))

        if dry_run:
            db.rollback()
        else:
            db.commit()
        return {
            "ok": True, "format": 1, "dry_run": dry_run, "wiped_first": wipe_first,
            "cases_inserted": inserted_cases, "cases_updated": updated_cases,
            "leads_inserted": inserted_leads, "leads_updated": updated_leads,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
