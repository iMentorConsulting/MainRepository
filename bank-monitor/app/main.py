import asyncio
import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from . import db, watcher
from .categorize import load_rules
from .config import BANKS, get_settings
from .ingest import ingest
from .notify import ViberNotifier, get_notifier, verify_viber_signature
from .parsers import ParseError, parse_statement

log = logging.getLogger("bank-monitor")
basic = HTTPBasic(auto_error=False)
STATIC = Path(__file__).parent / "static"


def require_auth(creds: HTTPBasicCredentials | None = Depends(basic)):
    password = get_settings().app_password
    if not password:
        return  # no password configured: local use only!
    if creds is None or not secrets.compare_digest(creds.password.encode(), password.encode()):
        raise HTTPException(401, "Unauthorized", headers={"WWW-Authenticate": "Basic"})


def get_conn():
    conn = db.connect(get_settings().db_path)
    try:
        yield conn
    finally:
        conn.close()


async def _poll_loop():
    while True:
        try:
            for r in await asyncio.to_thread(watcher.scan_once):
                log.info("inbox: %s", r)
        except Exception:
            log.exception("inbox scan failed")
        await asyncio.sleep(get_settings().poll_seconds)


@asynccontextmanager
async def lifespan(app):
    s = get_settings()
    if not s.app_password:
        log.warning("APP_PASSWORD is not set - the app is open to anyone who can reach it.")
    watcher.ensure_dirs(s.inbox_dir)
    task = asyncio.create_task(_poll_loop())
    yield
    task.cancel()


app = FastAPI(title="Bank Monitor", lifespan=lifespan)


@app.get("/", dependencies=[Depends(require_auth)])
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/banks", dependencies=[Depends(require_auth)])
def banks():
    return BANKS


@app.get("/api/transactions", dependencies=[Depends(require_auth)])
def list_transactions(direction: str = "", bank: str = "", unseen: bool = False,
                      no_invoice: bool = False, q: str = "", limit: int = 500,
                      conn=Depends(get_conn)):
    where, args = [], []
    if direction in ("credit", "debit"):
        where.append("direction = ?"); args.append(direction)
    if bank:
        where.append("bank = ?"); args.append(bank)
    if unseen:
        where.append("seen = 0")
    if no_invoice:
        where.append("direction = 'credit' AND invoice_issued IS NOT 1")
    if q:
        where.append("(description LIKE ? OR counterparty LIKE ? OR note LIKE ? OR category LIKE ?)")
        args += [f"%{q}%"] * 4
    sql = "SELECT * FROM transactions" + (" WHERE " + " AND ".join(where) if where else "")
    sql += " ORDER BY tx_date DESC, id DESC LIMIT ?"
    return [dict(r) for r in conn.execute(sql, (*args, min(limit, 2000)))]


@app.get("/api/summary", dependencies=[Depends(require_auth)])
def summary(conn=Depends(get_conn)):
    one = lambda sql: conn.execute(sql).fetchone()[0]
    return dict(
        new_credits=one("SELECT COUNT(*) FROM transactions WHERE direction='credit' AND seen=0"),
        new_debits=one("SELECT COUNT(*) FROM transactions WHERE direction='debit' AND seen=0"),
        credits_without_invoice=one(
            "SELECT COUNT(*) FROM transactions WHERE direction='credit' AND invoice_issued IS NOT 1"),
    )


class TxUpdate(BaseModel):
    note: str | None = None
    category: str | None = None
    invoice_issued: bool | None = None
    seen: bool | None = None


@app.patch("/api/transactions/{tx_id}", dependencies=[Depends(require_auth)])
def update_transaction(tx_id: int, body: TxUpdate, conn=Depends(get_conn)):
    sent = body.model_fields_set
    sets, args = [], []
    if "note" in sent and body.note is not None:
        sets.append("note = ?"); args.append(body.note)
    if "category" in sent and body.category is not None:
        sets.append("category = ?"); args.append(body.category)
    if "invoice_issued" in sent:  # null clears the mark
        sets.append("invoice_issued = ?"); args.append(None if body.invoice_issued is None else int(body.invoice_issued))
    if "seen" in sent and body.seen is not None:
        sets.append("seen = ?"); args.append(int(body.seen))
    if not sets:
        raise HTTPException(400, "nothing to update")
    cur = conn.execute(f"UPDATE transactions SET {', '.join(sets)} WHERE id = ?", (*args, tx_id))
    conn.commit()
    if not cur.rowcount:
        raise HTTPException(404, "not found")
    return dict(conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone())


@app.post("/api/mark-seen", dependencies=[Depends(require_auth)])
def mark_seen(direction: str = "", conn=Depends(get_conn)):
    if direction in ("credit", "debit"):
        conn.execute("UPDATE transactions SET seen = 1 WHERE direction = ?", (direction,))
    else:
        conn.execute("UPDATE transactions SET seen = 1")
    conn.commit()
    return {"ok": True}


@app.post("/api/import", dependencies=[Depends(require_auth)])
async def import_file(bank: str = Form(...), file: UploadFile = File(...), conn=Depends(get_conn)):
    if bank not in BANKS:
        raise HTTPException(400, f"bank must be one of {list(BANKS)}")
    settings = get_settings()
    try:
        rows = parse_statement(await file.read())
    except ParseError as e:
        raise HTTPException(422, str(e))
    return ingest(conn, bank, rows, get_notifier(settings, conn), settings, load_rules(settings.data_dir))


@app.post("/viber/webhook")
async def viber_webhook(request: Request, conn=Depends(get_conn)):
    """Viber calls this. Send the bot `/pair <VIBER_PAIR_CODE>` once so it learns your user id."""
    s = get_settings()
    if not s.viber_token:
        raise HTTPException(503, "VIBER_TOKEN not configured")
    body = await request.body()
    if not verify_viber_signature(s.viber_token, body, request.headers.get("X-Viber-Content-Signature", "")):
        raise HTTPException(403, "bad signature")
    event = json.loads(body or b"{}")
    if event.get("event") == "message":
        text = (event.get("message", {}).get("text") or "").strip()
        sender = event.get("sender", {}).get("id", "")
        if sender and s.viber_pair_code and text == f"/pair {s.viber_pair_code}":
            db.kv_set(conn, "viber_receiver", sender)
            ViberNotifier(s.viber_token, sender, s.viber_sender_name).send(
                "✅ Συνδέθηκε. Θα λαμβάνετε ειδοποίηση για κάθε νέα πίστωση.")
    return {"status": 0}
