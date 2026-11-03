"""Meta Conversions API (server-side events) for ΕΞΩΔΙΚΑΣΤΙΚΟΣ.

When a lead reaches the agreed conversion milestone (status DEAL) one server-side event is sent to Meta so the
ad algorithm learns who actually converts. The access token is NEVER stored in the source: it is read from the
META_CAPI_TOKEN environment variable.

Environment variables
  META_CAPI_TOKEN            access token (required — without it nothing is sent)
  META_PIXEL_ID              pixel / dataset id (default: 1152400940658328)
  META_CAPI_EVENT_NAME       event name (default: Purchase)
  META_CAPI_ACTION_SOURCE    action_source (default: system_generated)
  META_CAPI_TEST_EVENT_CODE  optional Events Manager "Test events" code — while set, events appear only in the test tab
  META_CAPI_API_VERSION      Graph API version (default: v21.0)
"""
import hashlib
import logging
import os
import re
import time
from datetime import datetime

import requests

from phone_utils import normalize_greek_phone

logger = logging.getLogger(__name__)

DEFAULT_PIXEL_ID = "1152400940658328"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


# ── Normalization + hashing (Meta requires SHA-256 of the normalized value) ──────────────────────────────
def hash_email(email) -> str | None:
    e = (email or "").strip().lower()
    return _sha256(e) if "@" in e else None


def hash_phone(phone) -> str | None:
    """Greek phone → E.164 without '+', e.g. 6912345678 → 306912345678 → sha256."""
    p = normalize_greek_phone(phone or "")
    digits = p.lstrip("+")
    return _sha256(digits) if len(digits) >= 10 else None


def hash_name(name) -> str | None:
    n = (name or "").strip().lower()
    return _sha256(n) if n else None


def split_name(full_name) -> tuple[str, str]:
    """Return (first_name, last_name) from a single free-text name.

    The `name` of a lead is mixed: names typed by the agents are ALL-CAPS with the surname first
    («ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ»), while names that come from the Facebook form («First» + «Last» columns) are
    «first last». Rule: an ALL-CAPS name is read surname-first (fn = last token, ln = the rest);
    anything else is read first-last (fn = first token, ln = the rest). One word → first name only."""
    parts = [p for p in re.split(r"\s+", (full_name or "").strip()) if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    if full_name.strip().upper() == full_name.strip() and any(c.isalpha() for c in full_name):
        return parts[-1], " ".join(parts[:-1])
    return parts[0], " ".join(parts[1:])


def build_user_data(lead) -> dict:
    """Only the fields we have — missing ones are omitted."""
    # explicit First / Last from the sheet win over guessing from the free-text name
    first = (getattr(lead, "first_name", "") or "").strip()
    last = (getattr(lead, "last_name", "") or "").strip()
    if not first and not last:
        first, last = split_name(getattr(lead, "name", ""))
    data = {
        "em": [hash_email(getattr(lead, "email", ""))],
        "ph": [hash_phone(getattr(lead, "phone", ""))],
        "fn": [hash_name(first)],
        "ln": [hash_name(last)],
    }
    return {k: v for k, v in data.items() if v[0]}


def _offer_value(lead):
    """Numeric value of the deal if the lead has one (offer_amount), else None."""
    raw = str(getattr(lead, "offer_amount", "") or "").strip()
    if not raw:
        return None
    cleaned = raw.replace("€", "").replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        v = float(cleaned)
        return v if v >= 0 else None
    except ValueError:
        return None


def event_id_for(lead) -> str:
    # deterministic: a retry of the same conversion carries the same event_id, so Meta deduplicates it
    return f"exo-lead-{lead.id}-deal"


def build_event(lead, event_time: int | None = None) -> dict:
    event = {
        "event_name": os.getenv("META_CAPI_EVENT_NAME", "Purchase").strip() or "Purchase",
        "event_time": int(event_time if event_time is not None else time.time()),
        "event_id": event_id_for(lead),
        "action_source": os.getenv("META_CAPI_ACTION_SOURCE", "system_generated").strip() or "system_generated",
        "user_data": build_user_data(lead),
    }
    value = _offer_value(lead)
    # Purchase events require value + currency; fall back to 0 when the deal amount is unknown
    if event["event_name"] == "Purchase" or value is not None:
        event["custom_data"] = {"currency": "EUR", "value": value if value is not None else 0}
    return event


def send_event(event: dict) -> tuple[bool, str]:
    """POST one event to the Conversions API. Returns (ok, error_text)."""
    token = os.getenv("META_CAPI_TOKEN", "").strip()
    if not token:
        return False, "META_CAPI_TOKEN not configured"
    pixel = os.getenv("META_PIXEL_ID", DEFAULT_PIXEL_ID).strip() or DEFAULT_PIXEL_ID
    version = os.getenv("META_CAPI_API_VERSION", "v21.0").strip() or "v21.0"
    body = {"data": [event], "access_token": token}
    test_code = os.getenv("META_CAPI_TEST_EVENT_CODE", "").strip()
    if test_code:
        body["test_event_code"] = test_code
    try:
        r = requests.post(f"https://graph.facebook.com/{version}/{pixel}/events", json=body, timeout=15)
        if r.status_code == 200 and (r.json().get("events_received", 0) or 0) >= 1:
            return True, ""
        # never include the token in the error text
        return False, f"HTTP {r.status_code}: {r.text[:300]}".replace(token, "***")
    except Exception as e:  # network, timeout…
        return False, str(e)[:300].replace(token, "***")


def send_lead_conversion(lead_id: int) -> dict:
    """Send the DEAL conversion of a lead — once. Safe to call from a background task.
    Stores the outcome on the lead (capi_event_id / capi_sent_at / capi_error)."""
    from database import SessionLocal
    from models import Lead

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            return {"ok": False, "error": "lead not found"}
        if lead.capi_sent_at:
            return {"ok": True, "skipped": "already sent"}
        if not build_user_data(lead):
            lead.capi_error = "no matching data (email/phone/name)"
            db.commit()
            return {"ok": False, "error": lead.capi_error}
        event = build_event(lead)
        ok, err = send_event(event)
        lead.capi_event_id = event["event_id"]
        if ok:
            lead.capi_sent_at = datetime.utcnow()
            lead.capi_error = ""
            logger.info(f"[MetaCAPI] lead {lead.id}: event {event['event_name']} sent")
        else:
            lead.capi_error = err
            logger.warning(f"[MetaCAPI] lead {lead.id}: failed — {err}")
        db.commit()
        return {"ok": ok, "error": err}
    except Exception as e:
        db.rollback()
        logger.error(f"[MetaCAPI] unexpected error: {e}")
        return {"ok": False, "error": str(e)}
    finally:
        db.close()
