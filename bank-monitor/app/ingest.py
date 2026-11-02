"""Store parsed rows, skip duplicates, categorize, and notify about NEW credits."""
import hashlib
import logging
from collections import Counter
from datetime import date, timedelta

from .categorize import categorize
from .config import BANKS

log = logging.getLogger("bank-monitor.ingest")


def format_eur(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    euros, rem = divmod(abs(cents), 100)
    return f"{sign}{euros:,}".replace(",", ".") + f",{rem:02d} €"


def _fingerprint(bank, row, n):
    base = "|".join([bank, row.get("account", ""), row["tx_date"], str(row["amount_cents"]),
                     " ".join(row.get("description", "").upper().split()), str(n)])
    return hashlib.sha256(base.encode()).hexdigest()


def ingest(conn, bank: str, rows: list[dict], notifier, settings, rules=None, today: date | None = None) -> dict:
    if bank not in BANKS:
        raise ValueError(f"unknown bank {bank!r}")
    today = today or date.today()
    seen_in_batch: Counter = Counter()
    new_rows = []
    for row in rows:
        # identical rows (same day/amount/text) are legitimate; count occurrences within the file
        key = (row.get("account", ""), row["tx_date"], row["amount_cents"], " ".join(row.get("description", "").upper().split()))
        seen_in_batch[key] += 1
        fp = _fingerprint(bank, row, seen_in_batch[key])
        cents = row["amount_cents"]
        cur = conn.execute(
            "INSERT OR IGNORE INTO transactions (bank, account, tx_date, amount_cents, currency, description,"
            " counterparty, direction, fingerprint, category) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (bank, row.get("account", ""), row["tx_date"], cents, row.get("currency", "EUR"),
             row.get("description", ""), row.get("counterparty", ""),
             "credit" if cents > 0 else "debit", fp,
             categorize(row.get("description", ""), row.get("counterparty", ""), rules)),
        )
        if cur.rowcount:
            new_rows.append((cur.lastrowid, row))
    conn.commit()

    cutoff = (today - timedelta(days=settings.notify_max_age_days)).isoformat()
    to_notify = [(i, r) for i, r in new_rows
                 if r["tx_date"] >= cutoff and (r["amount_cents"] > 0 or settings.notify_debits)]
    notify_error = ""
    if to_notify:
        try:
            notifier.send(build_message(bank, [r for _, r in to_notify]))
            conn.executemany("UPDATE transactions SET notified = 1 WHERE id = ?", [(i,) for i, _ in to_notify])
            conn.commit()
        except Exception as e:  # never lose an import because Viber is down
            notify_error = str(e)
            log.error("notification failed: %s", e)
    return dict(new=len(new_rows), duplicates=len(rows) - len(new_rows),
                notified=0 if notify_error else len(to_notify), notify_error=notify_error)


def build_message(bank: str, rows: list[dict], max_lines: int = 8) -> str:
    credits = [r for r in rows if r["amount_cents"] > 0]
    debits = [r for r in rows if r["amount_cents"] < 0]
    head = f"💰 {BANKS[bank]}: " + (f"{len(credits)} νέες πιστώσεις" if len(credits) != 1 else "νέα πίστωση")
    if debits:
        head += f", {len(debits)} νέες χρεώσεις"
    lines = [head]
    for r in sorted(rows, key=lambda r: -abs(r["amount_cents"]))[:max_lines]:
        who = r.get("counterparty") or r.get("description", "")
        sign = "+" if r["amount_cents"] > 0 else ""
        lines.append(f"{sign}{format_eur(r['amount_cents'])} · {r['tx_date']} · {who[:60]}")
    if len(rows) > max_lines:
        lines.append(f"… και {len(rows) - max_lines} ακόμη")
    if len(credits) > 1:
        lines.append(f"Σύνολο πιστώσεων: {format_eur(sum(r['amount_cents'] for r in credits))}")
    return "\n".join(lines)
