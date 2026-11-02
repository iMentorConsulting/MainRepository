import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    bank           TEXT    NOT NULL,
    account        TEXT    NOT NULL DEFAULT '',
    tx_date        TEXT    NOT NULL,           -- ISO yyyy-mm-dd
    amount_cents   INTEGER NOT NULL,           -- >0 credit (πίστωση), <0 debit (χρέωση)
    currency       TEXT    NOT NULL DEFAULT 'EUR',
    description    TEXT    NOT NULL DEFAULT '',
    counterparty   TEXT    NOT NULL DEFAULT '',
    direction      TEXT    NOT NULL CHECK (direction IN ('credit','debit')),
    fingerprint    TEXT    NOT NULL UNIQUE,
    category       TEXT    NOT NULL DEFAULT '',
    note           TEXT    NOT NULL DEFAULT '',
    invoice_issued INTEGER,                    -- NULL = not marked yet, 1 = yes, 0 = no
    seen           INTEGER NOT NULL DEFAULT 0,
    notified       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions (tx_date DESC);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect(path: Path) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def kv_get(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def kv_set(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO kv(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
