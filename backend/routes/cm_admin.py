import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
from database import get_db, fmt_dt
from models_cases import CMStatusSLA, CMCase
from auth_cases import require_admin, CMUser

log = logging.getLogger(__name__)

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


# ── Daily lead summary Viber notification ─────────────────────────────────────

ADMIN_VIBER_PHONE = "6952101541"
_PROGRAM_ORDER = ["ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", "ΔΥΠΑ", "ΕΣΠΑ", "ΑΝΑΚΑΙΝΙΖΩ"]


@router.post("/daily-lead-notify")
def daily_lead_notify(
    x_notify_secret: Optional[str] = Header(None, alias="X-Notify-Secret"),
    db: Session = Depends(get_db),
):
    """Send a Viber message to the admin with a summary of yesterday's leads.
    Protected by X-Notify-Secret header matching the DAILY_NOTIFY_SECRET env var.
    Called automatically every morning at 09:00 Athens time via scheduled trigger.
    """
    secret = os.getenv("DAILY_NOTIFY_SECRET", "")
    if secret and x_notify_secret != secret:
        raise HTTPException(status_code=403, detail="Μη εξουσιοδοτημένο")

    from models_cases import CMLead
    yesterday = date.today() - timedelta(days=1)
    day_start = datetime(yesterday.year, yesterday.month, yesterday.day, 0, 0, 0)
    day_end   = datetime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59)

    leads = (
        db.query(CMLead)
        .filter(CMLead.created_at >= day_start, CMLead.created_at <= day_end)
        .order_by(CMLead.program, CMLead.created_at)
        .all()
    )

    if not leads:
        msg = (
            f"📋 Ημερήσια Ενημέρωση Leads\n"
            f"📅 {yesterday.strftime('%d/%m/%Y')}\n\n"
            f"Δεν υπήρξαν νέα leads χθες."
        )
        from routes.cm_notifications import _send_viber
        _send_viber(phone=ADMIN_VIBER_PHONE, message=msg, client_name="Admin", agent_name="system")
        return {"ok": True, "leads_count": 0, "date": str(yesterday)}

    # Group by program
    by_program: dict[str, list] = {}
    for lead in leads:
        prog = lead.program or "ΑΛΛΟ"
        by_program.setdefault(prog, []).append(lead)

    lines = [
        f"📋 Ημερήσια Ενημέρωση Leads",
        f"📅 {yesterday.strftime('%d/%m/%Y')}",
        f"Σύνολο: {len(leads)} νέα lead{'s' if len(leads) != 1 else ''}",
        "",
    ]

    # Print programs in preferred order, then any remaining
    shown = set()
    ordered_programs = [p for p in _PROGRAM_ORDER if p in by_program]
    ordered_programs += [p for p in sorted(by_program) if p not in _PROGRAM_ORDER]

    for prog in ordered_programs:
        prog_leads = by_program[prog]
        lines.append(f"▪️ {prog} ({len(prog_leads)})")
        for lead in prog_leads:
            name_part = (lead.name or "—").strip()
            phone_part = (lead.phone or "").strip()
            status_part = lead.status or "NEW LEAD"
            entry = f"  • {name_part}"
            if phone_part:
                entry += f" | {phone_part}"
            entry += f" [{status_part}]"
            lines.append(entry)
        lines.append("")

    msg = "\n".join(lines).rstrip()

    from routes.cm_notifications import _send_viber
    ok, err = _send_viber(phone=ADMIN_VIBER_PHONE, message=msg, client_name="Admin", agent_name="system")

    if not ok:
        log.error("[daily-lead-notify] Viber send failed: %s", err)
        raise HTTPException(status_code=500, detail=f"Αποτυχία αποστολής Viber: {err}")

    log.info("[daily-lead-notify] Sent summary for %s: %d leads", yesterday, len(leads))
    return {"ok": True, "leads_count": len(leads), "date": str(yesterday), "programs": {p: len(v) for p, v in by_program.items()}}
