#!/usr/bin/env python3
"""Disaster-recovery restore that works even when the web app is down.

Usage (from the backend folder):

    # 1. look first: what would happen? (nothing is written)
    DATABASE_URL=postgresql://... python restore_backup.py Exodikastikos-backup_2026-11-07_15-00.json.gz --dry-run

    # 2. empty database / new Railway project  →  full restore
    DATABASE_URL=postgresql://... python restore_backup.py Exodikastikos-backup_2026-11-07_15-00.json.gz --wipe

    # merge into the current data instead (existing rows with the same id are overwritten, others kept)
    DATABASE_URL=postgresql://... python restore_backup.py FILE

    # take the newest backup straight from Google Drive (needs GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_BACKUP_FOLDER_ID)
    DATABASE_URL=postgresql://... python restore_backup.py --from-drive --wipe

The tables are created if they do not exist yet. Accepts .json.gz and plain .json backups (also the old format).
"""
import argparse
import os
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", nargs="?", help="backup file (.json.gz or .json)")
    ap.add_argument("--from-drive", action="store_true", help="download the newest backup from Google Drive")
    ap.add_argument("--wipe", action="store_true", help="empty the tables contained in the backup first (full reset)")
    ap.add_argument("--dry-run", action="store_true", help="do everything, then roll back — nothing is written")
    ap.add_argument("--database-url", help="overrides the DATABASE_URL environment variable")
    args = ap.parse_args()
    if not args.file and not args.from_drive:
        ap.error("give a backup file or --from-drive")
    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    import backup  # imported after DATABASE_URL is set
    from database import Base, engine

    if args.from_drive:
        meta, raw = backup.download_latest_from_drive()
        print(f"Downloaded from Drive: {meta.get('name')} ({len(raw):,} bytes)")
    else:
        with open(args.file, "rb") as f:
            raw = f.read()

    payload = backup.decode_backup(raw)
    report = backup.verify_payload(payload)
    print(f"Backup OK (format {report['format']}): " + ", ".join(f"{k}={v}" for k, v in report["tables"].items()))

    Base.metadata.create_all(engine)
    if args.wipe and not args.dry_run:
        answer = input(f"This EMPTIES the tables of {engine.url.render_as_string(hide_password=True)} first. Type YES to continue: ")
        if answer.strip() != "YES":
            print("Cancelled.")
            return 1
        try:
            print("Safety copy of the current database:", backup.snapshot_before_restore())
        except Exception as e:
            print(f"(could not write a safety copy: {e})")

    result = backup.restore_from_payload(payload, wipe_first=args.wipe, dry_run=args.dry_run)
    print("DRY RUN — nothing was written." if args.dry_run else "RESTORED.")
    for name, r in (result.get("tables") or {}).items():
        print(f"  {name:24s} inserted {r['inserted']:6d}   updated {r['updated']:6d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
