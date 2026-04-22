from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime as _dt
from database import get_db
from models_cases import CMCase, CMPendingItemTemplate, CMCasePendingItem
from auth_cases import get_current_user
from models_cases import CMUser

router = APIRouter(tags=["cm-pending-items"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    program_category: str
    item_text: str
    sort_order: int = 0


class TemplateUpdate(BaseModel):
    item_text: Optional[str] = None
    sort_order: Optional[int] = None


class PendingItemCreate(BaseModel):
    item_text: str
    comment: Optional[str] = None
    sort_order: int = 0


class PendingItemUpdate(BaseModel):
    item_text: Optional[str] = None
    comment: Optional[str] = None
    sort_order: Optional[int] = None


class NotifyRequest(BaseModel):
    notification_type: str = "both"  # email, viber, both


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tmpl_to_dict(t: CMPendingItemTemplate) -> dict:
    return {"id": t.id, "program_category": t.program_category, "item_text": t.item_text, "sort_order": t.sort_order}


def _item_to_dict(i: CMCasePendingItem) -> dict:
    return {
        "id": i.id, "case_id": i.case_id, "item_text": i.item_text,
        "comment": i.comment, "sort_order": i.sort_order,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


# ── Admin: template CRUD ───────────────────────────────────────────────────────

@router.get("/api/cm/admin/pending-templates")
def list_templates(
    program_category: Optional[str] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(CMPendingItemTemplate)
    if program_category:
        q = q.filter(CMPendingItemTemplate.program_category == program_category)
    return [_tmpl_to_dict(t) for t in q.order_by(CMPendingItemTemplate.program_category, CMPendingItemTemplate.sort_order, CMPendingItemTemplate.id).all()]


@router.post("/api/cm/admin/pending-templates")
def create_template(
    req: TemplateCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = CMPendingItemTemplate(program_category=req.program_category, item_text=req.item_text, sort_order=req.sort_order)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tmpl_to_dict(t)


@router.put("/api/cm/admin/pending-templates/{tmpl_id}")
def update_template(
    tmpl_id: int,
    req: TemplateUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(CMPendingItemTemplate).filter(CMPendingItemTemplate.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(t, field, val)
    db.commit()
    db.refresh(t)
    return _tmpl_to_dict(t)


@router.delete("/api/cm/admin/pending-templates/{tmpl_id}")
def delete_template(
    tmpl_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(CMPendingItemTemplate).filter(CMPendingItemTemplate.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    db.delete(t)
    db.commit()
    return {"message": "Διαγράφηκε"}


# ── Per-case pending items ─────────────────────────────────────────────────────

@router.get("/api/cm/cases/{case_id}/pending-items")
def list_pending_items(
    case_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(CMCasePendingItem).filter(CMCasePendingItem.case_id == case_id).order_by(CMCasePendingItem.sort_order, CMCasePendingItem.id).all()
    return [_item_to_dict(i) for i in items]


@router.post("/api/cm/cases/{case_id}/pending-items")
def create_pending_item(
    case_id: int,
    req: PendingItemCreate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    i = CMCasePendingItem(case_id=case_id, item_text=req.item_text, comment=req.comment, sort_order=req.sort_order)
    db.add(i)
    db.commit()
    db.refresh(i)
    return _item_to_dict(i)


@router.put("/api/cm/cases/{case_id}/pending-items/{item_id}")
def update_pending_item(
    case_id: int,
    item_id: int,
    req: PendingItemUpdate,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    i = db.query(CMCasePendingItem).filter(CMCasePendingItem.id == item_id, CMCasePendingItem.case_id == case_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Εκκρεμότητα δεν βρέθηκε")
    for field, val in req.dict(exclude_none=True).items():
        setattr(i, field, val)
    i.updated_at = _dt.utcnow()
    db.commit()
    db.refresh(i)
    return _item_to_dict(i)


@router.delete("/api/cm/cases/{case_id}/pending-items/{item_id}")
def delete_pending_item(
    case_id: int,
    item_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    i = db.query(CMCasePendingItem).filter(CMCasePendingItem.id == item_id, CMCasePendingItem.case_id == case_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Εκκρεμότητα δεν βρέθηκε")
    db.delete(i)
    db.commit()
    return {"message": "Διαγράφηκε"}


@router.post("/api/cm/cases/{case_id}/pending-items/notify")
def notify_pending_items(
    case_id: int,
    req: NotifyRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from routes.cm_notifications import _send_email, _send_viber, _log_notification

    c = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")

    items = db.query(CMCasePendingItem).filter(CMCasePendingItem.case_id == case_id).order_by(CMCasePendingItem.sort_order, CMCasePendingItem.id).all()
    if not items:
        raise HTTPException(status_code=400, detail="Δεν υπάρχουν εκκρεμότητες για αποστολή")

    item_lines = "\n".join(
        f"• {i.item_text}" + (f"\n  → {i.comment}" if i.comment else "")
        for i in items
    )
    message = (
        f"Αγαπητέ/ή {c.client_name or ''},\n\n"
        f"Για την προχώρηση της υπόθεσής σας ({c.service_type or ''}) "
        f"χρειαζόμαστε τα παρακάτω:\n\n"
        f"{item_lines}\n\n"
        f"Παρακαλούμε αποστείλετε τα παραπάνω το συντομότερο δυνατό.\n\n"
        f"Με εκτίμηση,\niMentor Consulting"
    )
    subject = f"Απαιτούμενα στοιχεία για την υπόθεσή σας - {c.client_name or ''}"

    results = []
    if req.notification_type in ("email", "both") and c.email:
        ok, err = _send_email(c.email, subject, message)
        status = "sent" if ok else "failed"
        _log_notification(db, c.id, "email", c.client_name, c.email, subject, message, status, current_user.full_name)
        results.append({"type": "email", "to": c.email, "status": status, "error": err if not ok else None})
    elif req.notification_type in ("email", "both"):
        results.append({"type": "email", "status": "skipped", "error": "Δεν υπάρχει email"})

    if req.notification_type in ("viber", "both") and c.phone:
        ok, err = _send_viber(c.phone, message)
        status = "sent" if ok else "failed"
        _log_notification(db, c.id, "viber", c.client_name, c.phone, subject, message, status, current_user.full_name)
        results.append({"type": "viber", "to": c.phone, "status": status, "error": err if not ok else None})
    elif req.notification_type in ("viber", "both"):
        results.append({"type": "viber", "status": "skipped", "error": "Δεν υπάρχει τηλέφωνο"})

    db.commit()
    return {"results": results, "items_count": len(items), "message_preview": message}
