import os
import logging
from datetime import datetime, date
from typing import List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from pydantic import BaseModel

from database import get_db, fmt_dt
from models_cases import (
    CMCase, CMUser, CMPortalAssignment, CMPortalAssignmentRequest,
    CMBusinessProfile, CMBusinessActivity, CMBusinessMatchedProgram,
)
from auth_cases import get_current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cm/portal-integration", tags=["cm-portal-integration"])

PORTAL_CASES_API_URL = os.getenv(
    "LOGISTIS_PORTAL_CASES_URL", "https://logistis.i-mentor.gr/api/external/cases"
)
PORTAL_ASSIGNMENT_REQUEST_URL = os.getenv(
    "LOGISTIS_ASSIGNMENT_REQUEST_URL", "https://logistis.i-mentor.gr/api/external/assignment-requests"
)
BUSINESS_LOOKUP_URL = os.getenv(
    "LOGISTIS_BUSINESSES_URL", "https://logistis.i-mentor.gr/api/external/businesses"
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
class BusinessActivityIn(BaseModel):
    firmActCode: Optional[str] = None
    firmActDescr: Optional[str] = None
    firmActKind: Optional[str] = None


class MatchedProgramIn(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


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
    # Business profile — sourced from the LOGISTIS/ΑΑΔΕ cache, no new lookup
    commercialTitle: Optional[str] = None
    legalStatusDescr: Optional[str] = None
    regdate: Optional[str] = None
    doy: Optional[str] = None
    doyDescr: Optional[str] = None
    postalAddress: Optional[str] = None
    postalAddressNo: Optional[str] = None
    postalZipCode: Optional[str] = None
    postalAreaDescription: Optional[str] = None
    perifereia: Optional[str] = None
    klados: Optional[str] = None
    activities: Optional[List[BusinessActivityIn]] = None
    matchedPrograms: Optional[List[MatchedProgramIn]] = None


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


# ── Business profile cache (AFM → ΑΑΔΕ data, sourced from LOGISTIS) ─────────
def _business_profile_to_dict(b: CMBusinessProfile) -> dict:
    return {
        "businessId": b.id,
        "afm": b.afm,
        "onomasia": b.onomasia,
        "commercialTitle": b.commercial_title,
        "legalStatusDescr": b.legal_status_descr,
        "regdate": b.regdate.isoformat() if b.regdate else None,
        "doy": b.doy,
        "doyDescr": b.doy_descr,
        "postalAddress": b.postal_address,
        "postalAddressNo": b.postal_address_no,
        "postalZipCode": b.postal_zip_code,
        "postalAreaDescription": b.postal_area_description,
        "perifereia": b.perifereia,
        "klados": b.klados,
        "activities": [
            {"firmActCode": a.firm_act_code, "firmActDescr": a.firm_act_descr, "firmActKind": a.firm_act_kind}
            for a in b.activities
        ],
        "matchedPrograms": [
            {"title": p.title, "status": p.status} for p in b.matched_programs
        ],
    }


def _upsert_business_profile(db: Session, data: dict) -> Optional[CMBusinessProfile]:
    """Create or update the cached CMBusinessProfile (+ activities/matchedPrograms)
    for an AFM, from either a case.created webhook payload or a
    POST /api/external/businesses response. Never triggers a new ΑΑΔΕ lookup —
    that only ever happens on the LOGISTIS side."""
    afm = (data.get("afm") or "").strip()
    if not afm:
        return None

    profile = db.query(CMBusinessProfile).filter(CMBusinessProfile.afm == afm).first()
    if not profile:
        profile = CMBusinessProfile(afm=afm)
        db.add(profile)

    profile.onomasia = data.get("onomasia") or profile.onomasia
    profile.commercial_title = data.get("commercialTitle") or profile.commercial_title
    profile.legal_status_descr = data.get("legalStatusDescr") or profile.legal_status_descr
    regdate = data.get("regdate")
    if regdate:
        try:
            profile.regdate = datetime.strptime(str(regdate)[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    profile.doy = data.get("doy") or profile.doy
    profile.doy_descr = data.get("doyDescr") or profile.doy_descr
    profile.postal_address = data.get("postalAddress") or profile.postal_address
    profile.postal_address_no = data.get("postalAddressNo") or profile.postal_address_no
    profile.postal_zip_code = data.get("postalZipCode") or profile.postal_zip_code
    profile.postal_area_description = data.get("postalAreaDescription") or profile.postal_area_description
    profile.perifereia = data.get("perifereia") or profile.perifereia
    profile.klados = data.get("klados") or profile.klados
    profile.updated_at = datetime.utcnow()
    db.flush()

    activities = data.get("activities")
    if activities is not None:
        profile.activities.clear()
        for act in activities:
            kind = act.get("firmActKind")
            profile.activities.append(CMBusinessActivity(
                firm_act_code=act.get("firmActCode"),
                firm_act_descr=act.get("firmActDescr"),
                firm_act_kind=str(kind) if kind is not None else None,
            ))

    matched_programs = data.get("matchedPrograms")
    if matched_programs is not None:
        profile.matched_programs.clear()
        for mp in matched_programs:
            profile.matched_programs.append(CMBusinessMatchedProgram(
                title=mp.get("title"),
                status=mp.get("status"),
            ))

    db.commit()
    db.refresh(profile)
    return profile


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

    if payload.afm:
        _upsert_business_profile(db, {
            "afm": payload.afm,
            "onomasia": payload.onomasia,
            "commercialTitle": payload.commercialTitle,
            "legalStatusDescr": payload.legalStatusDescr,
            "regdate": payload.regdate,
            "doy": payload.doy,
            "doyDescr": payload.doyDescr,
            "postalAddress": payload.postalAddress,
            "postalAddressNo": payload.postalAddressNo,
            "postalZipCode": payload.postalZipCode,
            "postalAreaDescription": payload.postalAreaDescription,
            "perifereia": payload.perifereia,
            "klados": payload.klados,
            "activities": [a.dict() for a in payload.activities] if payload.activities is not None else None,
            "matchedPrograms": [p.dict() for p in payload.matchedPrograms] if payload.matchedPrograms is not None else None,
        })

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


# In-memory ring buffer of recent inbound webhook hits (diagnostic; lost on restart)
_recent_webhook_hits: list = []


def _record_hit(**kw) -> None:
    kw["at"] = datetime.utcnow().isoformat() + "Z"
    _recent_webhook_hits.insert(0, kw)
    del _recent_webhook_hits[50:]


def _norm_event(ev) -> str:
    return (ev or "").strip().lower().replace("_", ".").replace(" ", ".").replace("-", ".")


@router.post("/webhook")
def receive_portal_webhook(
    payload: dict,
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    # Auth checked inline (not via Depends) so auth failures are also logged.
    event = payload.get("event")
    log.info("[portal-webhook] INBOUND keys=%s event=%r afm=%s caseNumber=%s hasKey=%s",
             list(payload.keys()), event, payload.get("afm"), payload.get("caseNumber"), bool(x_api_key))
    secret = _shared_secret()
    if not secret or x_api_key != secret:
        reason = "no IMENTOR_PORTAL_API_KEY set on CM" if not secret else ("no key sent" if not x_api_key else "key mismatch")
        log.warning("[portal-webhook] AUTH FAILED (%s)", reason)
        _record_hit(event=event, keys=list(payload.keys()), auth_ok=False, outcome=f"401 {reason}")
        raise HTTPException(status_code=401, detail="Μη έγκυρο API key")

    ev = _norm_event(event)
    # Be tolerant of event-name variants; also treat a case-shaped payload with no
    # event as case.created so a slightly different sender still works.
    is_case = ev in ("case.created", "case.create", "casecreated", "assignment.created", "new.case") \
        or (not ev and payload.get("caseNumber") is not None)
    if is_case:
        try:
            data = CaseCreatedWebhook(**{**payload, "event": event or "case.created"})
        except Exception as exc:
            log.error("[portal-webhook] case.created invalid payload: %s | raw=%s", exc, str(payload)[:500])
            raise HTTPException(status_code=400, detail=f"Μη έγκυρο payload: {exc}")
        res = _handle_case_created(data, db)
        log.info("[portal-webhook] case.created → assignment id=%s stored (status=pending)", res.get("id"))
        _record_hit(event=event, keys=list(payload.keys()), auth_ok=True, outcome=f"assignment #{res.get('id')} pending")
        return res
    if ev in ("document.uploaded", "document.upload", "documentuploaded"):
        try:
            data = DocumentUploadedWebhook(**{**payload, "event": event or "document.uploaded"})
        except Exception as exc:
            log.error("[portal-webhook] document.uploaded invalid payload: %s", exc)
            raise HTTPException(status_code=400, detail=f"Μη έγκυρο payload: {exc}")
        return _handle_document_uploaded(data, db)
    log.warning("[portal-webhook] UNSUPPORTED event=%r (keys=%s)", event, list(payload.keys()))
    _record_hit(event=event, keys=list(payload.keys()), auth_ok=True, outcome="400 unsupported event")
    raise HTTPException(status_code=400, detail=f"Μη υποστηριζόμενο event: {event!r}")


@router.get("/webhook-log")
def webhook_log(current_user: CMUser = Depends(get_current_user)):
    """Diagnostic: the last inbound webhook hits (event, keys, auth result, outcome)
    so you can confirm whether LOGISTIS is actually reaching CM and why it failed."""
    return {"hits": _recent_webhook_hits}


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


# ── Business profile lookup/creation (us → LOGISTIS) ─────────────────────────
class BusinessLookupIn(BaseModel):
    afm: str
    email: Optional[str] = None
    phone: Optional[str] = None


@router.post("/businesses")
def lookup_or_create_business(
    payload: BusinessLookupIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve a business by AFM. Returns the locally cached profile with no
    remote call if we already have it; otherwise asks LOGISTIS to create/look
    it up (their endpoint does exactly one ΑΑΔΕ lookup) and caches the result."""
    afm = payload.afm.strip()
    if not afm:
        raise HTTPException(status_code=400, detail="Το ΑΦΜ είναι υποχρεωτικό")

    existing = db.query(CMBusinessProfile).filter(CMBusinessProfile.afm == afm).first()
    if existing:
        return {"created": False, **_business_profile_to_dict(existing)}

    secret = _shared_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="IMENTOR_PORTAL_API_KEY δεν έχει ρυθμιστεί")

    body = {"afm": afm}
    if payload.email:
        body["email"] = payload.email
    if payload.phone:
        body["phone"] = payload.phone

    try:
        resp = requests.post(
            BUSINESS_LOOKUP_URL,
            json=body,
            headers={"x-api-key": secret},
            timeout=15,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Σφάλμα επικοινωνίας με LOGISTIS: {exc}")

    if not resp.ok:
        log.error("LOGISTIS business lookup failed %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail=f"LOGISTIS HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    profile = _upsert_business_profile(db, data)
    if not profile:
        raise HTTPException(status_code=502, detail="Μη έγκυρη απάντηση από LOGISTIS (χωρίς afm)")
    return {"created": bool(data.get("created", True)), **_business_profile_to_dict(profile)}


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


@router.get("/recent")
def list_recent(
    limit: int = 30,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Diagnostic: recent assignments regardless of status, so you can confirm
    whether LOGISTIS case.created webhooks are actually arriving."""
    rows = (
        db.query(CMPortalAssignment)
        .order_by(CMPortalAssignment.created_at.desc())
        .limit(min(max(1, limit), 100))
        .all()
    )
    counts = {}
    for s, c in db.query(CMPortalAssignment.status, sa_func.count(CMPortalAssignment.id)).group_by(CMPortalAssignment.status).all():
        counts[s] = c
    return {"total": sum(counts.values()), "by_status": counts,
            "items": [_assignment_to_dict(a) for a in rows]}


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

    # Accepting a LOGISTIS assignment now creates a LEAD (not a case): status HOT,
    # assigned to the consultant who accepted, today's date + reminder, with a link
    # back to the LOGISTIS case.
    from models_cases import CMLead
    from routes.cm_leads import normalize_afm, maybe_autostart_ermis
    today = date.today()
    link_tmpl = os.getenv("LOGISTIS_CASE_LINK_TEMPLATE", "https://logistis.i-mentor.gr/cases/{case_number}")
    portal_link = link_tmpl.replace("{case_number}", str(a.case_number)) if a.case_number is not None else None

    lead = CMLead(
        name=a.onomasia or a.afm or f"Ανάθεση #{a.case_number}",
        afm=normalize_afm(a.afm),
        phone=a.phone,
        email=a.email,
        program=_map_program_category(a.program_title),
        service_type=_map_service_type(a.program_title) or a.case_type,
        status="HOT",
        assigned_agent_id=current_user.id,
        assigned_name=current_user.full_name,
        source="LOGISTIS",
        notes=a.description,
        next_call_date=today,
        portal_case_number=a.case_number,
        portal_case_link=portal_link,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    a.status = "accepted"
    a.cm_lead_id = lead.id
    a.resolved_at = datetime.utcnow()
    db.commit()

    # New lead with an ΑΦΜ → auto-start ΕΡΜΗΣ immediately
    maybe_autostart_ermis(lead, actor_name=current_user.full_name)

    # Best-effort: tell LOGISTIS the assignment was accepted (references the lead)
    secret = _shared_secret()
    if secret:
        try:
            payload = {
                "afm": a.afm,
                "externalRef": f"lead-{lead.id}",
                "status": "ACCEPTED",
                "note": f"Η ανάθεση παραλήφθηκε ως lead από το Case Management ({current_user.full_name})",
            }
            resp = requests.post(
                PORTAL_CASES_API_URL,
                json=payload,
                headers={"x-api-key": secret},
                timeout=10,
            )
            if not resp.ok:
                log.error("LOGISTIS Portal accept push failed %s: %s", resp.status_code, resp.text[:300])
        except Exception as exc:
            log.warning("LOGISTIS Portal accept push error for lead %s: %s", lead.id, exc)

    return {"message": "OK", "lead_id": lead.id}


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
