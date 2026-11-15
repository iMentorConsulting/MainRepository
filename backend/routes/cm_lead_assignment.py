import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models_cases import CMLeadAssignmentRule, CMUser, CMLead
from auth_cases import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cm/lead-assignment", tags=["cm-lead-assignment"])


class RuleIn(BaseModel):
    program_category: Optional[str] = None
    consultant_id: int
    weight: int = 1
    sort_order: int = 0


class RulesBatchIn(BaseModel):
    rules: List[RuleIn]


def pick_consultant_from_rules(program_category: Optional[str], db: Session) -> Optional[CMUser]:
    """
    Weighted round-robin: find the active rule with the lowest assignment_count/weight ratio.
    Tries specific program rules first; falls back to catch-all (program_category IS NULL).
    Returns the CMUser to assign to, and increments that rule's assignment_count.
    Returns None if no rules are configured for this program.
    """
    rules = (
        db.query(CMLeadAssignmentRule)
        .filter(
            CMLeadAssignmentRule.is_active == True,
            CMLeadAssignmentRule.program_category == program_category,
        )
        .all()
    )
    if not rules:
        rules = (
            db.query(CMLeadAssignmentRule)
            .filter(
                CMLeadAssignmentRule.is_active == True,
                CMLeadAssignmentRule.program_category == None,
            )
            .all()
        )
    if not rules:
        return None

    best = min(rules, key=lambda r: (r.assignment_count / max(r.weight, 1), r.id))
    consultant = db.query(CMUser).filter(CMUser.id == best.consultant_id).first()
    if not consultant:
        log.warning("[auto-assign] rule %s consultant_id=%s not found", best.id, best.consultant_id)
        return None
    best.assignment_count += 1
    return consultant


@router.get("/rules")
def list_rules(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    rules = (
        db.query(CMLeadAssignmentRule)
        .order_by(
            CMLeadAssignmentRule.program_category.nullslast(),
            CMLeadAssignmentRule.sort_order,
            CMLeadAssignmentRule.id,
        )
        .all()
    )
    return [
        {
            "id": r.id,
            "program_category": r.program_category,
            "consultant_id": r.consultant_id,
            "consultant_name": r.consultant.full_name if r.consultant else None,
            "weight": r.weight,
            "is_active": r.is_active,
            "assignment_count": r.assignment_count,
            "sort_order": r.sort_order,
        }
        for r in rules
    ]


@router.put("/rules")
def save_rules(
    body: RulesBatchIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")

    existing = {
        (r.program_category, r.consultant_id): r.assignment_count
        for r in db.query(CMLeadAssignmentRule).all()
    }

    db.query(CMLeadAssignmentRule).delete()

    for item in body.rules:
        count = existing.get((item.program_category or None, item.consultant_id), 0)
        db.add(CMLeadAssignmentRule(
            program_category=item.program_category or None,
            consultant_id=item.consultant_id,
            weight=max(1, item.weight),
            is_active=True,
            assignment_count=count,
            sort_order=item.sort_order,
        ))

    db.commit()
    return {"saved": len(body.rules)}


@router.post("/reset-counts")
def reset_counts(
    program_category: Optional[str] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    q = db.query(CMLeadAssignmentRule)
    if program_category is not None:
        q = q.filter(CMLeadAssignmentRule.program_category == program_category)
    updated = q.update({"assignment_count": 0})
    db.commit()
    return {"reset": updated}


@router.get("/my-notifications")
def my_notifications(
    since: Optional[str] = None,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00").replace("+00:00", ""))
        except ValueError:
            since_dt = None

    if since_dt is None:
        since_dt = datetime.utcnow() - timedelta(hours=24)

    leads = (
        db.query(CMLead)
        .filter(
            CMLead.assigned_agent_id == current_user.id,
            CMLead.auto_assigned_at != None,
            CMLead.auto_assigned_at >= since_dt,
        )
        .order_by(CMLead.auto_assigned_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": l.id,
            "name": l.name,
            "program": l.program,
            "program_title": l.program_title,
            "status": l.status,
            "auto_assigned_at": l.auto_assigned_at.isoformat() if l.auto_assigned_at else None,
        }
        for l in leads
    ]
