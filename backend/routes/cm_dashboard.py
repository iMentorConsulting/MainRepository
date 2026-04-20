from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from database import get_db
from models_cases import CMCase, CMTask, CMNotificationLog, CMUser
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/dashboard", tags=["cm-dashboard"])

ACTIVE_STATUSES = [
    "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ",
    "ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ",
    "ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΕΝΣΤΑΣΗ",
    "ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
]


@router.get("/stats")
def dashboard_stats(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    in_30 = today + timedelta(days=30)
    in_15 = today + timedelta(days=15)

    # Total active cases
    total_cases = db.query(CMCase).filter(CMCase.status.in_(ACTIVE_STATUSES)).count()

    # Cases by status
    status_counts = {}
    for s in ACTIVE_STATUSES:
        cnt = db.query(CMCase).filter(CMCase.status == s).count()
        status_counts[s] = cnt

    # Financial totals (active cases only)
    financial = db.query(
        func.sum(CMCase.agreed_fee_application + CMCase.agreed_fee_implementation),
        func.sum(CMCase.total_paid),
    ).filter(CMCase.status.in_(ACTIVE_STATUSES)).first()

    total_agreed = float(financial[0] or 0)
    total_paid = float(financial[1] or 0)
    total_balance = total_agreed - total_paid

    # Deadlines in 30 days
    deadline_30 = db.query(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        CMCase.project_deadline != None,
        CMCase.project_deadline <= in_30,
        CMCase.project_deadline >= today,
    ).count()

    # Deadlines in 15 days (urgent)
    deadline_15 = db.query(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        CMCase.project_deadline != None,
        CMCase.project_deadline <= in_15,
        CMCase.project_deadline >= today,
    ).count()

    # Open tasks
    open_tasks = db.query(CMTask).join(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        CMTask.status != "done",
    ).count()

    # Overdue tasks
    overdue_tasks = db.query(CMTask).join(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        CMTask.status != "done",
        CMTask.due_date != None,
        CMTask.due_date < today,
    ).count()

    # Cases with balance > 0 (have outstanding payments)
    cases_with_balance = db.query(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        (CMCase.agreed_fee_application + CMCase.agreed_fee_implementation) > CMCase.total_paid,
    ).count()

    # Cases by agent
    agents_data = []
    agents = db.query(CMUser).filter(CMUser.is_active == True).all()
    for agent in agents:
        cnt = db.query(CMCase).filter(
            CMCase.assigned_agent_id == agent.id,
            CMCase.status.in_(ACTIVE_STATUSES),
        ).count()
        if cnt > 0:
            agents_data.append({"agent_name": agent.full_name, "case_count": cnt})

    # Recent activity: last 10 cases updated
    recent_cases = db.query(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES)
    ).order_by(CMCase.updated_at.desc()).limit(5).all()

    recent_list = []
    for c in recent_cases:
        agent_name = c.assigned_agent.full_name if c.assigned_agent else None
        recent_list.append({
            "id": c.id,
            "client_name": c.client_name,
            "status": c.status,
            "service_type": c.service_type,
            "assigned_agent_name": agent_name,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })

    # Urgent cases: deadline in 15 days OR high risk score
    urgent_cases = db.query(CMCase).filter(
        CMCase.status.in_(ACTIVE_STATUSES),
        CMCase.project_deadline != None,
        CMCase.project_deadline <= in_15,
        CMCase.project_deadline >= today,
    ).order_by(CMCase.project_deadline).limit(10).all()

    urgent_list = []
    for c in urgent_cases:
        days = (c.project_deadline - today).days if c.project_deadline else None
        urgent_list.append({
            "id": c.id,
            "client_name": c.client_name,
            "status": c.status,
            "service_type": c.service_type,
            "project_deadline": c.project_deadline.isoformat() if c.project_deadline else None,
            "days_to_deadline": days,
        })

    # Cases with balance
    balance_cases = (
        db.query(CMCase)
        .filter(
            CMCase.status.in_(ACTIVE_STATUSES),
            (CMCase.agreed_fee_application + CMCase.agreed_fee_implementation) > CMCase.total_paid,
            CMCase.agreed_fee_application + CMCase.agreed_fee_implementation > 0,
        )
        .order_by(
            ((CMCase.agreed_fee_application + CMCase.agreed_fee_implementation) - CMCase.total_paid).desc()
        )
        .limit(10)
        .all()
    )
    balance_list = []
    for c in balance_cases:
        total_a = (c.agreed_fee_application or 0) + (c.agreed_fee_implementation or 0)
        bal = total_a - (c.total_paid or 0)
        balance_list.append({
            "id": c.id,
            "client_name": c.client_name,
            "service_type": c.service_type,
            "total_agreed": total_a,
            "total_paid": c.total_paid or 0,
            "balance": bal,
        })

    return {
        "total_cases": total_cases,
        "status_counts": status_counts,
        "financial": {
            "total_agreed": total_agreed,
            "total_paid": total_paid,
            "total_balance": total_balance,
        },
        "deadlines": {
            "in_30_days": deadline_30,
            "in_15_days": deadline_15,
        },
        "tasks": {
            "open": open_tasks,
            "overdue": overdue_tasks,
        },
        "cases_with_balance": cases_with_balance,
        "agents_workload": sorted(agents_data, key=lambda x: x["case_count"], reverse=True),
        "recent_cases": recent_list,
        "urgent_cases": urgent_list,
        "balance_cases": balance_list,
    }
