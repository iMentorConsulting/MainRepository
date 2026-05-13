import uuid
import os
import shutil
from datetime import datetime, date as _date
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models_cases import CMCase, CMCasePendingItem, CMMessage, CMBudgetCategory, CMDocument, CMCaseStatusHistory
from auth_cases import get_current_user

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "portal_uploads")

router = APIRouter(prefix="/api/cm/portal", tags=["portal"])


def _get_pipeline(program_category: str, db: Session) -> dict:
    try:
        from routes.cm_pipeline import get_pipeline_config
        return get_pipeline_config(program_category, db)
    except Exception:
        from pipelines import PIPELINES
        return PIPELINES.get(program_category, {})


def _get_current_phase_id(status: str, program_category: str, db: Session) -> str | None:
    pipeline = _get_pipeline(program_category, db)
    for phase in pipeline.get("phases", []):
        if status in phase["statuses"]:
            return phase["id"]
    return None


def _get_next_status(status: str, program_category: str, db: Session) -> str | None:
    pipeline = _get_pipeline(program_category, db)
    all_statuses = []
    for phase in pipeline.get("phases", []):
        all_statuses.extend(phase["statuses"])
    try:
        idx = all_statuses.index(status)
        if idx + 1 < len(all_statuses):
            return all_statuses[idx + 1]
    except ValueError:
        pass
    return None


def _get_full_status_list(program_category: str, db: Session) -> list[dict]:
    pipeline = _get_pipeline(program_category, db)
    result = []
    for phase in pipeline.get("phases", []):
        for s in phase["statuses"]:
            result.append({"status": s, "phase_id": phase["id"], "phase_label": phase["label"], "color": phase["color"]})
    return result


