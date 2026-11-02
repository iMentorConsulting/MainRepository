"""Imports statement files dropped in data/inbox/<bank>/ (alpha, piraeus, eurobank)."""
import logging
import shutil
import time
from pathlib import Path

from . import db
from .categorize import load_rules
from .config import BANKS, get_settings
from .ingest import ingest
from .notify import get_notifier
from .parsers import ParseError, parse_statement

log = logging.getLogger("bank-monitor.watcher")
EXTENSIONS = {".csv", ".txt", ".sta", ".mt940", ".940", ".tsv"}


def ensure_dirs(inbox: Path) -> None:
    for b in BANKS:
        (inbox / b).mkdir(parents=True, exist_ok=True)


def scan_once(settings=None) -> list[dict]:
    settings = settings or get_settings()
    ensure_dirs(settings.inbox_dir)
    conn = db.connect(settings.db_path)
    notifier, rules, results = get_notifier(settings, conn), load_rules(settings.data_dir), []
    try:
        for bank in BANKS:
            folder = settings.inbox_dir / bank
            for f in sorted(folder.iterdir()):
                if not f.is_file() or f.suffix.lower() not in EXTENSIONS:
                    continue
                if time.time() - f.stat().st_mtime < 2:  # still being written
                    continue
                try:
                    res = ingest(conn, bank, parse_statement(f.read_bytes()), notifier, settings, rules)
                    target = folder / "processed"
                    results.append(dict(file=f.name, bank=bank, **res))
                except (ParseError, ValueError) as e:
                    log.error("%s: %s", f, e)
                    target = folder / "failed"
                    results.append(dict(file=f.name, bank=bank, error=str(e)))
                target.mkdir(exist_ok=True)
                shutil.move(str(f), target / f"{int(time.time())}_{f.name}")
    finally:
        conn.close()
    return results
