from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, Any
from pydantic import BaseModel
from datetime import datetime
from zoneinfo import ZoneInfo
import os
import requests as http_requests

from database import get_db
from models import Case

_ATHENS = ZoneInfo("Europe/Athens")


def _now():
    return datetime.now(_ATHENS).replace(tzinfo=None)


router = APIRouter(prefix="/external", tags=["external"])

LOGISTIS_PORTAL_URL = "https://logistis.i-mentor.gr/api/external/exodikastikos"


def _require_portal_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.getenv("PORTAL_INCOMING_API_KEY", "")
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Μη έγκυρο API key")


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
