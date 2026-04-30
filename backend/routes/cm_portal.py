import uuid
import os
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models_cases import CMCase, CMCasePendingItem, CMMessage, CMBudgetCategory
from pipelines import PIPELINES
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/portal", tags=["portal"])


def _get_current_phase_id(status: str, program_category: str) -> str | None:
    pipeline = PIPELINES.get(program_category, {})
    for phase in pipeline.get("phases", []):
        if status in phase["statuses"]:
            return phase["id"]
    return None


def _get_next_status(status: str, program_category: str) -> str | None:
    """Return the next status in the pipeline sequence, or None if last/not found."""
    pipeline = PIPELINES.get(program_category, {})
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


def _get_full_status_list(program_category: str) -> list[dict]:
    """Return all statuses in order with phase info."""
    pipeline = PIPELINES.get(program_category, {})
    result = []
    for phase in pipeline.get("phases", []):
        for s in phase["statuses"]:
            result.append({"status": s, "phase_id": phase["id"], "phase_label": phase["label"], "color": phase["color"]})
    return result


def _build_portal_data(case: CMCase) -> dict:
    prog = case.program_category or "ΕΣΠΑ"
    pipeline = PIPELINES.get(prog, {})
    phases = [
        {"id": p["id"], "label": p["label"], "color": p["color"]}
        for p in pipeline.get("phases", [])
    ]
    current_phase_id = _get_current_phase_id(case.status or "", prog)
    next_status = _get_next_status(case.status or "", prog)
    full_status_list = _get_full_status_list(prog)

    pending_items = [
        {"id": pi.id, "item_text": pi.item_text, "comment": pi.comment}
        for pi in (case.pending_items or [])
    ]

    external_messages = sorted(
        [m for m in (case.messages or []) if not m.is_internal],
        key=lambda m: m.created_at,
    )[-10:]
    messages_out = [
        {
            "id": m.id,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "author": m.user.full_name if m.user else "iMentor",
        }
        for m in external_messages
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
    }


@router.get("/public/{token}")
def get_portal(token: str, db: Session = Depends(get_db)):
    """Return portal data without incrementing visit count."""
    case = (
        db.query(CMCase)
        .options(
            joinedload(CMCase.assigned_agent),
            joinedload(CMCase.pending_items),
            joinedload(CMCase.messages).joinedload(CMMessage.user),
            joinedload(CMCase.budget_categories),
        )
        .filter(CMCase.share_token == token)
        .first()
    )
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    return _build_portal_data(case)


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
               .replace("{portal_url}", portal_url))

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
