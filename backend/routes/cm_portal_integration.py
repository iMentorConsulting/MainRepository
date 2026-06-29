import os
import logging
from datetime import datetime
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, fmt_dt
from models_cases import CMCase, CMUser, CMPortalAssignment, CMPortalAssignmentRequest
from auth_cases import get_current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/portal-integration", tags=["cm-portal-integration"])

PORTAL_CASES_API_URL = os.getenv(
    "LOGISTIS_PORTAL_CASES_URL", "https://logistis.i-mentor.gr/api/external/cases"
)
PORTAL_ASSIGNMENT_REQUEST_URL = os.getenv(
    "LOGISTIS_ASSIGNMENT_REQUEST_URL", "https://logistis.i-mentor.gr/api/external/assignment-requests"
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
        "phone": a.phone,
        "email": a.email,
        "accountant_office": a.accountant_office,
        "case_type": a.case_type,
        "description": a.description,
        "priority": a.priority,
        "program_title": a.program_title,
        "status": a.status,
        "cm_case_id": a.cm_case_id,
        "created_at": fmt_dt(a.created_at),
    }


_PROGRAM_CATEGORY_MAP = [
    ("ΜΙΚΡΟΠΙΣΤΩΣ", "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"),
    ("ΕΣΠΑ",        "ΕΣΠΑ"),
    ("ΔΥΠΑ",        "ΔΥΠΑ"),
    ("ΟΑΕΔ",        "ΔΥΠΑ"),
    ("ΑΝΑΚΑΙΝΙΖ",   "ΑΝΑΚΑΙΝΙΖΩ"),
]


def _map_program_category(program_title: Optional[str]) -> str:
    if not program_title:
        return "ΕΣΠΑ"
    upper = program_title.upper()
    for keyword, category in _PROGRAM_CATEGORY_MAP:
        if keyword in upper:
            return category
    return "ΕΣΠΑ"


def _map_service_type(program_title: Optional[str]) -> Optional[str]:
    """Normalize the raw LOGISTIS programTitle to the canonical CM service
    type so it matches the vocabulary used elsewhere (e.g. the finance app
    sync), preventing duplicate-case mismatches on the same AFM + service."""
    if not program_title:
        return program_title
    if "ΜΙΚΡΟΠΙΣΤΩΣ" in program_title.upper():
        return "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"
    return program_title


# ── Portal status mapping ────────────────────────────────────────────────────
_CANCELLED_STATUSES = {"ΑΚΥΡΩΣΗ", "ΠΑΡΑΙΤΗΣΗ", "ΑΠΟΡΡΙΨΗ", "ΜΗ ΕΠΙΛΕΞΙΜΟΣ", "ΟΧΙ ΕΝΔΙΑΦΕΡΟΝ"}
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


def push_portal_status_update(case: CMCase, note: str = None, outcome: str = None) -> dict:
    """Notify the LOGISTIS Portal of a status change for a linked case.
    Safe to call for unlinked cases (no-op) — never raises.
    Returns a dict describing what happened, for diagnostics."""
    if not case.portal_case_number:
        return {"sent": False, "reason": "Η υπόθεση δεν είναι συνδεδεμένη με LOGISTIS (χωρίς portal_case_number)"}
    secret = _shared_secret()
    if not secret:
        return {"sent": False, "reason": "IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί"}
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
        if resp.status_code == 404:
            # externalRef not registered on the Portal side yet (e.g. accept call
            # happened before this mapping existed) — re-establish it via the
            # idempotent POST, then retry the status update.
            try:
                relink = requests.post(
                    PORTAL_CASES_API_URL,
                    json={
                        "afm": case.afm,
                        "externalRef": str(case.id),
                        "status": "ACCEPTED",
                        "note": "Επανασύνδεση externalRef από το Case Management",
                        **({"resultLink": result_link} if result_link else {}),
                    },
                    headers={"x-api-key": secret},
                    timeout=10,
                )
                if relink.ok:
                    resp = requests.put(
                        PORTAL_CASES_API_URL,
                        json=body,
                        headers={"x-api-key": secret},
                        timeout=10,
                    )
                else:
                    log.error("LOGISTIS Portal relink failed %s: %s", relink.status_code, relink.text[:300])
                    return {"sent": False, "reason": f"Relink HTTP {relink.status_code}: {relink.text[:300]}", "request": body, "url": PORTAL_CASES_API_URL}
            except Exception as exc:
                return {"sent": False, "reason": f"Relink error: {exc}", "request": body, "url": PORTAL_CASES_API_URL}

        if not resp.ok:
            log.error("LOGISTIS Portal status push failed %s: %s", resp.status_code, resp.text[:300])
            return {"sent": False, "reason": f"HTTP {resp.status_code}: {resp.text[:300]}", "request": body, "url": PORTAL_CASES_API_URL}
        return {"sent": True, "request": body, "url": PORTAL_CASES_API_URL, "response": resp.text[:300]}
    except Exception as exc:
        log.warning("LOGISTIS Portal status push error for case %s: %s", case.id, exc)
        return {"sent": False, "reason": str(exc), "request": body, "url": PORTAL_CASES_API_URL}


