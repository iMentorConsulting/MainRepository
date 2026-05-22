import uuid
import os
import shutil
from datetime import datetime, date as _date
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db, fmt_dt
from models_cases import CMCase, CMCasePendingItem, CMMessage, CMBudgetCategory, CMDocument, CMCaseStatusHistory, CMPortalFile, CMCaseModification
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
            "created_at": fmt_dt(m.created_at),
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
            "changed_at": fmt_dt(h.changed_at),
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
            "created_at": fmt_dt(d.created_at),
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

    response = {
        "case_id": case.id,
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
        "portal_files": _get_portal_files_for_case(case, db),
    }

    # ΑΝΑΚΑΙΝΙΖΩ extra data
    if prog == "ΑΝΑΚΑΙΝΙΖΩ":
        from models_cases import CMCaseAnakainizw
        ana = db.query(CMCaseAnakainizw).filter(CMCaseAnakainizw.case_id == case.id).first()
        if ana:
            total = (ana.energy_works_budget or 0) + (ana.general_works_budget or 0)
            energy_pct = round(((ana.energy_works_budget or 0) / total) * 100) if total > 0 else 0
            ht = (ana.household_type or "").lower()
            base_income = 25000 if ht == "άγαμος" else 35000
            income_limit = base_income + (ana.num_children or 0) * 5000
            response["anakainizw"] = {
                "property_sqm": ana.property_sqm,
                "property_prefecture": ana.property_prefecture,
                "property_address": ana.property_address,
                "property_type": ana.property_type,
                "property_age": ana.property_age,
                "property_usage": ana.property_usage,
                "renovation_works": ana.renovation_works,
                "legality": ana.legality,
                "cooperating_engineer": ana.cooperating_engineer,
                "subsidy_percent": ana.subsidy_percent,
                "energy_works_budget": ana.energy_works_budget or 0,
                "general_works_budget": ana.general_works_budget or 0,
                "total_works_budget": total,
                "max_budget": min((ana.property_sqm or 0) * 300, 36000) if ana.property_sqm else 0,
                "energy_pct": energy_pct,
                "energy_ok": energy_pct >= 20,
                "household_type": ana.household_type,
                "num_children": ana.num_children,
                "income_limit": income_limit,
                "is_single_parent": ana.is_single_parent,
                "is_three_children": ana.is_three_children,
                "boost_island": ana.boost_island,
                "boost_single_parent": ana.boost_single_parent,
                "boost_three_children": ana.boost_three_children,
                "boost_large_family": ana.boost_large_family,
                "boost_youth": ana.boost_youth,
                "doc_title_deed": ana.doc_title_deed,
                "doc_e9": ana.doc_e9,
                "doc_permit": ana.doc_permit,
                "doc_legalization": ana.doc_legalization,
                "doc_plans": ana.doc_plans,
                "doc_e1": ana.doc_e1,
                "doc_tax_clearance": ana.doc_tax_clearance,
                "doc_e2": ana.doc_e2,
                "inspection_fee_paid": ana.inspection_fee_paid,
            }
        else:
            response["anakainizw"] = None

    return response


def _get_portal_files_for_case(case: CMCase, db: Session) -> list:
    if not case.service_type:
        return []
    files = (
        db.query(CMPortalFile)
        .filter(CMPortalFile.service_type == case.service_type)
        .order_by(CMPortalFile.uploaded_at)
        .all()
    )
    return [
        {
            "id": f.id,
            "original_filename": f.original_filename,
            "mime_type": f.mime_type,
            "file_type": "PDF" if f.mime_type == "application/pdf" else "Word",
            "client_description": f.client_description,
            "client_instructions": f.client_instructions,
            "uploaded_at": fmt_dt(f.uploaded_at),
        }
        for f in files
    ]


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



@router.get("/public/{token}/files/{file_id}/download")
def download_portal_file_public(token: str, file_id: int, db: Session = Depends(get_db)):
    """Public download of a portal file via share token."""
    from fastapi.responses import Response as _Resp
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Not found")
    # File is shared per service_type — verify the token's case has matching service_type
    pf = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not pf or pf.service_type != case.service_type:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return _Resp(
        content=pf.file_data,
        media_type=pf.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{pf.original_filename}"'},
    )


@router.post("/public/{token}/visit")
def record_visit(token: str, body: dict, db: Session = Depends(get_db)):
    """Verify client AFM (or phone for ΑΝΑΚΑΙΝΙΖΩ) and increment visit counter."""
    import re as _re
    credential = (body.get("afm") or "").strip()
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    # For ΑΝΑΚΑΙΝΙΖΩ cases without AFM: verify against phone (token = normalized phone)
    if case.program_category == "ΑΝΑΚΑΙΝΙΖΩ" and not (case.afm or "").strip():
        normalized = _re.sub(r'\D', '', credential)
        if normalized.startswith('30') and len(normalized) > 10:
            normalized = normalized[2:]
        if not normalized or normalized != token:
            raise HTTPException(status_code=403, detail="Λάθος τηλέφωνο")
    else:
        if not credential or (case.afm or "").strip() != credential:
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
                        case.portal_notified_at = datetime.utcnow()
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
                        case.portal_notified_at = datetime.utcnow()
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
    """Client uploads a file from the portal — stored as binary in DB."""
    case = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 20MB")

    doc = CMDocument(
        case_id=case.id,
        name=file.filename or "upload",
        document_type="client_upload",
        status="pending",
        uploaded_by=case.client_name or "Πελάτης",
        uploaded_by_client=True,
        file_data=data,
        mime_type=file.content_type or "application/octet-stream",
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
    """Backward-compat: redirect old filesystem uploads; now falls back to DB lookup by name."""
    from fastapi.responses import Response as _Resp
    # Try to find by name in DB (filesystem files are gone after redeploy)
    doc = (
        db.query(CMDocument)
        .filter(CMDocument.case_id == case_id, CMDocument.uploaded_by_client == True)
        .filter(CMDocument.name.ilike(f"%{os.path.basename(filename).split('_', 2)[-1]}%"))
        .first()
    )
    if doc and doc.file_data:
        return _Resp(
            content=doc.file_data,
            media_type=doc.mime_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{doc.name}"'},
        )
    raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")


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
            "created_at": fmt_dt(d.created_at),
        }
        for d in docs
    ]
