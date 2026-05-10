from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from database import get_db
from models_cases import CMCase, CMUser, CMCaseStatusHistory
from auth_cases import get_current_user
from pipelines import TERMINAL_STATUSES

router = APIRouter(prefix="/api/cm/analytics", tags=["analytics"])


def _is_active(c: CMCase) -> bool:
    return (c.status or "") not in TERMINAL_STATUSES


def _is_sla_overdue(c: CMCase) -> bool:
    if not c.status_changed_at:
        return False
    try:
        from routes.cm_admin import _get_sla_days
        sla = _get_sla_days(c.status)
    except Exception:
        sla = 14
    age = (datetime.utcnow() - c.status_changed_at).days
    return age > sla


@router.get("/overview")
def analytics_overview(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cases = (
        db.query(CMCase)
        .options(joinedload(CMCase.assigned_agent), joinedload(CMCase.status_history))
        .all()
    )

    total = len(cases)
    active = sum(1 for c in cases if _is_active(c))
    completed = total - active
    sla_overdue = sum(1 for c in cases if _is_active(c) and _is_sla_overdue(c))

    # Per program
    from collections import Counter
    prog_counter = Counter(c.program_category or "ΕΣΠΑ" for c in cases if _is_active(c))
    per_program = [{"program": k, "count": v} for k, v in prog_counter.most_common()]

    # Per agent (active cases only)
    agent_counter = Counter(
        (c.assigned_agent.full_name if c.assigned_agent else "Αναθεμένο")
        for c in cases if _is_active(c)
    )
    per_agent = [{"agent": k, "count": v} for k, v in agent_counter.most_common()]

    # Avg days per status transition (from history)
    history_all = db.query(CMCaseStatusHistory).all()
    status_durations: dict[str, list[float]] = {}
    history_by_case: dict[int, list] = {}
    for h in history_all:
        history_by_case.setdefault(h.case_id, []).append(h)

    for case_id, entries in history_by_case.items():
        entries_sorted = sorted(entries, key=lambda x: x.changed_at)
        for i in range(len(entries_sorted) - 1):
            h_from = entries_sorted[i]
            h_to = entries_sorted[i + 1]
            days = (h_to.changed_at - h_from.changed_at).total_seconds() / 86400
            status = h_from.to_status or ""
            if status and days >= 0:
                status_durations.setdefault(status, []).append(days)

    avg_days_per_status = sorted(
        [
            {"status": s, "avg_days": round(sum(vals) / len(vals), 1)}
            for s, vals in status_durations.items()
            if vals
        ],
        key=lambda x: -x["avg_days"],
    )[:15]

    return {
        "total": total,
        "active": active,
        "completed": completed,
        "sla_overdue": sla_overdue,
        "per_program": per_program,
        "per_agent": per_agent,
        "avg_days_per_status": avg_days_per_status,
    }


@router.get("/milestones")
def analytics_milestones(
    days: int = 90,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    cutoff = today + timedelta(days=days)

    cases = (
        db.query(CMCase)
        .options(joinedload(CMCase.assigned_agent))
        .filter(CMCase.status.notin_(TERMINAL_STATUSES))
        .all()
    )

    result = []
    for c in cases:
        events = []
        if c.project_deadline and today <= c.project_deadline <= cutoff:
            delta = (c.project_deadline - today).days
            events.append({"type": "deadline", "label": "Προθεσμία", "days_away": delta})
        if c.dypa_start_date and today <= c.dypa_start_date <= cutoff:
            delta = (c.dypa_start_date - today).days
            events.append({"type": "dypa_milestone", "label": "ΔΥΠΑ Ορόσημο", "days_away": delta})
        if c.follow_up_date and today <= c.follow_up_date <= cutoff:
            delta = (c.follow_up_date - today).days
            events.append({"type": "followup", "label": "Follow-up", "days_away": delta})
        if events:
            result.append({
                "case_id": c.id,
                "client_name": c.client_name,
                "service_type": c.service_type,
                "assigned_agent": c.assigned_agent.full_name if c.assigned_agent else None,
                "events": sorted(events, key=lambda e: e["days_away"]),
            })

    result.sort(key=lambda r: r["events"][0]["days_away"])
    return result


@router.get("/calendar")
def analytics_calendar(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cases = (
        db.query(CMCase)
        .options(joinedload(CMCase.assigned_agent))
        .all()
    )

    events = []
    for c in cases:
        if c.project_deadline:
            events.append({
                "date": c.project_deadline.isoformat(),
                "type": "deadline",
                "case_id": c.id,
                "client_name": c.client_name,
                "done": c.status in TERMINAL_STATUSES,
            })
        if c.dypa_start_date:
            events.append({
                "date": c.dypa_start_date.isoformat(),
                "type": "dypa",
                "case_id": c.id,
                "client_name": c.client_name,
                "done": c.status in TERMINAL_STATUSES,
            })
        if c.follow_up_date:
            events.append({
                "date": c.follow_up_date.isoformat(),
                "type": "followup",
                "case_id": c.id,
                "client_name": c.client_name,
                "done": c.status in TERMINAL_STATUSES,
            })

    events.sort(key=lambda e: e["date"])
    return events
