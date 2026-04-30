import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models_cases import CMCase, CMCasePendingItem, CMMessage
from pipelines import PIPELINES
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/portal", tags=["portal"])


def _get_current_phase_id(status: str, program_category: str) -> str | None:
    pipeline = PIPELINES.get(program_category, {})
    for phase in pipeline.get("phases", []):
        if status in phase["statuses"]:
            return phase["id"]
    return None


def _build_portal_data(case: CMCase) -> dict:
    pipeline = PIPELINES.get(case.program_category or "ΕΣΠΑ", {})
    phases = [
        {"id": p["id"], "label": p["label"], "color": p["color"]}
        for p in pipeline.get("phases", [])
    ]
    current_phase_id = _get_current_phase_id(case.status or "", case.program_category or "ΕΣΠΑ")

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

    return {
        "client_name": case.client_name,
        "service_type": case.service_type,
        "program_category": case.program_category,
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
        "portal_visit_count": case.portal_visit_count or 0,
    }


@router.get("/public/{token}")
def get_portal(token: str, db: Session = Depends(get_db)):
    case = (
        db.query(CMCase)
        .options(
            joinedload(CMCase.assigned_agent),
            joinedload(CMCase.pending_items),
            joinedload(CMCase.messages).joinedload(CMMessage.user),
        )
        .filter(CMCase.share_token == token)
        .first()
    )
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    case.portal_visit_count = (case.portal_visit_count or 0) + 1
    db.commit()

    return _build_portal_data(case)


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
