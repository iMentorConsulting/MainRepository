import imaplib
import email
import re
import ssl
from datetime import date, timedelta
from email.header import decode_header
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import GuestPortalSettings, Booking, Customer, Unit, GuestCommunication
from auth_utils import get_tenant

router = APIRouter(prefix="/email-scan", tags=["email-scan"])

# OTA sender domains
OTA_SENDERS = {
    "airbnb": ["airbnb.com"],
    "booking": ["booking.com"],
    "vrbo": ["vrbo.com", "homeaway.com", "expedia.com"],
}


def _decode_str(val):
    if not val:
        return ""
    parts = decode_header(val)
    result = []
    for b, enc in parts:
        if isinstance(b, bytes):
            result.append(b.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(b)
    return "".join(result)


def _get_body(msg) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                try:
                    body += part.get_payload(decode=True).decode("utf-8", errors="replace")
                except Exception:
                    pass
            elif ct == "text/html" and not body:
                try:
                    raw = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    body += re.sub(r"<[^>]+>", " ", raw)
                except Exception:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
        except Exception:
            pass
    return body


def _clean_preview(body: str) -> str:
    """Extract meaningful preview text — skip tracking URLs and empty lines."""
    lines = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('%') or line.startswith('http') or line.startswith('//'):
            continue
        if re.match(r'^https?://', line) or re.match(r'^\s*https?://', line):
            continue
        if len(line) < 3:
            continue
        lines.append(line)
    return " | ".join(lines[:5])[:400] if lines else body[:200].strip()


def _extract_booking_com(body: str, subject: str) -> dict:
    data = {}
    # Guest name
    m = re.search(r"(?:Guest name|Name|Guest)[\s:]+([A-Za-zÀ-ÿ\s\-']+?)(?:\n|Email|Phone|Check)", body, re.IGNORECASE)
    if m:
        parts = m.group(1).strip().split()
        if len(parts) >= 2:
            data["first_name"] = parts[0]
            data["last_name"] = " ".join(parts[1:])
    # Email
    m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body)
    if m:
        addr = m.group(0)
        if "booking.com" not in addr and "airbnb.com" not in addr:
            data["email"] = addr
    # Phone
    m = re.search(r"(?:Phone|Mobile|Tel)[^\d+]*(\+?[\d\s\-().]{7,20})", body, re.IGNORECASE)
    if m:
        data["phone"] = re.sub(r"[\s\-()]", "", m.group(1))
    # Dates
    date_pat = r"(\d{1,2}[\s/\-]\w+[\s/\-]\d{4}|\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s*\d{4})"
    dates = re.findall(date_pat, body)
    if len(dates) >= 2:
        data["_raw_dates"] = dates[:2]
    return data


def _extract_email_address(header_val: str) -> str:
    """Extract bare email from 'Name <email>' or plain 'email' header value."""
    m = re.search(r"<([^>]+)>", header_val)
    return m.group(1).strip() if m else header_val.strip()


def _extract_airbnb(body: str, subject: str, reply_to: str) -> dict:
    data = {}
    # Extract relay email address from Reply-To header
    if reply_to and "reply.airbnb.com" in reply_to:
        data["reply_email"] = _extract_email_address(reply_to)
    # Guest name from subject e.g. "New message from John S."
    m = re.search(r"(?:from|by)\s+([A-Za-zÀ-ÿ][a-zA-ZÀ-ÿ\-']+(?:\s+[A-Z]\.?)?)", subject, re.IGNORECASE)
    if m:
        parts = m.group(1).strip().split()
        data["first_name"] = parts[0]
        if len(parts) > 1:
            data["last_name"] = parts[1].rstrip(".")
    # Reservation code
    m = re.search(r"(?:reservation|confirmation|κράτηση)[^\w]*([A-Z0-9]{8,12})", body, re.IGNORECASE)
    if m:
        data["reservation_code"] = m.group(1)
    # Guest name from body: appears before "Υπεύθυνος κράτησης" or "Responsible"
    # Use \s+ to handle both newlines and spaces (HTML-stripped bodies may use spaces)
    if not data.get("first_name") and not data.get("last_name"):
        m = re.search(r"([A-Za-zÀ-ÿ][a-zA-ZÀ-ÿ\-']+(?:\s+[A-Za-zÀ-ÿ][a-zA-ZÀ-ÿ\-']+)?)\s+(?:Υπεύθυνος κράτησης|Responsible for booking|Responsible)", body)
        if m:
            parts = m.group(1).strip().split()
            if len(parts) == 1:
                # Single word is almost always a surname (e.g. French/Greek guests)
                data["last_name"] = parts[0]
            else:
                data["first_name"] = parts[0]
                data["last_name"] = " ".join(parts[1:])
    # Dates from body — handles Greek month names (e.g. "21 Σεπτεμβρίου 2026")
    greek_month_pat = r"(\d{1,2}\s+(?:" + "|".join(_GREEK_MONTHS.keys()) + r")\s+\d{4})"
    greek_dates = re.findall(greek_month_pat, body, re.IGNORECASE)
    if len(greek_dates) >= 2:
        data["_raw_dates"] = greek_dates[:2]
    elif not data.get("_raw_dates"):
        date_pat = r"(\d{1,2}[\s/\-]\w+[\s/\-]\d{4}|\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s*\d{4}|\d{1,2}/\d{1,2}/\d{4})"
        dates = re.findall(date_pat, body)
        if len(dates) >= 2:
            data["_raw_dates"] = dates[:2]
    # NOTE: Airbnb does NOT include guest phone in confirmation emails — no phone extraction
    return data


