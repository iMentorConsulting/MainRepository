import os
import logging
from datetime import datetime
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, fmt_dt
from models_cases import CMCase, CMUser, CMPortalAssignment
from auth_cases import get_current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/portal-integration", tags=["cm-portal-integration"])

PORTAL_CASES_API_URL = os.getenv(
    "LOGISTIS_PORTAL_CASES_URL", "https://logistis.i-mentor.gr/api/external/cases"
)


def _shared_secret() -> str:
    return os.getenv("IMENTOR_PORTAL_API_KEY", "")


def _verify_portal_key(x_api_key: Optional[str] = Header(None)):
    expected = _shared_secret()
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Μη έγκυρο API key")


def _assignment_to_dict(a: CMPortalAssignment) -> dict:
    return {
        "id": a.id,
        "case_number": a.case_number,
        "afm": a.afm,
        "onomasia": a.onomasia,
        "accountant_office": a.accountant_office,
        "case_type": a.case_type,
        "description": a.description,
        "priority": a.priority,
        "program_title": a.program_title,
        "status": a.status,
        "cm_case_id": a.cm_case_id,
        "created_at": fmt_dt(a.created_at),
    }


# ── Portal status mapping ────────────────────────────────────────────────────
_CANCELLED_STATUSES = {"ΑΚΥΡΩΣΗ", "ΠΑΡΑΙΤΗΣΗ", "ΑΠΟΡΡΙΨΗ"}
_COMPLETED_STATUSES = {"ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ"}


def map_status_to_portal(internal_status: str) -> str:
    if internal_status in _COMPLETED_STATUSES:
        return "COMPLETED"
    if internal_status in _CANCELLED_STATUSES:
        return "CANCELLED"
    return "IN_PROGRESS"


def _result_link(case: CMCase) -> Optional[str]:
    base = os.getenv("PORTAL_BASE_URL", "").rstrip("/")
    if not base:
        return None
    return f"{base}/cases/{case.id}"


def push_portal_status_update(case: CMCase, note: str = None, outcome: str = None) -> None:
    """Notify the LOGISTIS Portal of a status change for a linked case.
    Safe to call for unlinked cases (no-op) — never raises."""
    if not case.portal_case_number:
        return
    secret = _shared_secret()
    if not secret:
        return
    portal_status = map_status_to_portal(case.status)
    body = {
        "externalRef": str(case.id),
        "status": portal_status,
    }
    if note:
        body["note"] = note
    due_date = getattr(case, "project_deadline", None) or getattr(case, "follow_up_date", None)
    if due_date:
        body["dueDate"] = due_date.isoformat()
    if portal_status == "COMPLETED" and outcome:
        body["outcome"] = outcome
    result_link = _result_link(case)
    if result_link:
        body["resultLink"] = result_link

    try:
        resp = requests.put(
            PORTAL_CASES_API_URL,
            json=body,
            headers={"x-api-key": secret},
            timeout=10,
        )
        if not resp.ok:
            log.error("LOGISTIS Portal status push failed %s: %s", resp.status_code, resp.text[:300])
    except Exception as exc:
        log.warning("LOGISTIS Portal status push error for case %s: %s", case.id, exc)


# ── Inbound webhook (Portal → us) ────────────────────────────────────────────
class CaseCreatedWebhook(BaseModel):
    event: str
    caseNumber: int
    afm: Optional[str] = None
    onomasia: Optional[str] = None
    accountantOffice: Optional[str] = None
    caseType: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    programTitle: Optional[str] = None


@router.post("/webhook")
def receive_case_created(
    payload: CaseCreatedWebhook,
    db: Session = Depends(get_db),
    _=Depends(_verify_portal_key),
):
    if payload.event != "case.created":
        raise HTTPException(status_code=400, detail="Μη υποστηριζόμενο event")

    assignment = CMPortalAssignment(
        case_number=payload.caseNumber,
        afm=payload.afm,
        onomasia=payload.onomasia,
        accountant_office=payload.accountantOffice,
        case_type=payload.caseType,
        description=payload.description,
        priority=payload.priority,
        program_title=payload.programTitle,
        status="pending",
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {"message": "OK", "id": assignment.id}


# ── Agent-facing endpoints ───────────────────────────────────────────────────
@router.get("/pending")
def list_pending(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CMPortalAssignment)
        .filter(CMPortalAssignment.status == "pending")
        .order_by(CMPortalAssignment.created_at.desc())
        .all()
    )
    return [_assignment_to_dict(a) for a in rows]


@router.post("/{assignment_id}/accept")
def accept_assignment(
    assignment_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(CMPortalAssignment).filter(CMPortalAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε η ανάθεση")
    if a.status != "pending":
        raise HTTPException(status_code=400, detail="Η ανάθεση έχει ήδη διεκπεραιωθεί")

    case = CMCase(
        client_name=a.onomasia or a.afm or f"Υπόθεση #{a.case_number}",
        afm=a.afm,
        accountant=a.accountant_office,
        service_type=a.program_title or a.case_type,
        notes=a.description,
        status_changed_at=datetime.utcnow(),
        portal_case_number=a.case_number,
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    a.status = "accepted"
    a.cm_case_id = case.id
    a.resolved_at = datetime.utcnow()
    db.commit()

    secret = _shared_secret()
    if secret:
        try:
            payload = {
                "afm": a.afm,
                "externalRef": str(case.id),
                "status": "ACCEPTED",
                "note": "Η υπόθεση παραλήφθηκε από το Case Management",
            }
            result_link = _result_link(case)
            if result_link:
                payload["resultLink"] = result_link
            resp = requests.post(
                PORTAL_CASES_API_URL,
                json=payload,
                headers={"x-api-key": secret},
                timeout=10,
            )
            if not resp.ok:
                log.error("LOGISTIS Portal accept push failed %s: %s", resp.status_code, resp.text[:300])
        except Exception as exc:
            log.warning("LOGISTIS Portal accept push error for case %s: %s", case.id, exc)

    return {"message": "OK", "case_id": case.id}


@router.post("/{assignment_id}/dismiss")
def dismiss_assignment(
    assignment_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(CMPortalAssignment).filter(CMPortalAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε η ανάθεση")
    if a.status != "pending":
        raise HTTPException(status_code=400, detail="Η ανάθεση έχει ήδη διεκπεραιωθεί")

    a.status = "dismissed"
    a.resolved_at = datetime.utcnow()
    db.commit()
    return {"message": "OK"}
