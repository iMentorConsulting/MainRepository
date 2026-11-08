from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import get_db
from models_cases import CMCaseDocChecklist, CMCaseDocChecklistItem, CMCase
from auth_cases import get_current_user
from models_cases import CMUser

router = APIRouter(tags=["cm-case-doc-checklist"])


# ── Pydantic ───────────────────────────────────────────────────────────────────

class ChecklistItemInput(BaseModel):
    item_code: Optional[str] = None
    opske_code: Optional[str] = None
    group_code: Optional[str] = None
    group_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    requirement_type: Optional[str] = None
    condition_notes: Optional[str] = None
    is_applicable: bool = True
    sort_order: int = 0


class ChecklistCreate(BaseModel):
    doc_set_id: Optional[int] = None
    title: str
    notes: Optional[str] = None
    items: List[ChecklistItemInput]


class ChecklistUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None   # active | hidden


class ChecklistItemUpdate(BaseModel):
    is_applicable: Optional[bool] = None
    is_received: Optional[bool] = None
    client_notes: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _item_dict(i: CMCaseDocChecklistItem) -> dict:
    return {
        "id": i.id,
        "checklist_id": i.checklist_id,
        "item_code": i.item_code,
        "opske_code": i.opske_code,
        "group_code": i.group_code,
        "group_name": i.group_name,
        "title": i.title,
        "description": i.description,
        "requirement_type": i.requirement_type,
        "condition_notes": i.condition_notes,
        "is_applicable": i.is_applicable,
        "is_received": i.is_received,
        "received_at": i.received_at.isoformat() if i.received_at else None,
        "client_notes": i.client_notes,
        "sort_order": i.sort_order,
    }


def _checklist_dict(c: CMCaseDocChecklist, include_items: bool = False) -> dict:
    total = len(c.items) if c.items is not None else 0
    applicable = sum(1 for i in (c.items or []) if i.is_applicable)
    received = sum(1 for i in (c.items or []) if i.is_received and i.is_applicable)
    d = {
        "id": c.id,
        "case_id": c.case_id,
        "doc_set_id": c.doc_set_id,
        "title": c.title,
        "notes": c.notes,
        "status": c.status,
        "assigned_by_id": c.assigned_by_id,
        "total_items": total,
        "applicable_items": applicable,
        "received_items": received,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_items:
        d["items"] = [_item_dict(i) for i in (c.items or [])]
    return d


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/api/cm/cases/{case_id}/doc-checklists")
def list_checklists(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    rows = (
        db.query(CMCaseDocChecklist)
        .filter(CMCaseDocChecklist.case_id == case_id)
        .order_by(CMCaseDocChecklist.created_at.desc())
        .all()
    )
    return [_checklist_dict(r) for r in rows]


@router.post("/api/cm/cases/{case_id}/doc-checklists")
def create_checklist(
    case_id: int,
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    checklist = CMCaseDocChecklist(
        case_id=case_id,
        doc_set_id=body.doc_set_id,
        title=body.title,
        notes=body.notes,
        status="active",
        assigned_by_id=current_user.id,
    )
    db.add(checklist)
    db.flush()
    for idx, item in enumerate(body.items):
        db.add(CMCaseDocChecklistItem(
            checklist_id=checklist.id,
            item_code=item.item_code,
            opske_code=item.opske_code,
            group_code=item.group_code,
            group_name=item.group_name,
            title=item.title,
            description=item.description,
            requirement_type=item.requirement_type,
            condition_notes=item.condition_notes,
            is_applicable=item.is_applicable,
            sort_order=item.sort_order if item.sort_order is not None else idx,
        ))
    db.commit()
    db.refresh(checklist)
    return _checklist_dict(checklist, include_items=True)


@router.get("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def get_checklist(
    case_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return _checklist_dict(c, include_items=True)


@router.put("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def update_checklist(
    case_id: int,
    checklist_id: int,
    body: ChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(c, field, val)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return _checklist_dict(c, include_items=True)


@router.delete("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def delete_checklist(
    case_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.put("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}/items/{item_id}")
def update_checklist_item(
    case_id: int,
    checklist_id: int,
    item_id: int,
    body: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    item = db.query(CMCaseDocChecklistItem).filter(
        CMCaseDocChecklistItem.id == item_id,
        CMCaseDocChecklistItem.checklist_id == checklist_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    data = body.model_dump(exclude_none=True)
    for field, val in data.items():
        setattr(item, field, val)
    if "is_received" in data and data["is_received"] and not item.received_at:
        item.received_at = datetime.utcnow()
    elif "is_received" in data and not data["is_received"]:
        item.received_at = None
    db.commit()
    db.refresh(item)
    return _item_dict(item)
