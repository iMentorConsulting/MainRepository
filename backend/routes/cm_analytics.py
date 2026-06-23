from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models_cases import CMCase, CMUser, CMCaseStatusHistory, CMStatusSLA
from auth_cases import get_current_user
from datetime import datetime, date, timedelta

router = APIRouter(prefix="/api/cm/analytics", tags=["analytics"])


def _terminal():
    from pipelines import TERMINAL_STATUSES
    return set(TERMINAL_STATUSES)


@router.get("/overview")
def analytics_overview(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    terminal = _terminal()
    all_cases = db.query(CMCase).all()
    total = len(all_cases)
    completed = sum(1 for c in all_cases if c.status in terminal)
    active = total - completed

    sla_map = {s.status: s.sla_days for s in db.query(CMStatusSLA).all()}
    now = datetime.utcnow()
    overdue = sum(
        1 for c in all_cases
        if c.status not in terminal and c.status_changed_at and c.status in sla_map
        and (now - c.status_changed_at).days > sla_map[c.status]
    )

    # Cases per program
    prog_counts = {}
    for c in all_cases:
        p = c.program_category or "ΕΣΠΑ"
        prog_counts[p] = prog_counts.get(p, 0) + 1

    # Cases per agent
    agent_counts = {}
    for c in all_cases:
        if c.status in terminal:
            continue
        name = c.assigned_agent.full_name if c.assigned_agent else "Χωρίς ανάθεση"
        agent_counts[name] = agent_counts.get(name, 0) + 1

    # Avg days per status (from status history transitions)
    from sqlalchemy import text as _t
    rows = db.execute(_t("""
        SELECT h1.to_status,
               AVG(EXTRACT(EPOCH FROM (h2.changed_at - h1.changed_at)) / 86400) AS avg_days
        FROM cm_case_status_history h1
        JOIN cm_case_status_history h2
          ON h2.case_id = h1.case_id
          AND h2.id = (
              SELECT id FROM cm_case_status_history
              WHERE case_id = h1.case_id AND id > h1.id
              ORDER BY id LIMIT 1
          )
        GROUP BY h1.to_status
        ORDER BY avg_days DESC
        LIMIT 10
    """)).fetchall()
    avg_per_status = [{"status": r[0], "avg_days": round(r[1], 1)} for r in rows if r[1] is not None]

    return {
        "total": total,
        "active": active,
        "completed": completed,
        "sla_overdue": overdue,
        "per_program": [{"program": k, "count": v} for k, v in prog_counts.items()],
        "per_agent": [{"agent": k, "count": v} for k, v in sorted(agent_counts.items(), key=lambda x: -x[1])],
        "avg_days_per_status": avg_per_status,
    }


@router.get("/milestones")
def analytics_milestones(
    days_ahead: int = 90,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    terminal = _terminal()
    today = date.today()
    horizon = today + timedelta(days=days_ahead)

    cases = db.query(CMCase).filter(~CMCase.status.in_(list(terminal))).all()
    result = []

    for c in cases:
        events = []

        if c.project_deadline and today <= c.project_deadline <= horizon:
            days = (c.project_deadline - today).days
            events.append({"type": "deadline", "label": "Προθεσμία Ολοκλήρωσης",
                           "date": c.project_deadline.isoformat(), "days_away": days})

        if c.program_category == "ΔΥΠΑ" and c.dypa_start_date:
            from datetime import timedelta as _td
            ms_b = c.dypa_start_date + _td(days=180)
            ms_c = c.dypa_start_date + _td(days=365)
            # dypa_start_date is a date column, so ms_b/ms_c are already date objects
            for label, d in [("Β Ορόσημο ΔΥΠΑ", ms_b), ("Γ Ορόσημο ΔΥΠΑ", ms_c)]:
                d_date = d if isinstance(d, date) else d.date()
                if today <= d_date <= horizon:
                    events.append({"type": "dypa_milestone", "label": label,
                                   "date": d_date.isoformat(), "days_away": (d_date - today).days})

        if c.follow_up_date and today <= c.follow_up_date <= horizon:
            events.append({"type": "followup", "label": "Follow-up",
                           "date": c.follow_up_date.isoformat(), "days_away": (c.follow_up_date - today).days})

        if events:
            result.append({
                "case_id": c.id,
                "client_name": c.client_name,
                "service_type": c.service_type,
                "program_category": c.program_category,
                "assigned_agent": c.assigned_agent.full_name if c.assigned_agent else None,
                "events": sorted(events, key=lambda e: e["days_away"]),
            })

    return sorted(result, key=lambda x: x["events"][0]["days_away"])


@router.get("/calendar")
def analytics_calendar(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all upcoming deadline/milestone events for calendar view."""
    terminal = _terminal()
    today = date.today()
    horizon = today + timedelta(days=365)
    cases = db.query(CMCase).all()
    events = []

    for c in cases:
        is_done = c.status in terminal

        if c.project_deadline and c.project_deadline >= today:
            events.append({
                "date": c.project_deadline.isoformat(),
                "type": "deadline",
                "label": "Προθεσμία",
                "case_id": c.id,
                "client_name": c.client_name,
                "program_category": c.program_category,
                "service_type": c.service_type,
                "done": is_done,
            })

        if c.program_category == "ΔΥΠΑ" and c.dypa_start_date and not is_done:
            from datetime import timedelta as _td
            for label, d in [
                ("Β Ορόσημο", (c.dypa_start_date + _td(days=180)).isoformat()),
                ("Γ Ορόσημο", (c.dypa_start_date + _td(days=365)).isoformat()),
            ]:
                if d >= today.isoformat():
                    events.append({"date": d, "type": "dypa", "label": label,
                                   "case_id": c.id, "client_name": c.client_name,
                                   "program_category": c.program_category, "service_type": c.service_type,
                                   "done": False})

        if c.follow_up_date and c.follow_up_date >= today and not is_done:
            events.append({
                "date": c.follow_up_date.isoformat(),
                "type": "followup",
                "label": "Follow-up",
                "case_id": c.id,
                "client_name": c.client_name,
                "program_category": c.program_category,
                "service_type": c.service_type,
                "done": False,
            })

    return sorted(events, key=lambda e: e["date"])