_GREEK_MONTHS = {
    "ιανουαρίου": "January", "ιανουάριος": "January", "ιανουάριου": "January",
    "φεβρουαρίου": "February", "φεβρουάριος": "February",
    "μαρτίου": "March", "μάρτιος": "March",
    "απριλίου": "April", "απρίλιος": "April",
    "μαΐου": "May", "μάιος": "May", "μαιου": "May",
    "ιουνίου": "June", "ιούνιος": "June",
    "ιουλίου": "July", "ιούλιος": "July",
    "αυγούστου": "August", "αύγουστος": "August",
    "σεπτεμβρίου": "September", "σεπτέμβριος": "September",
    "οκτωβρίου": "October", "οκτώβριος": "October",
    "νοεμβρίου": "November", "νοέμβριος": "November",
    "δεκεμβρίου": "December", "δεκέμβριος": "December",
}

def _normalize_date_str(s: str) -> str:
    sl = s.lower().strip()
    for greek, english in _GREEK_MONTHS.items():
        if greek in sl:
            return sl.replace(greek, english).strip()
    return s.strip()

def _try_parse_date(s: str):
    from datetime import datetime
    s = _normalize_date_str(s)
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%B %d, %Y", "%B %d %Y", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except Exception:
            pass
    return None


def _match_booking(db: Session, tenant: str, check_in=None, check_out=None, unit_name: str = ""):
    """Find best-matching booking by dates and/or unit name."""
    q = db.query(Booking).filter(Booking.tenant == tenant)
    if check_in:
        q = q.filter(Booking.check_in == check_in)
    if check_out:
        q = q.filter(Booking.check_out == check_out)
    bookings = q.all()
    if not bookings:
        return None
    if len(bookings) == 1:
        return bookings[0]
    # Try to narrow by unit name
    if unit_name:
        units = db.query(Unit).filter(Unit.tenant == tenant).all()
        for u in units:
            if unit_name.lower() in u.name.lower() or u.name.lower() in unit_name.lower():
                for b in bookings:
                    if b.unit_id == u.id:
                        return b
    return bookings[0]