def _build_portal_data(case: CMCase, db: Session) -> dict:
    prog = case.program_category or "ΕΣΠΑ"
    pipeline = _get_pipeline(prog, db)
    phases = [
        {"id": p["id"], "label": p["label"], "color": p["color"]}
        for p in pipeline.get("phases", [])
    ]
    current_phase_id = _get_current_phase_id(case.status or "", prog, db)
    next_status = _get_next_status(case.status or "", prog, db)
    full_status_list = _get_full_status_list(prog, db)

    # Progress percent: position of current status in full list
    progress_percent = 0
    if full_status_list:
        idx = next((i for i, s in enumerate(full_status_list) if s["status"] == case.status), None)
        if idx is not None:
            progress_percent = round((idx + 1) / len(full_status_list) * 100)

    # Status descriptions from pipeline config
    try:
        import json as _json
        from models_cases import CMPipelineConfig as _PCfg
        row = db.query(_PCfg).filter(_PCfg.program_category == prog).first()
        status_descriptions = _json.loads(row.status_descriptions_json or "{}") if row else {}
    except Exception:
        status_descriptions = {}


    pending_items = [
        {"id": pi.id, "item_text": pi.item_text, "comment": pi.comment}
        for pi in (case.pending_items or [])
    ]

    all_external = sorted(
        [m for m in (case.messages or []) if not m.is_internal],
        key=lambda m: m.created_at,
    )
    messages_out = [
        {
            "id": m.id,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "author": m.user.full_name if m.user else (m.author_name or "iMentor"),
            "sent_by_client": bool(m.sent_by_client),
        }
        for m in all_external[-20:]
    ]

    # Status history
    history_out = [
        {
            "from_status": h.from_status,
            "to_status": h.to_status,
            "changed_at": h.changed_at.isoformat() if h.changed_at else None,
        }
        for h in (case.status_history or [])
    ]


    # Client-uploaded documents
    client_docs = [
        {
            "id": d.id,
            "name": d.name,
            "file_url": d.file_url,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in (case.documents or []) if d.uploaded_by_client
    ]

    # Budget breakdown
    budget_categories = []
    for b in (case.budget_categories or []):
        total_certified = (b.certified_request1 or 0) + (b.certified_request2 or 0) + (b.certified_final or 0)
        budget_categories.append({
            "category_name": b.category_name,
            "approved_amount": b.approved_amount or 0,
            "certified_request1": b.certified_request1 or 0,
            "certified_request2": b.certified_request2 or 0,
            "certified_final": b.certified_final or 0,
            "total_certified": total_certified,
            "remaining": (b.approved_amount or 0) - total_certified,
        })

    agreed_application = case.agreed_fee_application or 0
    agreed_implementation = case.agreed_fee_implementation or 0
    total_agreed = agreed_application + agreed_implementation
    total_paid = case.total_paid or 0
    balance = total_agreed - total_paid

    return {
        "client_name": case.client_name,
        "service_type": case.service_type,
        "program_category": prog,
        "status": case.status,
        "project_deadline": case.project_deadline.isoformat() if case.project_deadline else None,
        "approved_budget": case.approved_budget,
        "subsidy_percent": case.subsidy_percent,
        "approval_date": case.approval_date.isoformat() if case.approval_date else None,
        "dypa_start_date": case.dypa_start_date.isoformat() if case.dypa_start_date else None,
        "assigned_agent_name": case.assigned_agent.full_name if case.assigned_agent else None,
        "pending_items": pending_items,
        "messages": messages_out,
        "status_history": history_out,
        "status_descriptions": status_descriptions,
        "progress_percent": progress_percent,
        "client_documents": client_docs,
        "pipeline_phases": phases,
        "current_phase_id": current_phase_id,
        "next_status": next_status,
        "full_status_list": full_status_list,
        "budget_categories": budget_categories,
        "agreed_fee_application": agreed_application,
        "agreed_fee_implementation": agreed_implementation,
        "total_agreed": total_agreed,
        "total_paid": total_paid,
        "balance": balance,
        "portal_visit_count": case.portal_visit_count or 0,
        "modifications": [
            {
                "id": m.id,
                "modification_date": m.modification_date.isoformat() if m.modification_date else None,
                "title": m.title,
                "justification": m.justification,
                "approval_date": m.approval_date.isoformat() if m.approval_date else None,
            }
            for m in sorted(case.modifications or [], key=lambda x: x.modification_date or _date.min)
        ],
    }


@router.get("/public/{token}")
def get_portal(token: str, db: Session = Depends(get_db)):
    """Return portal data without incrementing visit count."""
    from models_cases import CMCaseStatusHistory
    case = (
        db.query(CMCase)
        .options(
            joinedload(CMCase.assigned_agent),
            joinedload(CMCase.pending_items),
            joinedload(CMCase.messages).joinedload(CMMessage.user),
            joinedload(CMCase.budget_categories),
            joinedload(CMCase.documents),
            joinedload(CMCase.status_history),
            joinedload(CMCase.modifications),
        )
        .filter(CMCase.share_token == token)
        .first()
    )
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    return _build_portal_data(case, db)


@router.post("/public/{token}/nps")
def record_nps(token: str, body: dict, db: Session = Depends(get_db)):
    """Record NPS score from client (no auth required)."""
    from datetime import datetime
    score = body.get("score")
    if score is None or not (0 <= int(score) <= 10):
        raise HTTPException(status_code=400, detail="Invalid score")
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")
    case.portal_nps_score = int(score)
    case.portal_nps_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/public/{token}/review-click")
def record_review_click(token: str, db: Session = Depends(get_db)):
    """Record that client clicked the Google review link."""
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")
    case.portal_review_clicked = True
    db.commit()
    return {"ok": True}


@router.post("/public/{token}/message")
def client_send_message(token: str, body: dict, db: Session = Depends(get_db)):
    """Client submits a message/question from the portal."""
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Κενό μήνυμα")

    from datetime import datetime
    msg = CMMessage(
        case_id=case.id,
        content=content,
        is_internal=False,
        sent_by_client=True,
        author_name=case.client_name or "Πελάτης",
    )
    db.add(msg)
    db.commit()

    # Notify assigned agent by email if available
    if case.assigned_agent and case.assigned_agent.email:
        try:
            from routes.cm_notifications import _send_email
            _send_email(
                case.assigned_agent.email,
                f"Νέο μήνυμα από πελάτη — {case.client_name}",
                f"Ο πελάτης {case.client_name} έστειλε μήνυμα:\n\n{content}\n\nΥπόθεση: {case.service_type or ''}",
            )
        except Exception:
            pass

    return {"ok": True}


@router.post("/public/{token}/upload")
async def client_upload_file(
    token: str,
    file: UploadFile = File(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
):
    """Client uploads a document from the portal."""
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    # Save file to disk
    case_dir = os.path.join(UPLOAD_DIR, str(case.id))
    os.makedirs(case_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    dest = os.path.join(case_dir, safe_name)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_url = f"/api/cm/portal/public/{token}/uploads/{safe_name}"

    doc = CMDocument(
        case_id=case.id,
        name=file.filename or safe_name,
        document_type=description or "Αρχείο πελάτη",
        status="pending",
        uploaded_by=case.client_name or "Πελάτης",
        uploaded_by_client=True,
        file_url=file_url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Notify agent
    if case.assigned_agent and case.assigned_agent.email:
        try:
            from routes.cm_notifications import _send_email
            _send_email(
                case.assigned_agent.email,
                f"Νέο αρχείο από πελάτη — {case.client_name}",
                f"Ο πελάτης {case.client_name} ανέβασε αρχείο: {file.filename}\n{description}",
            )
        except Exception:
            pass

    return {"ok": True, "id": doc.id, "name": doc.name, "file_url": file_url}


@router.get("/public/{token}/uploads/{filename}")
async def serve_client_upload(token: str, filename: str, db: Session = Depends(get_db)):
    """Serve a file uploaded by the client."""
    from fastapi.responses import FileResponse as _FR
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(UPLOAD_DIR, str(case.id), filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return _FR(path)


@router.post("/public/{token}/visit")
def record_visit(token: str, body: dict, db: Session = Depends(get_db)):
    """Verify client AFM and increment visit counter."""
    afm = (body.get("afm") or "").strip()
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    if not afm or (case.afm or "").strip() != afm:
        raise HTTPException(status_code=403, detail="Λάθος ΑΦΜ")

    from datetime import datetime
    case.portal_visit_count = (case.portal_visit_count or 0) + 1
    case.portal_last_visit_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{case_id}/toggle")
def toggle_portal(case_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not case.share_token:
        case.share_token = str(uuid.uuid4())

    case.portal_active = not case.portal_active
    db.commit()
    db.refresh(case)
    return {"portal_active": case.portal_active, "share_token": case.share_token}


@router.post("/{case_id}/regenerate-token")
def regenerate_token(case_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case.share_token = str(uuid.uuid4())
    db.commit()
    db.refresh(case)
    return {"share_token": case.share_token}


def _normalize_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if p.startswith("0"):
        return "30" + p[1:]
    if p.startswith("+"):
        return p[1:]
    if not p.startswith("30"):
        return "30" + p
    return p


@router.post("/activate-all")
def activate_all_portals(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Activate portals for ALL cases that don't have one yet, without any notifications."""
    cases = db.query(CMCase).all()
    activated = 0
    for case in cases:
        if not case.share_token:
            case.share_token = str(uuid.uuid4())
        if not case.portal_active:
            case.portal_active = True
            activated += 1
    db.commit()
    return {"total": len(cases), "activated": activated}


@router.post("/bulk-activate-notify")
def bulk_activate_notify(body: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Activate portals and send Viber/email notifications for selected cases."""
    from routes.cm_notifications import _send_email, _send_viber, _log_notification

    case_ids = body.get("case_ids", [])
    portal_base_url = (body.get("portal_base_url") or "").rstrip("/")
    message_template = body.get("message_template", "")
    activate = body.get("activate", True)
    notify = body.get("notify", True)
    notification_type = body.get("notification_type", "viber")  # viber | email | both

    results = []

    for case_id in case_ids:
        case = db.query(CMCase).filter(CMCase.id == case_id).first()
        if not case:
            results.append({"case_id": case_id, "ok": False, "error": "not found"})
            continue

        if activate:
            if not case.share_token:
                case.share_token = str(uuid.uuid4())
            case.portal_active = True
            db.commit()
            db.refresh(case)

        portal_url = f"{portal_base_url}/portal/{case.share_token}" if case.share_token else ""
        msg = (message_template
               .replace("{client_name}", case.client_name or "")
               .replace("{portal_url}", portal_url)
               .replace("{service_type}", case.service_type or ""))

        notified = False
        error_parts = []

        if notify:
            send_viber = notification_type in ("viber", "both")
            send_email = notification_type in ("email", "both")

            if send_viber:
                phone = (case.phone or "").strip()
                if phone:
                    ok, err = _send_viber(phone, msg, case.client_name or "", current_user.full_name, case.service_type or "")
                    if ok:
                        notified = True
                        _log_notification(db, case.id, "viber", case.client_name, phone,
                                          "Ενεργοποίηση Πύλης Πελάτη", msg, "sent", current_user.full_name)
                    else:
                        error_parts.append(f"Viber: {err[:100]}")
                else:
                    error_parts.append("no phone")

            if send_email:
                email_addr = (case.email or "").strip()
                if email_addr:
                    subject = f"Ενεργοποίηση Πύλης Πελάτη - {case.client_name or ''}"
                    ok, err = _send_email(email_addr, subject, msg)
                    if ok:
                        notified = True
                        _log_notification(db, case.id, "email", case.client_name, email_addr,
                                          subject, msg, "sent", current_user.full_name)
                    else:
                        error_parts.append(f"Email: {err or 'failed'}")
                else:
                    error_parts.append("no email")

        results.append({
            "case_id": case_id,
            "client_name": case.client_name,
            "phone": case.phone,
            "email": case.email,
            "portal_url": portal_url,
            "notified": notified,
            "error": "; ".join(error_parts),
        })

    db.commit()
    return {
        "results": results,
        "activated": sum(1 for r in results if r.get("portal_url")),
        "notified": sum(1 for r in results if r.get("notified")),
    }


@router.post("/public/{token}/message")
def client_send_message(token: str, body: dict, db: Session = Depends(get_db)):
    """Client sends a message from the portal (no auth required)."""
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Κενό μήνυμα")
    case = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")

    msg = CMMessage(
        case_id=case.id,
        content=content,
        is_internal=False,
        author_name=case.client_name or "Πελάτης",
        sent_by_client=True,
    )
    db.add(msg)
    db.commit()

    # Notify assigned agent by email
    agent_email = case.assigned_agent.email if case.assigned_agent else None
    if agent_email:
        try:
            from routes.cm_notifications import _send_email
            subject = f"Νέο μήνυμα από πελάτη: {case.client_name}"
            body_text = (
                f"Ο πελάτης {case.client_name} έστειλε μήνυμα μέσω του portal:\n\n"
                f"{content}\n\n"
                f"Υπόθεση: {case.service_type or ''} | {case.program_category or ''}"
            )
            _send_email(agent_email, subject, body_text)
        except Exception:
            pass

    return {"ok": True}


@router.post("/public/{token}/upload")
async def client_upload_file(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Client uploads a file from the portal (no auth required)."""
    case = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")

    upload_dir = os.path.join(UPLOAD_DIR, str(case.id))
    os.makedirs(upload_dir, exist_ok=True)

    # Sanitize filename
    safe_name = os.path.basename(file.filename or "upload").replace(" ", "_")
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_")
    dest = os.path.join(upload_dir, timestamp + safe_name)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_url = f"/api/cm/portal/uploads/{case.id}/{timestamp + safe_name}"
    doc = CMDocument(
        case_id=case.id,
        name=file.filename or safe_name,
        document_type="client_upload",
        status="pending",
        uploaded_by=case.client_name or "Πελάτης",
        file_url=file_url,
        uploaded_by_client=True,
    )
    db.add(doc)
    db.commit()

    # Notify agent
    agent_email = case.assigned_agent.email if case.assigned_agent else None
    if agent_email:
        try:
            from routes.cm_notifications import _send_email
            _send_email(
                agent_email,
                f"Νέο αρχείο από πελάτη: {case.client_name}",
                f"Ο πελάτης {case.client_name} ανέβασε αρχείο: {file.filename}\n\nΥπόθεση: {case.service_type or ''}",
            )
        except Exception:
            pass

    return {"ok": True, "filename": file.filename}


@router.get("/uploads/{case_id}/{filename}")
def serve_portal_upload(case_id: int, filename: str, db: Session = Depends(get_db)):
    """Serve a portal-uploaded file (accessible via portal token or advisor auth)."""
    safe_name = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, str(case_id), safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return FileResponse(path)


@router.get("/{case_id}/client-uploads")
def list_client_uploads(
    case_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List client-uploaded files for a case (advisor access)."""
    docs = (
        db.query(CMDocument)
        .filter(CMDocument.case_id == case_id, CMDocument.uploaded_by_client == True)
        .order_by(CMDocument.created_at.desc())
        .all()
    )
    return [
        {
            "id": d.id,
            "name": d.name,
            "file_url": d.file_url,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]
