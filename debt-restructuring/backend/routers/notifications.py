from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from database import get_db, SessionLocal
from models import Notification, Lead
from auth_utils import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

ADMIN_RECIPIENT = "HARIS"
EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]

_ATHENS = ZoneInfo("Europe/Athens")


def create_notification(db: Session, recipient: str, kind: str, title: str, message: str,
                         link: str | None = None, case_id: int | None = None) -> Notification:
    n = Notification(recipient=recipient, kind=kind, title=title, message=message,
                      link=link, case_id=case_id)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@router.get("/pending")
def get_pending_notifications(current_user: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return this user's not-yet-delivered notifications and mark them delivered.

    One-shot delivery: once fetched they won't be returned again (matches the
    "toast pops up once" UX — there is no persistent notification center).
    """
    rows = (
        db.query(Notification)
        .filter(Notification.recipient == current_user, Notification.delivered == False)  # noqa: E712
        .order_by(Notification.created_at.asc())
        .all()
    )
    out = [
        {
            "id": r.id,
            "kind": r.kind,
            "title": r.title,
            "message": r.message,
            "link": r.link,
            "caseId": r.case_id,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    for r in rows:
        r.delivered = True
    db.commit()
    return out


def _athens_today_bounds():
    now_athens = datetime.now(_ATHENS)
    start = now_athens.replace(hour=0, minute=0, second=0, microsecond=0)
    end_exclusive = start + timedelta(days=1)
    # Lead.app_next_call is stored naive (no tzinfo) — convert Athens midnight to naive UTC.
    return start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None), end_exclusive.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def run_daily_reminder_summary() -> dict:
    """Create one 'reminders due today or earlier' notification per consultant,
    plus a per-consultant breakdown notification for the admin. Skips employees
    with zero due reminders. Meant to run once a day before anyone logs in —
    the /notifications/pending one-shot delivery naturally makes it appear on
    each person's first app open that day.
    """
    _, due_before = _athens_today_bounds()
    db = SessionLocal()
    created = 0
    try:
        per_employee = {}
        for emp in EMPLOYEES:
            count = (
                db.query(func.count(Lead.id))
                .filter(
                    Lead.assigned_to == emp,
                    Lead.app_next_call.isnot(None),
                    Lead.app_next_call < due_before,
                    Lead.status != "cancelled",
                )
                .scalar()
                or 0
            )
            per_employee[emp] = count
            if count > 0:
                create_notification(
                    db, emp, "daily_reminders",
                    "Υπενθυμίσεις σήμερα",
                    f"Έχεις {count} lead{'s' if count != 1 else ''} με υπενθύμιση σήμερα ή παλαιότερα.",
                    link="/leads",
                )
                created += 1

        admin_total = sum(per_employee.values())
        if admin_total > 0:
            breakdown = ", ".join(f"{emp}: {c}" for emp, c in per_employee.items() if c > 0)
            create_notification(
                db, ADMIN_RECIPIENT, "daily_reminders_admin",
                "Υπενθυμίσεις ανά σύμβουλο",
                f"Σύνολο {admin_total} ληξιπρόθεσμων υπενθυμίσεων — {breakdown}",
                link="/leads",
            )
            created += 1
        return {"ok": True, "created": created, "per_employee": per_employee}
    finally:
        db.close()