# ── Inbound webhook (Portal → us) ────────────────────────────────────────────
class CaseCreatedWebhook(BaseModel):
    event: str
    caseNumber: int
    afm: Optional[str] = None
    onomasia: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    accountantOffice: Optional[str] = None
    caseType: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    programTitle: Optional[str] = None
    requestRef: Optional[str] = None


class DocumentUploadedWebhook(BaseModel):
    event: str
    caseNumber: Optional[int] = None
    externalRef: Optional[str] = None
    afm: Optional[str] = None
    onomasia: Optional[str] = None
    category: Optional[str] = None
    fileName: Optional[str] = None
    dataUrl: Optional[str] = None
    uploadedByName: Optional[str] = None
    uploadedByRole: Optional[str] = None


def _handle_case_created(payload: CaseCreatedWebhook, db: Session) -> dict:
    assignment = CMPortalAssignment(
        case_number=payload.caseNumber,
        afm=payload.afm,
        onomasia=payload.onomasia,
        phone=payload.phone,
        email=payload.email,
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

    if payload.requestRef:
        try:
            req = db.query(CMPortalAssignmentRequest).filter(
                CMPortalAssignmentRequest.id == int(payload.requestRef)
            ).first()
        except (TypeError, ValueError):
            req = None
        if req:
            req.status = "fulfilled"
            req.case_number = payload.caseNumber
            req.cm_assignment_id = assignment.id
            db.commit()

    return {"message": "OK", "id": assignment.id}


def _handle_document_uploaded(payload: DocumentUploadedWebhook, db: Session) -> dict:
    case = None
    if payload.externalRef:
        try:
            case = db.query(CMCase).filter(CMCase.id == int(payload.externalRef)).first()
        except (TypeError, ValueError):
            case = None
    if not case and payload.caseNumber:
        case = db.query(CMCase).filter(CMCase.portal_case_number == payload.caseNumber).first()

    if not case:
        log.warning(
            "LOGISTIS document.uploaded: no matching case for caseNumber=%s externalRef=%s",
            payload.caseNumber, payload.externalRef,
        )
        return {"message": "OK", "matched": False}

    if not payload.dataUrl:
        log.warning("LOGISTIS document.uploaded: missing dataUrl for case %s", case.id)
        return {"message": "OK", "matched": True, "saved": False}

    import base64
    import re as _re
    m = _re.match(r"^data:([^;]+);base64,(.+)$", payload.dataUrl, _re.DOTALL)
    if not m:
        log.warning("LOGISTIS document.uploaded: malformed dataUrl for case %s", case.id)
        return {"message": "OK", "matched": True, "saved": False}
    mime_type, b64data = m.group(1), m.group(2)
    try:
        data = base64.b64decode(b64data)
    except Exception as exc:
        log.warning("LOGISTIS document.uploaded: base64 decode failed for case %s: %s", case.id, exc)
        return {"message": "OK", "matched": True, "saved": False}

    if len(data) > 20 * 1024 * 1024:
        log.warning("LOGISTIS document.uploaded: file too large for case %s", case.id)
        return {"message": "OK", "matched": True, "saved": False}

    actual_name = payload.fileName or "document"
    uploaded_by = payload.uploadedByName
    if uploaded_by and payload.uploadedByRole:
        role_label = "Λογιστής" if payload.uploadedByRole.upper() == "ACCOUNTANT" else payload.uploadedByRole
        uploaded_by = f"{uploaded_by} — {role_label}"

    drive_id = None
    file_data_db = None
    try:
        from drive_storage import upload_case_document
        drive_id = upload_case_document(
            content=data,
            filename=actual_name,
            mime_type=mime_type,
            program_category=case.program_category or "Άλλο",
            case_id=case.id,
            client_name=case.client_name or "client",
        )
    except Exception:
        file_data_db = data

    from sqlalchemy import text as _sqlt
    db.execute(_sqlt("""
        INSERT INTO cm_documents
            (case_id, name, document_type, status, uploaded_by,
             uploaded_by_client, file_data, mime_type, drive_file_id, upload_source, created_at)
        VALUES
            (:case_id, :name, :document_type, 'pending', :uploaded_by,
             FALSE, :file_data, :mime_type, :drive_file_id, 'logistis_accountant', NOW())
    """), {
        "case_id": case.id,
        "name": actual_name,
        "document_type": payload.category,
        "uploaded_by": uploaded_by,
        "file_data": file_data_db,
        "mime_type": mime_type,
        "drive_file_id": drive_id,
    })
    db.commit()
    return {"message": "OK", "matched": True, "saved": True, "case_id": case.id}


@router.post("/webhook")
def receive_portal_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(_verify_portal_key),
):
    event = payload.get("event")
    if event == "case.created":
        try:
            data = CaseCreatedWebhook(**payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Μη έγκυρο payload: {exc}")
        return _handle_case_created(data, db)
    if event == "document.uploaded":
        try:
            data = DocumentUploadedWebhook(**payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Μη έγκυρο payload: {exc}")
        return _handle_document_uploaded(data, db)
    raise HTTPException(status_code=400, detail="Μη υποστηριζόμενο event")


# ── Outbound assignment requests (us → Portal) ───────────────────────────────
class AssignmentRequestIn(BaseModel):
    email: str
    program: str
    note: Optional[str] = None


def _assignment_request_to_dict(r: CMPortalAssignmentRequest) -> dict:
    return {
        "id": r.id,
        "email": r.email,
        "program": r.program,
        "note": r.note,
        "requested_by": r.requested_by,
        "status": r.status,
        "portal_response": r.portal_response,
        "case_number": r.case_number,
        "cm_assignment_id": r.cm_assignment_id,
        "created_at": fmt_dt(r.created_at),
    }


@router.post("/assignment-requests")
def create_assignment_request(
    req: AssignmentRequestIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ask the LOGISTIS Accountant Portal to route a specific client/program
    assignment to the Case Management app, by email + program."""
    record = CMPortalAssignmentRequest(
        email=req.email.strip(),
        program=req.program,
        note=req.note,
        requested_by=current_user.full_name,
        status="sent",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    secret = _shared_secret()
    if not secret:
        record.status = "failed"
        record.portal_response = "IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί"
        db.commit()
        return _assignment_request_to_dict(record)

    try:
        resp = requests.post(
            PORTAL_ASSIGNMENT_REQUEST_URL,
            json={
                "email": record.email,
                "programTitle": record.program,
                "requestRef": str(record.id),
                "requestedBy": record.requested_by,
                **({"note": record.note} if record.note else {}),
            },
            headers={"x-api-key": secret},
            timeout=10,
        )
        if resp.ok:
            record.portal_response = resp.text[:300]
        else:
            record.status = "failed"
            record.portal_response = f"HTTP {resp.status_code}: {resp.text[:300]}"
            log.error("LOGISTIS assignment request failed %s: %s", resp.status_code, resp.text[:300])
    except Exception as exc:
        record.status = "failed"
        record.portal_response = str(exc)
        log.warning("LOGISTIS assignment request error: %s", exc)

    db.commit()
    db.refresh(record)
    return _assignment_request_to_dict(record)


@router.get("/assignment-requests")
def list_assignment_requests(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CMPortalAssignmentRequest)
        .order_by(CMPortalAssignmentRequest.created_at.desc())
        .limit(50)
        .all()
    )
    return [_assignment_request_to_dict(r) for r in rows]


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
        phone=a.phone,
        email=a.email,
        accountant=a.accountant_office,
        service_type=_map_service_type(a.program_title) or a.case_type,
        program_category=_map_program_category(a.program_title),
        status="ΕΛΕΓΧΟΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ",
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


@router.post("/cases/{case_id}/sync")
def sync_case_to_portal(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually re-push the current status/resultLink of a case to the LOGISTIS
    Portal. Returns diagnostic details about the attempted call — useful for
    verifying the integration without digging through server logs."""
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    result = push_portal_status_update(c, note="Χειροκίνητος επανασυγχρονισμός")
    return result
