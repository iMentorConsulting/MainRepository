from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from database import get_db, fmt_dt
from models_cases import CMStatusSLA, CMCase
from auth_cases import require_admin, CMUser

router = APIRouter(prefix="/api/cm/admin", tags=["cm-admin"])


class SLAEntry(BaseModel):
    status: str
    sla_days: int
    notification_message: Optional[str] = None


class SLABulkUpdate(BaseModel):
    entries: List[SLAEntry]


@router.get("/sla")
def get_sla_config(
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(CMStatusSLA).order_by(CMStatusSLA.status).all()
    return [{"id": r.id, "status": r.status, "sla_days": r.sla_days, "notification_message": r.notification_message, "updated_at": fmt_dt(r.updated_at)} for r in rows]


@router.put("/sla")
def update_sla_config(
    req: SLABulkUpdate,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    updated = 0
    for entry in req.entries:
        row = db.query(CMStatusSLA).filter(CMStatusSLA.status == entry.status).first()
        if row:
            if row.sla_days != entry.sla_days:
                row.sla_days = entry.sla_days
                row.updated_at = datetime.utcnow()
                updated += 1
            row.notification_message = entry.notification_message
        else:
            db.add(CMStatusSLA(status=entry.status, sla_days=entry.sla_days, notification_message=entry.notification_message))
            updated += 1
    db.commit()
    return {"updated": updated, "message": f"Ενημερώθηκαν {updated} εγγραφές SLA."}


class BulkStatusChange(BaseModel):
    program_category: str
    from_status: str
    to_status: str


@router.post("/bulk-status-change")
def bulk_status_change(
    body: BulkStatusChange,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Change all cases in a program from one status to another."""
    cases = (
        db.query(CMCase)
        .filter(CMCase.program_category == body.program_category, CMCase.status == body.from_status)
        .all()
    )
    if not cases:
        return {"updated": 0, "message": "Δεν βρέθηκαν υποθέσεις με αυτό το status."}
    for c in cases:
        c.status = body.to_status
        c.status_changed_at = datetime.utcnow()
        c.updated_at = datetime.utcnow()
    db.commit()
    return {
        "updated": len(cases),
        "message": f"Ενημερώθηκαν {len(cases)} υποθέσεις: {body.from_status} → {body.to_status}",
    }


@router.delete("/sla/{status_name}")
def delete_sla_entry(
    status_name: str,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(CMStatusSLA).filter(CMStatusSLA.status == status_name).first()
    if not row:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    db.delete(row)
    db.commit()
    return {"message": "Διαγράφηκε"}
