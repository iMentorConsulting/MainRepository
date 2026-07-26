from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import Optional, Any
from pydantic import BaseModel
from datetime import datetime
from zoneinfo import ZoneInfo
import os
import requests as http_requests
import uuid

from database import get_db
from models import Case, Lead

_ATHENS = ZoneInfo("Europe/Athens")


def _now():
    return datetime.now(_ATHENS).replace(tzinfo=None)


router = APIRouter(prefix="/external", tags=["external"])

LOGISTIS_PORTAL_URL = "https://logistis.i-mentor.gr/api/external/exodikastikos"


def _require_portal_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.getenv("PORTAL_INCOMING_API_KEY", "")
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Μη έγκυρο API key")


def _require_sheets_webhook_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.getenv("SHEETS_WEBHOOK_SECRET", "")
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Μη έγκυρο API key")


@router.post("/leads-sync-now")
def leads_sync_now(db: Session = Depends(get_db), _=Depends(_require_sheets_webhook_key)):
    """Fired by Pabbly right after it appends a new Facebook-lead row to the
    Google Sheet, so the lead (and its Θέμις link) reach the app within
    seconds instead of waiting for the daily cron. Just the webhook endpoint
    for now — runs sync_leads() synchronously, same as the existing manual
    /leads/sync; no BackgroundTasks/concurrency-lock wiring or Pabbly-side
    trigger yet, those come once this is wired up and tested."""
    from sheets_sync import sync_leads
    try:
        return sync_leads(db, full=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class QuestionnaireExtra(BaseModel):
    id: Optional[str] = None
    label: Optional[str] = None
    answer: Optional[Any] = None


class PortalCaseIn(BaseModel):
    caseNumber: Optional[int] = None
    afm: Optional[str] = None
    onomasia: str
    clientType: Optional[str] = "INDIVIDUAL"
    email: Optional[str] = ""
    phone: Optional[str] = ""
    accountantOffice: Optional[str] = ""
    questionnaire: Optional[dict] = None
    notes: Optional[str] = ""
    hasSpouse: Optional[bool] = False
    taxisnetUsername: Optional[str] = None
    taxisnetPassword: Optional[str] = None
    spouseTaxisnetUsername: Optional[str] = None
    spouseTaxisnetPassword: Optional[str] = None
    callbackRef: str


@router.post("/cases", status_code=201)
def receive_portal_case(data: PortalCaseIn, db: Session = Depends(get_db), _=Depends(_require_portal_key)):
    """Inbound endpoint for the LOGISTIS Accountant Portal.
    Creates a pending case awaiting agent acceptance — does NOT start the
    15-day process until a human agent accepts it from the UI."""

    debtor_type = "Νομικό Πρόσωπο" if (data.clientType or "").upper() != "INDIVIDUAL" else "Φυσικό Πρόσωπο"

    notes = f"🔔 Νέα Ανάθεση Εξωδικαστικού"
    if data.caseNumber is not None:
        notes += f" #{data.caseNumber}"
    notes += f" από {data.accountantOffice or 'Λογιστικό Γραφείο'} (LOGISTIS)"
    if data.notes:
        notes += f"\n\n{data.notes}"

    case = Case(
        client_name=data.onomasia,
        client_phone=data.phone or "",
        client_email=data.email or "",
        client_vat=data.afm,
        employee="",
        status="pending_external",
        debtor_type=debtor_type,
        debts=[],
        assets=[],
        income_data={},
        estimates={},
        notes=notes,
        portal_active=True,
        contact_stage="Νέα Ανάλυση",
        commercial_offer={},
        external_source="logistis",
        external_ref=data.callbackRef,
        external_status="SUBMITTED",
        external_accepted=False,
        external_data=data.model_dump(),
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    return {"externalRef": str(case.id)}


class PortalUpdate(BaseModel):
    callbackRef: str
    status: str
    externalStatus: Optional[str] = None
    externalRef: Optional[str] = None
    resultLink: Optional[str] = None
    note: Optional[str] = None


def push_portal_update(callbackRef: str, status: str, externalStatus: str = None,
                        externalRef: str = None, resultLink: str = None, note: str = None) -> tuple[bool, str]:
    """Push a status update back to the LOGISTIS Accountant Portal."""
    api_key = os.getenv("EXODIKASTIKOS_API_KEY") or os.getenv("PORTAL_INCOMING_API_KEY", "")
    if not api_key:
        return False, "EXODIKASTIKOS_API_KEY not configured"
    payload = PortalUpdate(
        callbackRef=callbackRef,
        status=status,
        externalStatus=externalStatus,
        externalRef=externalRef,
        resultLink=resultLink,
        note=note,
    ).model_dump(exclude_none=True)
    try:
        resp = http_requests.put(
            LOGISTIS_PORTAL_URL,
            json=payload,
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code >= 400:
            return False, f"HTTP {resp.status_code}: {resp.text[:300]}"
        return True, "ok"
    except Exception as e:
        return False, str(e)


class CreateLeadRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    total_debt: Optional[str] = None
    service_type: Optional[str] = None
    referrer: Optional[str] = None
    sheet_comments: Optional[str] = None
    application_number: Optional[str] = None
    send_themis: Optional[bool] = False


def _normalize_email(email: str) -> str:
    """Normalize email addresses — auto-correct common typos and domain mistakes."""
    if not email:
        return email

    email = email.lower().strip()

    # Common email typos: domain mistakes, country code errors, etc.
    corrections = {
        # Country code typos: .fr → .gr, .con → .com
        '@yahoo.fr': '@yahoo.gr',
        '@gmail.fr': '@gmail.gr',
        '@hotmail.fr': '@hotmail.gr',
        '@outlook.fr': '@outlook.gr',
        '@ionline.fr': '@ionline.gr',
        '@in.fr': '@in.gr',
        '@mail.fr': '@mail.gr',
        '@live.fr': '@live.gr',
        '@gmail.con': '@gmail.com',
        '@hotmail.con': '@hotmail.com',
        '@outlook.con': '@outlook.com',
        '@yahoo.con': '@yahoo.com',
        # Domain name typos: gmial/gmai → gmail, yaho → yahoo
        '@gmial.com': '@gmail.com',
        '@gmai.com': '@gmail.com',
        '@mail.com': '@gmail.com',
        '@yaho.gr': '@yahoo.gr',
        '@yaho.com': '@yahoo.com',
    }

    for typo, correct in corrections.items():
        if typo in email:
            email = email.replace(typo, correct)

    return email


# Get next consultant in round-robin order
def _get_next_consultant(db: Session) -> str:
    """Auto-allocate to next consultant in rotation: STELLA → VALLIA → SOFIA"""
    from sqlalchemy import func
    consultants = ["STELLA", "VALLIA", "SOFIA"]

    # Count leads assigned to each consultant
    counts = {}
    for consultant in consultants:
        count = db.query(Lead).filter(Lead.assigned_to == consultant).count()
        counts[consultant] = count

    # Return consultant with fewest leads
    return min(consultants, key=lambda c: counts[c])


@router.post("/create-lead", status_code=201)
def create_lead_external(
    data: CreateLeadRequest,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None)
):
    """
    Public endpoint for ΛΟΓΙΣΤΗΣ Portal to create leads and get Θέμις chat link.

    Authentication: X-API-Key header (optional, but recommended)

    Auto-normalizes email addresses (corrects .fr → .gr typos, etc.)
    Prevents duplicate leads by checking for existing leads with same phone
    created within the last 60 seconds.

    Returns: {
        "id": lead_id,
        "name": "...",
        "assigned_to": "STELLA|VALLIA|SOFIA",
        "themis_token": "...",
        "themis_url": "https://portal.i-mentor.gr/themis/{token}",
        "status": "CALL"
    }
    """
    from sheets_sync import _normalize_status
    from sqlalchemy import and_

    # Optional API key validation (can be toggled via env var)
    if os.getenv("EXTERNAL_API_KEY_REQUIRED", "false").lower() == "true":
        expected = os.getenv("EXODIKASTIKOS_API_KEY", "")
        if not expected or x_api_key != expected:
            raise HTTPException(status_code=401, detail="Μη έγκυρο API key")

    # Normalize email — auto-correct common typos (.fr → .gr, etc.)
    normalized_email = _normalize_email(data.email) if data.email else ""
    phone = (data.phone or "").strip()

    # Idempotency check: if a lead with the same phone was created in the last 60 seconds,
    # return the existing lead instead of creating a duplicate
    if phone:
        recent_cutoff = _now() - __import__('datetime').timedelta(seconds=60)
        existing_lead = db.query(Lead).filter(
            and_(
                Lead.phone == phone,
                Lead.created_at >= recent_cutoff,
                Lead.sheet_row_num.is_(None),  # Only check externally-created leads
            )
        ).order_by(Lead.created_at.desc()).first()

        if existing_lead:
            frontend_url = os.getenv("FRONTEND_URL", "https://portal.i-mentor.gr").rstrip("/")
            themis_url = f"{frontend_url}/themis/{existing_lead.themis_token}"
            return {
                "id": existing_lead.id,
                "name": existing_lead.name,
                "phone": existing_lead.phone,
                "email": existing_lead.email,
                "assigned_to": existing_lead.assigned_to,
                "status": "CALL",
                "themis_token": existing_lead.themis_token,
                "themis_url": themis_url,
                "created_at": existing_lead.created_at.isoformat() if existing_lead.created_at else None,
                "duplicate": True,
            }

    # Auto-allocate to next consultant in round-robin
    assigned_to = _get_next_consultant(db)

    # Generate Θέμις token
    themis_token = str(uuid.uuid4())

    # Create lead
    lead = Lead(
        sheet_row_num=None,
        name=data.name or "",
        phone=phone,
        email=normalized_email.strip(),
        status=_normalize_status("CALL"),
        status_raw="CALL",
        assigned_to=assigned_to,
        date=_now().isoformat(),
        total_debt=data.total_debt or "",
        sheet_comments=data.sheet_comments or "",
        service_type=data.service_type or "",
        referrer=data.referrer or "LOGISTIS",
        application_number=data.application_number or "",
        themis_token=themis_token,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    # Build Themis URL
    frontend_url = os.getenv("FRONTEND_URL", "https://portal.i-mentor.gr").rstrip("/")
    themis_url = f"{frontend_url}/themis/{themis_token}"

    return {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "email": lead.email,
        "assigned_to": assigned_to,
        "status": "CALL",
        "themis_token": themis_token,
        "themis_url": themis_url,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }
