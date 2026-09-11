from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Case
from auth_utils import get_current_user

router = APIRouter(prefix="/statistics", tags=["statistics"], dependencies=[Depends(get_current_user)])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def extract_estimates(estimates: dict):
    return {
        "sumDebt": safe_float(estimates.get("sumDebt")),
        "sumWr": safe_float(estimates.get("sumWr")),
        "totalRemaining": safe_float(estimates.get("totalRemaining")),
        "totalMonthlyPay": safe_float(estimates.get("totalMonthlyPay")),
        "dispMonthly": safe_float(estimates.get("dispMonthly")),
        "scenario": estimates.get("scenario", 0),
    }


def extract_actual(actual: dict):
    if not actual:
        return None
    return {
        "actualWriteOff": safe_float(actual.get("actualWriteOff")),
        "actualRemaining": safe_float(actual.get("actualRemaining")),
        "actualMonthlyPay": safe_float(actual.get("actualMonthlyPay")),
        "actualDurationMonths": safe_float(actual.get("actualDurationMonths")),
    }


@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    cases = db.query(Case).all()
    total = len(cases)
    by_status = {}
    by_employee = {e: 0 for e in EMPLOYEES}
    total_estimated_debt = 0.0
    total_estimated_writeoff = 0.0
    total_actual_writeoff = 0.0
    completed_with_actuals = 0
    scenario_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

    for c in cases:
        by_status[c.status] = by_status.get(c.status, 0) + 1
        if c.employee in by_employee:
            by_employee[c.employee] += 1

        est = extract_estimates(c.estimates or {})
        total_estimated_debt += est["sumDebt"]
        total_estimated_writeoff += est["sumWr"]
        sc = est.get("scenario", 0)
        if isinstance(sc, int) and sc in scenario_counts:
            scenario_counts[sc] += 1

        if c.actual_results:
            act = extract_actual(c.actual_results)
            if act:
                total_actual_writeoff += act["actualWriteOff"]
                completed_with_actuals += 1

    return {
        "total_cases": total,
        "by_status": by_status,
        "by_employee": by_employee,
        "total_estimated_debt": total_estimated_debt,
        "total_estimated_writeoff": total_estimated_writeoff,
        "total_actual_writeoff": total_actual_writeoff,
        "completed_with_actuals": completed_with_actuals,
        "scenario_counts": scenario_counts,
    }


@router.get("/employee/{employee}")
def get_employee_stats(employee: str, db: Session = Depends(get_db)):
    if employee not in EMPLOYEES:
        return {"error": "Μη έγκυρος υπάλληλος"}
    cases = db.query(Case).filter(Case.employee == employee).all()
    total = len(cases)
    by_status = {}
    total_debt = 0.0
    total_writeoff = 0.0
    total_monthly = 0.0
    completed_count = 0
    writeoff_accuracy_pairs = []

    for c in cases:
        by_status[c.status] = by_status.get(c.status, 0) + 1
        est = extract_estimates(c.estimates or {})
        total_debt += est["sumDebt"]
        total_writeoff += est["sumWr"]
        total_monthly += est["totalMonthlyPay"]

        if c.actual_results:
            act = extract_actual(c.actual_results)
            if act and est["sumWr"] > 0:
                completed_count += 1
                writeoff_accuracy_pairs.append({
                    "case_id": c.id,
                    "client": c.client_name,
                    "estimated": est["sumWr"],
                    "actual": act["actualWriteOff"],
                    "diff_pct": round((act["actualWriteOff"] - est["sumWr"]) / est["sumWr"] * 100, 1) if est["sumWr"] else 0,
                })

    avg_accuracy = None
    if writeoff_accuracy_pairs:
        avg_accuracy = round(sum(p["diff_pct"] for p in writeoff_accuracy_pairs) / len(writeoff_accuracy_pairs), 1)

    return {
        "employee": employee,
        "total_cases": total,
        "by_status": by_status,
        "total_debt_managed": total_debt,
        "total_estimated_writeoff": total_writeoff,
        "total_monthly_managed": total_monthly,
        "completed_with_actuals": completed_count,
        "avg_writeoff_accuracy_pct": avg_accuracy,
        "cases_detail": writeoff_accuracy_pairs,
    }


@router.get("/comparison")
def get_comparison(db: Session = Depends(get_db)):
    cases = db.query(Case).filter(Case.actual_results.isnot(None)).all()
    result = []
    for c in cases:
        est = extract_estimates(c.estimates or {})
        act = extract_actual(c.actual_results or {})
        if not act:
            continue
        result.append({
            "id": c.id,
            "client_name": c.client_name,
            "employee": c.employee,
            "status": c.status,
            "debtor_type": c.debtor_type,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
            "estimated_debt": est["sumDebt"],
            "estimated_writeoff": est["sumWr"],
            "estimated_writeoff_pct": round(est["sumWr"] / est["sumDebt"] * 100, 1) if est["sumDebt"] else 0,
            "estimated_remaining": est["totalRemaining"],
            "estimated_monthly": est["totalMonthlyPay"],
            "actual_writeoff": act["actualWriteOff"],
            "actual_writeoff_pct": round(act["actualWriteOff"] / est["sumDebt"] * 100, 1) if est["sumDebt"] else 0,
            "actual_remaining": act["actualRemaining"],
            "actual_monthly": act["actualMonthlyPay"],
            "writeoff_diff": act["actualWriteOff"] - est["sumWr"],
            "writeoff_diff_pct": round((act["actualWriteOff"] - est["sumWr"]) / est["sumWr"] * 100, 1) if est["sumWr"] else 0,
        })
    return result
