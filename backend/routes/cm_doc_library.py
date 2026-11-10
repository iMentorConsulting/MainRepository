from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import get_db
from models_cases import CMDocSet, CMDocSetItem, REQUIREMENT_TYPES, GROUP_NAMES
from auth_cases import get_current_user
from models_cases import CMUser

router = APIRouter(tags=["cm-doc-library"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class DocSetCreate(BaseModel):
    name: str
    program_category: Optional[str] = None
    program_title: Optional[str] = None
    applicant_type: Optional[str] = None  # new_business | existing_business | both
    legal_form: Optional[str] = None      # Ατομική | ΟΕ/ΕΕ/ΙΚΕ/ΕΠΕ | ΑΕ | ΚοινΣΕπ | None=all
    description: Optional[str] = None
    sort_order: int = 0


class DocSetUpdate(BaseModel):
    name: Optional[str] = None
    program_category: Optional[str] = None
    program_title: Optional[str] = None
    applicant_type: Optional[str] = None
    legal_form: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class DocSetItemCreate(BaseModel):
    item_code: Optional[str] = None
    opske_code: Optional[str] = None
    group_code: Optional[str] = None
    title: str
    description: Optional[str] = None
    requirement_type: str = "ΥΠΟΧΡΕΩΤΙΚΟ"
    condition_notes: Optional[str] = None
    source_page: Optional[str] = None
    applicable_legal_forms: Optional[str] = None
    sort_order: int = 0


class DocSetItemUpdate(BaseModel):
    item_code: Optional[str] = None
    opske_code: Optional[str] = None
    group_code: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    requirement_type: Optional[str] = None
    condition_notes: Optional[str] = None
    source_page: Optional[str] = None
    applicable_legal_forms: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ReorderRequest(BaseModel):
    ordered_ids: List[int]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_to_dict(s: CMDocSet, include_items: bool = False) -> dict:
    d = {
        "id": s.id,
        "name": s.name,
        "program_category": s.program_category,
        "program_title": s.program_title,
        "applicant_type": s.applicant_type,
        "legal_form": s.legal_form,
        "description": s.description,
        "is_active": s.is_active,
        "sort_order": s.sort_order,
        "item_count": len(s.items) if s.items is not None else 0,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    if include_items:
        d["items"] = [_item_to_dict(i) for i in s.items]
    return d


def _item_to_dict(i: CMDocSetItem) -> dict:
    return {
        "id": i.id,
        "set_id": i.set_id,
        "item_code": i.item_code,
        "opske_code": i.opske_code,
        "group_code": i.group_code,
        "group_name": GROUP_NAMES.get(i.group_code or "", i.group_code or ""),
        "title": i.title,
        "description": i.description,
        "requirement_type": i.requirement_type,
        "condition_notes": i.condition_notes,
        "source_page": i.source_page,
        "applicable_legal_forms": i.applicable_legal_forms,
        "sort_order": i.sort_order,
        "is_active": i.is_active,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


# ── Sets CRUD ──────────────────────────────────────────────────────────────────

@router.get("/api/cm/doc-sets")
def list_doc_sets(
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    sets = db.query(CMDocSet).order_by(CMDocSet.sort_order, CMDocSet.id).all()
    return [_set_to_dict(s) for s in sets]


@router.get("/api/cm/doc-sets/{set_id}")
def get_doc_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    s = db.query(CMDocSet).filter(CMDocSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    return _set_to_dict(s, include_items=True)


@router.post("/api/cm/doc-sets")
def create_doc_set(
    body: DocSetCreate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    s = CMDocSet(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _set_to_dict(s)


@router.put("/api/cm/doc-sets/{set_id}")
def update_doc_set(
    set_id: int,
    body: DocSetUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    s = db.query(CMDocSet).filter(CMDocSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(s, field, val)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _set_to_dict(s, include_items=True)


@router.delete("/api/cm/doc-sets/{set_id}")
def delete_doc_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    s = db.query(CMDocSet).filter(CMDocSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ── Items CRUD ─────────────────────────────────────────────────────────────────

@router.get("/api/cm/doc-sets/{set_id}/items")
def list_items(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    s = db.query(CMDocSet).filter(CMDocSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    return [_item_to_dict(i) for i in s.items]


@router.post("/api/cm/doc-sets/{set_id}/items")
def create_item(
    set_id: int,
    body: DocSetItemCreate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    s = db.query(CMDocSet).filter(CMDocSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    item = CMDocSetItem(set_id=set_id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


@router.put("/api/cm/doc-sets/{set_id}/items/{item_id}")
def update_item(
    set_id: int,
    item_id: int,
    body: DocSetItemUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    item = db.query(CMDocSetItem).filter(
        CMDocSetItem.id == item_id,
        CMDocSetItem.set_id == set_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(item, field, val)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


@router.delete("/api/cm/doc-sets/{set_id}/items/{item_id}")
def delete_item(
    set_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    item = db.query(CMDocSetItem).filter(
        CMDocSetItem.id == item_id,
        CMDocSetItem.set_id == set_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/api/cm/doc-sets/{set_id}/reorder")
def reorder_items(
    set_id: int,
    body: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    for idx, item_id in enumerate(body.ordered_ids):
        db.query(CMDocSetItem).filter(
            CMDocSetItem.id == item_id,
            CMDocSetItem.set_id == set_id,
        ).update({"sort_order": idx, "updated_at": datetime.utcnow()})
    db.commit()
    return {"ok": True}


# ── Metadata ───────────────────────────────────────────────────────────────────

@router.get("/api/cm/doc-library/meta")
def get_meta(current_user: CMUser = Depends(get_current_user)):
    return {
        "requirement_types": REQUIREMENT_TYPES,
        "groups": [{"code": k, "name": v} for k, v in GROUP_NAMES.items()],
    }
