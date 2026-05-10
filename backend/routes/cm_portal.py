import uuid
import os
import shutil
from datetime import datetime
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models_cases import CMCase, CMCasePendingItem, CMMessage, CMDocument, CMBudgetCategory
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

    # Progress percent: position in full status list
    all_statuses = [s["status"] for s in full_status_list]
    try:
        idx = all_statuses.index(case.status or "")
        progress_percent = round((idx / max(len(all_statuses) - 1, 1)) * 100)
    except ValueError:
        progress_percent = 0

    # Status descriptions from pipeline config
    try:
        from routes.cm_pipeline import get_pipeline_config
        cfg = get_pipeline_config(prog, db)
        status_descriptions = cfg.get("status_descriptions", {})
    except Exception:
        status_descriptions = {}

    # Status history (chronological)
    history_items = sorted(case.status_history or [], key=lambda h: h.changed_at)
    status_history = [
        {
            "from_status": h.from_status,
            "to_status": h.to_status,
            "changed_at": h.changed_at.isoformat() if h.changed_at else None,
            "changed_by": h.changed_by,
        }
        for h in history_items
    ]

    pending_items = [
        {"id": pi.id, "item_text": pi.item_text, "comment": pi.comment}
        for pi in (case.pending_items or [])
    ]

    external_messages = sorted(
        [m for m in (case.messages or []) if not m.is_internal],
        key=lambda m: m.created_at,
    )[-20:]
    messages_out = [
        {
            "id": m.id,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "author": m.user.full_name if m.user else "iMentor",
            "sent_by_client": getattr(m, "sent_by_client", False) or False,
        }
        for m in external_messages
    ]

    # Client-uploaded documents
    client_docs = [
        {
            "id": d.id,
            "name": d.name,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "file_url": d.file_url,
        }
        for d in (case.documents or [])
        if getattr(d, "uploaded_by_client", False)
    ]

    # Budget breakdown (ΕΣΠΑ only but return for all)
    budget_categories = [
        {
            "category_name": b.category_name,
            "approved_amount": b.approved_amount or 0,
            "percent_of_budget": b.percent_of_budget or 0,
            "certified_request1": b.certified_request1 or 0,
            "certified_request2": b.certified_request2 or 0,
            "certified_final": b.certified_final or 0,
        }
        for b in (case.budget_categories or [])
    ]

    # Financial agreement
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
        "progress_percent": progress_percent,
        "status_descriptions": status_descriptions,
        "status_history": status_history,
        "client_documents": client_docs,
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


@router.post("/public/{token}/visit")
def record_visit(token: str, body: dict, db: Session = Depends(get_db)):
    """Verify client AFM and increment visit counter."""
    afm = (body.get("afm") or "").strip()
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    if not afm or (case.afm or "").strip() != afm:
        raise HTTPException(status_code=403, detail="Λάθος ΑΦΜ")

    case.portal_visit_count = (case.portal_visit_count or 0) + 1
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
    """Activate portals and send Viber notifications for selected cases."""
    case_ids = body.get("case_ids", [])
    portal_base_url = (body.get("portal_base_url") or "").rstrip("/")
    message_template = body.get("message_template", "")
    activate = body.get("activate", True)
    notify = body.get("notify", True)

    bridge_url = os.getenv("VIBER_BRIDGE_URL", "https://viber-bridge.i-mentor.gr")
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
        error = ""
        if notify:
            phone = (case.phone or "").strip()
            if phone:
                try:
                    resp = http_requests.post(f"{bridge_url}/send", json={
                        "to": _normalize_phone(phone),
                        "text": msg,
                        "name": case.client_name or phone,
                        "agent": current_user.full_name,
                        "service_tag": case.service_type or "",
                    }, timeout=10)
                    notified = resp.status_code == 200
                    if not notified:
                        error = resp.text[:200]
                except Exception as e:
                    error = str(e)[:200]
            else:
                error = "no phone"

        results.append({
            "case_id": case_id,
            "client_name": case.client_name,
            "phone": case.phone,
            "portal_url": portal_url,
            "notified": notified,
            "error": error,
        })

    return {
        "results": results,
        "activated": sum(1 for r in results if "error" not in r or not r["error"] or r.get("portal_url")),
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