@router.post("/connect")
def save_imap(body: dict, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Save IMAP credentials and test connection."""
    imap_host = (body.get("imap_host") or "").strip()
    imap_user = (body.get("imap_user") or "").strip()
    imap_pass = (body.get("imap_pass") or "").strip()
    imap_port = int(body.get("imap_port") or 993)

    if not imap_host or not imap_user or not imap_pass:
        raise HTTPException(status_code=400, detail="imap_host, imap_user and imap_pass are required")

    # Test connection
    try:
        ctx = ssl.create_default_context()
        M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ctx)
        M.login(imap_user, imap_pass)
        M.logout()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"IMAP connection failed: {exc}")

    settings = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    if not settings:
        settings = GuestPortalSettings(tenant=tenant)
        db.add(settings)
    settings.imap_host = imap_host
    settings.imap_port = imap_port
    settings.imap_user = imap_user
    settings.imap_pass = imap_pass
    db.commit()
    return {"ok": True, "message": "Email connected successfully"}


@router.post("/scan")
def scan_emails(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    """Scan inbox for OTA booking emails and extract guest data."""
    settings = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    if not settings or not settings.imap_host:
        raise HTTPException(status_code=400, detail="Email not connected. Use POST /email-scan/connect first.")

    try:
        ctx = ssl.create_default_context()
        M = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port or 993, ssl_context=ctx)
        M.login(settings.imap_user, settings.imap_pass)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"IMAP error: {exc}")

    updated = 0
    skipped = 0
    errors = []
    log = []

    try:
        M.select("INBOX")
        # Search last 60 days
        since = (date.today() - timedelta(days=60)).strftime("%d-%b-%Y")
        for sender_domain in ["airbnb.com", "booking.com", "vrbo.com", "homeaway.com"]:
            _, data = M.search(None, f'(SINCE "{since}" FROM "@{sender_domain}")')
            ids = data[0].split()
            for num in ids[-50:]:  # max 50 per sender
                try:
                    _, raw = M.fetch(num, "(RFC822)")
                    msg = email.message_from_bytes(raw[0][1])
                    subject = _decode_str(msg.get("Subject", ""))
                    reply_to = msg.get("Reply-To", "") or msg.get("From", "")
                    body = _get_body(msg)

                    extracted = {}
                    channel = "direct"
                    if "airbnb.com" in sender_domain:
                        extracted = _extract_airbnb(body, subject, reply_to)
                        channel = "airbnb"
                    elif "booking.com" in sender_domain:
                        extracted = _extract_booking_com(body, subject)
                        channel = "booking"
                    elif "vrbo.com" in sender_domain or "homeaway.com" in sender_domain:
                        extracted = _extract_booking_com(body, subject)
                        channel = "vrbo"

                    if not extracted:
                        skipped += 1
                        log.append({"status": "skipped", "reason": "no data extracted", "subject": subject[:80], "channel": channel})
                        continue

                    # Try to match booking
                    check_in = check_out = None
                    if extracted.get("_raw_dates"):
                        check_in = _try_parse_date(extracted["_raw_dates"][0])
                        check_out = _try_parse_date(extracted["_raw_dates"][1])

                    # Skip if we can't identify which booking this belongs to
                    if not check_in and not check_out and not extracted.get("reservation_code"):
                        skipped += 1
                        log.append({"status": "skipped", "reason": "no dates or reservation code in email", "subject": subject[:80], "channel": channel, "extracted": {k: v for k, v in extracted.items() if not k.startswith("_")}})
                        continue

                    booking = _match_booking(db, tenant, check_in, check_out)
                    if not booking:
                        skipped += 1
                        log.append({"status": "skipped", "reason": "no matching booking", "subject": subject[:80], "channel": channel, "extracted": {k: v for k, v in extracted.items() if not k.startswith("_")}})
                        continue

                    changed = False
                    changes = []
                    customer = booking.customer
                    _PLACEHOLDER_NAMES = ("Beds24", "Unknown", "Guest", "", "Reserved Guest", "Reserved", "Airbnb Guest")

                    if extracted.get("first_name") and (not customer.first_name or customer.first_name in _PLACEHOLDER_NAMES):
                        changes.append(f"first_name: '{customer.first_name}' → '{extracted['first_name']}'")
                        customer.first_name = extracted["first_name"]
                        changed = True
                    if extracted.get("last_name") and (not customer.last_name or customer.last_name in _PLACEHOLDER_NAMES):
                        changes.append(f"last_name: '{customer.last_name}' → '{extracted['last_name']}'")
                        customer.last_name = extracted["last_name"]
                        changed = True
                    # Clear placeholder last_name ("Guest") when we have a new last_name but first_name update already covers the full name
                    if not extracted.get("last_name") and customer.last_name in _PLACEHOLDER_NAMES and extracted.get("first_name"):
                        changes.append(f"last_name: '{customer.last_name}' → ''")
                        customer.last_name = ""
                        changed = True
                    if extracted.get("email") and not customer.email:
                        changes.append(f"email: → '{extracted['email']}'")
                        customer.email = extracted["email"]
                        changed = True
                    if extracted.get("phone") and not customer.phone:
                        changes.append(f"phone: → '{extracted['phone']}'")
                        customer.phone = extracted["phone"]
                        changed = True
                    if extracted.get("reply_email") and not booking.reply_email:
                        changes.append(f"reply_email: → '{extracted['reply_email']}'")
                        booking.reply_email = extracted["reply_email"]
                        changed = True

                    # Always save communication record (deduplicate by subject+booking)
                    from datetime import datetime as dt
                    existing_comm = db.query(GuestCommunication).filter(
                        GuestCommunication.booking_id == booking.id,
                        GuestCommunication.subject == subject[:500],
                    ).first()
                    if existing_comm and existing_comm.body_preview and existing_comm.body_preview.startswith('%'):
                        # Old record with tracking URL preview — refresh it
                        existing_comm.body_preview = _clean_preview(body)
                        existing_comm.relay_email = extracted.get("reply_email") or booking.reply_email
                        changed = True
                    if not existing_comm:
                        comm = GuestCommunication(
                            tenant=tenant,
                            booking_id=booking.id,
                            channel=channel,
                            direction="in",
                            subject=subject[:500],
                            body_preview=_clean_preview(body),
                            relay_email=extracted.get("reply_email") or booking.reply_email,
                            sent_at=dt.utcnow(),
                        )
                        db.add(comm)
                        changed = True

                    if changed:
                        db.commit()
                        updated += 1
                        log.append({
                            "status": "updated",
                            "booking_id": booking.id,
                            "check_in": str(booking.check_in),
                            "check_out": str(booking.check_out),
                            "channel": channel,
                            "subject": subject[:80],
                            "changes": changes,
                        })
                    else:
                        skipped += 1
                        log.append({"status": "skipped", "reason": "already has data", "booking_id": booking.id, "check_in": str(booking.check_in), "subject": subject[:80]})

                except Exception as exc:
                    errors.append(str(exc)[:100])
                    log.append({"status": "error", "error": str(exc)[:100]})

    finally:
        try:
            M.logout()
        except Exception:
            pass

    return {"ok": True, "updated": updated, "skipped": skipped, "errors": errors, "log": log}


@router.get("/status")
def imap_status(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    settings = db.query(GuestPortalSettings).filter(GuestPortalSettings.tenant == tenant).first()
    return {
        "connected": bool(settings and settings.imap_host and settings.imap_user),
        "imap_host": settings.imap_host if settings else None,
        "imap_user": settings.imap_user if settings else None,
    }
