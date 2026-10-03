"""Revenue forecasting and actual payment history."""
from datetime import datetime, date, timedelta
from calendar import monthrange
from typing import List, Optional, Set
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMCase, CMPaymentLog
from auth_cases import get_current_user
from pipelines import PIPELINES

router = APIRouter(prefix="/api/cm/revenue", tags=["revenue"])

# Months from now to assume as deadline when none is set
FALLBACK_MONTHS = {"ΕΣΠΑ": 18, "ΔΥΠΑ": 18, "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ": 2}
DEFAULT_FALLBACK = 18
FORECAST_HORIZON_MONTHS = 24
HISTORY_MONTHS = 12

# Statuses to exclude from forecast (cancelled / frozen / disputed)
EXCLUDED_STATUS_KEYWORDS = {
    "ΑΚΥΡΩΣ", "ΠΑΡΑΙΤΗΣΗ", "ΑΠΟΡΡΙΨΗ", "ΑΠΟΡΡΙΠΤ",
    "ΠΑΓΩΜΕΝΗ", "ΕΝΣΤΑΣΗ", "ΤΡΟΠΟΠΟΙΗΣΗ",
    "ΑΠΟΣΥΡΘΗΚΕ", "ΔΕΝ ΕΓΚΡΙΘΗΚΕ",
}

def _is_excluded_status(status: str) -> bool:
    s = (status or "").upper()
    return any(kw in s for kw in EXCLUDED_STATUS_KEYWORDS)


def _first_statuses_per_pipeline() -> dict[str, str]:
    """Return {program_category: first_status} for each configured pipeline."""
    return {
        prog: p["phases"][0]["statuses"][0]
        for prog, p in PIPELINES.items()
        if p.get("phases") and p["phases"][0].get("statuses")
    }


def _month_key(dt: date) -> str:
    return dt.strftime("%Y-%m")


def _months_between(d1: date, d2: date) -> int:
    """Whole months from d1 to d2 (can be negative)."""
    return (d2.year - d1.year) * 12 + (d2.month - d1.month)


def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


@router.get("/filter-options")
def get_filter_options(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Distinct values for filter dropdowns."""
    cases = db.query(CMCase).all()
    pipelines = sorted({c.program_category for c in cases if c.program_category})
    service_types = sorted({c.service_type for c in cases if c.service_type})
    statuses = sorted({c.status for c in cases if c.status})
    return {
        "pipelines": pipelines,
        "service_types": service_types,
        "statuses": statuses,
    }


@router.get("/forecast")
def get_revenue_forecast(
    pipelines: Optional[List[str]] = Query(None),
    service_types: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    today = date.today()
    now_month = today.replace(day=1)

    # ── Fetch cases ───────────────────────────────────────────────────────────
    q = db.query(CMCase)
    if pipelines:
        q = q.filter(CMCase.program_category.in_(pipelines))
    if service_types:
        q = q.filter(CMCase.service_type.in_(service_types))
    if statuses:
        q = q.filter(CMCase.status.in_(statuses))
    cases = q.all()

    first_statuses = _first_statuses_per_pipeline()

    # ── Build forecast: projected monthly receipts per case ───────────────────
    forecast_map: dict[str, float] = {}
    case_forecasts = []
    excluded_count = 0

    for c in cases:
        # Skip cancelled/frozen/disputed statuses
        if _is_excluded_status(c.status or ""):
            excluded_count += 1
            continue
        # Skip cases still on the very first status of their pipeline (no approval yet)
        prog = c.program_category or "ΕΣΠΑ"
        if c.status == first_statuses.get(prog):
            excluded_count += 1
            continue

        agreed = (c.agreed_fee_application or 0) + (c.agreed_fee_implementation or 0)
        paid = c.total_paid or 0
        balance = agreed - paid
        if balance <= 0.01:
            continue  # fully paid, nothing to forecast

        # Determine deadline
        deadline = c.project_deadline
        if not deadline:
            fallback = FALLBACK_MONTHS.get(c.program_category or "", DEFAULT_FALLBACK)
            deadline = _add_months(today, fallback)

        months_left = _months_between(today, deadline)
        if months_left <= 0:
            months_left = 1  # overdue — put everything in current month

        monthly = balance / months_left

        # Distribute across months
        for i in range(months_left):
            mk = _month_key(_add_months(now_month, i))
            forecast_map[mk] = forecast_map.get(mk, 0.0) + monthly

        case_forecasts.append({
            "id": c.id,
            "client_name": c.client_name,
            "service_type": c.service_type,
            "program_category": c.program_category,
            "status": c.status,
            "agreed_total": agreed,
            "total_paid": paid,
            "balance": balance,
            "deadline": deadline.isoformat(),
            "months_left": months_left,
            "monthly_expected": round(monthly, 2),
            "is_overdue": c.project_deadline is not None and c.project_deadline < today,
            "deadline_estimated": c.project_deadline is None,
        })

    # Build ordered forecast list for next FORECAST_HORIZON_MONTHS months
    forecast_series = []
    for i in range(FORECAST_HORIZON_MONTHS):
        mk = _month_key(_add_months(now_month, i))
        forecast_series.append({
            "month": mk,
            "expected": round(forecast_map.get(mk, 0.0), 2),
        })

    # ── Actual payment history from CMPaymentLog ──────────────────────────────
    case_ids = [c.id for c in cases]
    history_start = _add_months(today, -HISTORY_MONTHS)

    logs = (
        db.query(CMPaymentLog)
        .filter(
            CMPaymentLog.case_id.in_(case_ids),
            CMPaymentLog.log_date >= datetime.combine(history_start, datetime.min.time()),
            CMPaymentLog.delta > 0,  # only positive payments (not corrections)
        )
        .order_by(CMPaymentLog.log_date)
        .all()
    )

    actual_map: dict[str, float] = {}
    for log in logs:
        mk = log.log_date.strftime("%Y-%m")
        actual_map[mk] = actual_map.get(mk, 0.0) + log.delta

    # Build ordered history list
    actual_series = []
    for i in range(-HISTORY_MONTHS, 1):
        mk = _month_key(_add_months(now_month, i))
        actual_series.append({
            "month": mk,
            "actual": round(actual_map.get(mk, 0.0), 2),
        })

    # ── Summary stats ─────────────────────────────────────────────────────────
    total_balance = sum(cf["balance"] for cf in case_forecasts)
    total_agreed = sum(cf["agreed_total"] for cf in case_forecasts)
    total_paid_all = sum(cf["total_paid"] for cf in case_forecasts)
    expected_12m = sum(v["expected"] for v in forecast_series[:12])
    actual_12m = sum(v["actual"] for v in actual_series)

    return {
        "summary": {
            "total_cases": len(case_forecasts),
            "excluded_cases": excluded_count,
            "total_agreed": round(total_agreed, 2),
            "total_paid": round(total_paid_all, 2),
            "total_balance": round(total_balance, 2),
            "expected_next_12m": round(expected_12m, 2),
            "actual_last_12m": round(actual_12m, 2),
        },
        "forecast_series": forecast_series,
        "actual_series": actual_series,
        "cases": sorted(case_forecasts, key=lambda x: x["balance"], reverse=True),
    }
