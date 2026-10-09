from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import MaintenanceIssue, Unit, Booking
from auth_utils import get_tenant
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

CATEGORIES = [
    "Ηλεκτρολόγος", "Υδραυλικός", "AC / Κλιματισμός", "Πισίνα",
    "Λευκές Συσκευές", "Κήπος", "Ασφάλεια / Κλειδαριές",
    "Έπιπλα / Εξοπλισμός", "Wifi / Τεχνολογία", "Γενικά",
]
PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


class IssueIn(BaseModel):
    unit_id: int
    title: str
    description: Optional[str] = None
    category: str
    priority: str = "medium"
    status: str = "open"
    reported_by: str = "manager"
    reporter_name: Optional[str] = None
    notes: Optional[str] = None
    booking_id: Optional[int] = None


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


def _serialize(issue: MaintenanceIssue) -> dict:
    return {
        "id": issue.id,
        "unit_id": issue.unit_id,
        "unit_name": issue.unit.name if issue.unit else "",
        "title": issue.title,
        "description": issue.description or "",
        "category": issue.category,
        "priority": issue.priority,
        "status": issue.status,
        "reported_by": issue.reported_by,
        "reporter_name": issue.reporter_name or "",
        "notes": issue.notes or "",
        "booking_id": issue.booking_id,
        "created_at": issue.created_at.isoformat(),
        "resolved_at": issue.resolved_at.isoformat() if issue.resolved_at else None,
    }


@router.get("/categories")
def get_categories():
    return CATEGORIES


@router.get("/")
def list_issues(
    status: Optional[str] = None,
    unit_id: Optional[int] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    q = db.query(MaintenanceIssue).options(
        joinedload(MaintenanceIssue.unit)
    ).filter(MaintenanceIssue.tenant == tenant)
    if status:
        q = q.filter(MaintenanceIssue.status == status)
    if unit_id:
        q = q.filter(MaintenanceIssue.unit_id == unit_id)
    if priority:
        q = q.filter(MaintenanceIssue.priority == priority)
    if category:
        q = q.filter(MaintenanceIssue.category == category)

    issues = q.order_by(MaintenanceIssue.created_at.desc()).all()
    issues.sort(key=lambda x: (PRIORITY_ORDER.get(x.priority, 99), x.created_at.isoformat()))
    return [_serialize(i) for i in issues]


@router.post("/")
def create_issue(
    data: IssueIn,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    issue = MaintenanceIssue(tenant=tenant, **data.dict())
    db.add(issue)
    db.commit()
    db.refresh(issue)
    db.refresh(issue, ["unit"])

    # Email notification to manager
    try:
        from email_utils import send_notification_email
        from models import GuestPortalSettings
        settings = db.query(GuestPortalSettings).filter(
            GuestPortalSettings.tenant == tenant
        ).first()
        if settings and settings.notification_email:
            priority_el = {"low": "Χαμηλή", "medium": "Μέτρια", "high": "Υψηλή", "urgent": "ΕΠΕΙΓΟΝ"}.get(issue.priority, issue.priority)
            body = (
                f"Νέο πρόβλημα συντήρησης:\n\n"
                f"Μονάδα: {issue.unit.name}\n"
                f"Τίτλος: {issue.title}\n"
                f"Κατηγορία: {issue.category}\n"
                f"Προτεραιότητα: {priority_el}\n"
                f"Αναφέρθηκε από: {issue.reported_by}"
                + (f" ({issue.reporter_name})" if issue.reporter_name else "")
                + f"\n\nΠεριγραφή:\n{issue.description or '-'}"
            )
            send_notification_email(
                settings.notification_email,
                f"🔧 Νέο Πρόβλημα: {issue.unit.name} — {issue.title}",
                body,
                tenant=tenant,
                db=db,
            )
    except Exception as e:
        print(f"[maintenance] email error: {e}")

    return _serialize(issue)


@router.put("/{issue_id}")
def update_issue(
    issue_id: int,
    data: IssueIn,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    issue = db.query(MaintenanceIssue).filter(
        MaintenanceIssue.id == issue_id, MaintenanceIssue.tenant == tenant
    ).first()
    if not issue:
        raise HTTPException(404)
    for k, v in data.dict().items():
        setattr(issue, k, v)
    if data.status == "resolved" and not issue.resolved_at:
        issue.resolved_at = datetime.utcnow()
    elif data.status != "resolved":
        issue.resolved_at = None
    db.commit()
    db.refresh(issue, ["unit"])
    return _serialize(issue)


@router.patch("/{issue_id}/status")
def update_status(
    issue_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    issue = db.query(MaintenanceIssue).options(
        joinedload(MaintenanceIssue.unit)
    ).filter(MaintenanceIssue.id == issue_id, MaintenanceIssue.tenant == tenant).first()
    if not issue:
        raise HTTPException(404)
    issue.status = data.status
    if data.notes:
        issue.notes = (issue.notes or "") + f"\n[{datetime.utcnow().strftime('%d/%m/%Y')}] {data.notes}"
    if data.status == "resolved" and not issue.resolved_at:
        issue.resolved_at = datetime.utcnow()
    elif data.status != "resolved":
        issue.resolved_at = None
    db.commit()
    return _serialize(issue)


@router.delete("/{issue_id}")
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    issue = db.query(MaintenanceIssue).filter(
        MaintenanceIssue.id == issue_id, MaintenanceIssue.tenant == tenant
    ).first()
    if not issue:
        raise HTTPException(404)
    db.delete(issue)
    db.commit()
    return {"ok": True}


@router.get("/stats")
def issue_stats(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    issues = db.query(MaintenanceIssue).filter(MaintenanceIssue.tenant == tenant).all()
    return {
        "open": sum(1 for i in issues if i.status == "open"),
        "in_progress": sum(1 for i in issues if i.status == "in_progress"),
        "resolved": sum(1 for i in issues if i.status == "resolved"),
        "urgent": sum(1 for i in issues if i.priority == "urgent" and i.status != "resolved"),
    }
