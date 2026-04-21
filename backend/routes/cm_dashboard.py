from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, timedelta
from database import get_db
from models_cases import CMCase, CMTask, CMUser, CMStatusSLA
from auth_cases import require_admin, CMUser as CMUserModel
from pipelines import TERMINAL_CATEGORIES

router = APIRouter(prefix="/api/cm/dashboard", tags=["cm-dashboard"])

fmt_eur = lambda v: round(float(v or 0), 2)


@router.get("/stats")
def dashboard_stats(
    current_user: CMUserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    today = date.today()
    now = datetime.utcnow()
    in_30 = today + timedelta(days=30)
    in_15 = today + timedelta(days=15)
    terminal = list(TERMINAL_CATEGORIES)

    def active_q():
        return db.query(CMCase).filter(~CMCase.status_category.in_(terminal))

    # ── Summary ──────────────────────────────────────────────────────────
    total_active = active_q().count()

    fin = db.query(
        func.sum(CMCase.agreed_fee_application + CMCase.agreed_fee_implementation),
        func.sum(CMCase.total_paid),
    ).filter(~CMCase.status_category.in_(terminal)).first()
    total_agreed = fmt_eur(fin[0])
    total_paid = fmt_eur(fin[1])
    total_balance = round(total_agreed - total_paid, 2)

    deadline_30 = active_q().filter(CMCase.project_deadline != None, CMCase.project_deadline <= in_30, CMCase.project_deadline >= today).count()
    deadline_15 = active_q().filter(CMCase.project_deadline != None, CMCase.project_deadline <= in_15, CMCase.project_deadline >= today).count()
    open_tasks = db.query(CMTask).join(CMCase).filter(~CMCase.status_category.in_(terminal), CMTask.status != "done").count()
    overdue_tasks = db.query(CMTask).join(CMCase).filter(~CMCase.status_category.in_(terminal), CMTask.status != "done", CMTask.due_date != None, CMTask.due_date < today).count()

    # ── By Program ────────────────────────────────────────────────────────
    by_program = []
    for prog in ["ΕΣΠΑ", "ΔΥΠΑ", "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"]:
        rows = db.query(
            func.count(CMCase.id),
            func.sum(CMCase.agreed_fee_application + CMCase.agreed_fee_implementation),
            func.sum(CMCase.total_paid),
        ).filter(~CMCase.status_category.in_(terminal), CMCase.program_category == prog).first()
        cnt, ag, pd = int(rows[0] or 0), fmt_eur(rows[1]), fmt_eur(rows[2])
        by_program.append({"program_category": prog, "count": cnt, "total_agreed": ag, "total_paid": pd, "total_balance": round(ag - pd, 2)})

    # ── By Service Type ───────────────────────────────────────────────────
    svc_rows = db.query(
        CMCase.service_type,
        CMCase.program_category,
        func.count(CMCase.id),
        func.sum(CMCase.agreed_fee_application + CMCase.agreed_fee_implementation),
        func.sum(CMCase.total_paid),
    ).filter(~CMCase.status_category.in_(terminal)).group_by(CMCase.service_type, CMCase.program_category).order_by(CMCase.program_category, CMCase.service_type).all()

    by_service_type = []
    for svc, prog, cnt, ag, pd in svc_rows:
        ag, pd = fmt_eur(ag), fmt_eur(pd)
        by_service_type.append({"service_type": svc or "—", "program_category": prog or "—", "count": int(cnt or 0), "total_agreed": ag, "total_paid": pd, "total_balance": round(ag - pd, 2)})

    # ── SLA Overdue ───────────────────────────────────────────────────────
    sla_map = {r.status: r.sla_days for r in db.query(CMStatusSLA).all()}
    sla_overdue = []
    if sla_map:
        for c in active_q().filter(CMCase.status_changed_at != None).all():
            sla_days = sla_map.get(c.status)
            if not sla_days:
                continue
            age = (now - c.status_changed_at).days
            if age > sla_days:
                sla_overdue.append({
                    "id": c.id,
                    "client_name": c.client_name,
                    "status": c.status,
                    "program_category": c.program_category,
                    "sla_days": sla_days,
                    "age_days": age,
                    "overdue_days": age - sla_days,
                })
        sla_overdue.sort(key=lambda x: x["overdue_days"], reverse=True)
        sla_overdue = sla_overdue[:30]

    # ── Agents workload ───────────────────────────────────────────────────
    agents_data = []
    for agent in db.query(CMUser).filter(CMUser.is_active == True).all():
        cnt = active_q().filter(CMCase.assigned_agent_id == agent.id).count()
        bal_row = db.query(func.sum(CMCase.agreed_fee_application + CMCase.agreed_fee_implementation - CMCase.total_paid)).filter(~CMCase.status_category.in_(terminal), CMCase.assigned_agent_id == agent.id).scalar()
        agents_data.append({"agent_name": agent.full_name, "case_count": cnt, "total_balance": fmt_eur(bal_row)})
    agents_data.sort(key=lambda x: x["case_count"], reverse=True)

    # ── Urgent & Recent ───────────────────────────────────────────────────
    urgent_cases = []
    for c in active_q().filter(CMCase.project_deadline != None, CMCase.project_deadline <= in_15, CMCase.project_deadline >= today).order_by(CMCase.project_deadline).limit(10).all():
        urgent_cases.append({"id": c.id, "client_name": c.client_name, "status": c.status, "service_type": c.service_type, "project_deadline": c.project_deadline.isoformat(), "days_to_deadline": (c.project_deadline - today).days})

    recent_cases = []
    for c in active_q().order_by(CMCase.updated_at.desc()).limit(8).all():
        agent_name = c.assigned_agent.full_name if c.assigned_agent else None
        recent_cases.append({"id": c.id, "client_name": c.client_name, "status": c.status, "program_category": c.program_category, "service_type": c.service_type, "assigned_agent_name": agent_name, "updated_at": c.updated_at.isoformat() if c.updated_at else None})

    # ── Top balances ──────────────────────────────────────────────────────
    balance_cases = []
    for c in active_q().filter((CMCase.agreed_fee_application + CMCase.agreed_fee_implementation) > CMCase.total_paid).order_by(((CMCase.agreed_fee_application + CMCase.agreed_fee_implementation) - CMCase.total_paid).desc()).limit(10).all():
        ta = (c.agreed_fee_application or 0) + (c.agreed_fee_implementation or 0)
        balance_cases.append({"id": c.id, "client_name": c.client_name, "service_type": c.service_type, "total_agreed": ta, "total_paid": c.total_paid or 0, "balance": ta - (c.total_paid or 0)})

    return {
        "summary": {"total_active": total_active, "total_agreed": total_agreed, "total_paid": total_paid, "total_balance": total_balance, "deadlines_30": deadline_30, "deadlines_15": deadline_15, "open_tasks": open_tasks, "overdue_tasks": overdue_tasks},
        "by_program": by_program,
        "by_service_type": by_service_type,
        "sla_overdue": sla_overdue,
        "agents_workload": agents_data,
        "urgent_cases": urgent_cases,
        "recent_cases": recent_cases,
        "balance_cases": balance_cases,
    }
