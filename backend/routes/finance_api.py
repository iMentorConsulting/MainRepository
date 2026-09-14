"""
Finance ↔ Case Management integration:
  - GET  /api/finance-sync/cases          (Bearer auth) — Case Management → Finance pull
  - POST /api/finance/payroll-targets      (x-api-key)  — Finance → CM push (daily snapshot)
  - GET  /api/finance/payroll-targets/me   (Bearer auth) — current user's own targets
  - GET  /api/finance/payroll-targets/all  (Bearer auth, admin) — all employees' targets
"""
import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models_cases import CMCase, CMUser
from auth_cases import get_current_user

router = APIRouter(tags=["finance"])


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _require_bearer(authorization: str = Header(default=None)):
    api_key = os.getenv("FINANCE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_API_KEY not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    if authorization[7:] != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _require_xapikey(x_api_key: str = Header(default=None)):
    api_key = os.getenv("FINANCE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_API_KEY not configured")
    if not x_api_key or x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing x-api-key")


# ── Legacy: Finance pulls cases ────────────────────────────────────────────────

router_legacy = APIRouter(prefix="/api/finance-sync", tags=["finance-sync"])


@router_legacy.get("/cases", dependencies=[Depends(_require_bearer)])
def get_cases_for_finance(db: Session = Depends(get_db)):
    cases = (
        db.query(CMCase)
        .options(joinedload(CMCase.assigned_agent))
        .order_by(CMCase.client_name)
        .all()
    )
    return {
        "count": len(cases),
        "data": [
            {
                "id": c.id,
                "client_name": c.client_name,
                "afm": c.afm,
                "service_type": c.service_type,
                "program_category": c.program_category,
                "status": c.status,
                "sale_date": c.sale_date.isoformat() if c.sale_date else None,
                "approval_date": c.approval_date.isoformat() if c.approval_date else None,
                "project_deadline": c.project_deadline.isoformat() if c.project_deadline else None,
                "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
                "approved_budget": c.approved_budget,
                "assigned_agent": c.assigned_agent.full_name if c.assigned_agent else None,
            }
            for c in cases
        ],
    }


# ── Payroll Targets push (Finance → CM) ───────────────────────────────────────

class PayrollEmployee(BaseModel):
    name: str
    target: float
    sales_to_date: float
    achievement_pct: float


class PayrollTargetsPayload(BaseModel):
    source: str = "imentor-finance"
    sent_at: Optional[str] = None
    year: int
    month: int
    month_name: Optional[str] = None
    days_elapsed: Optional[int] = None
    days_in_month: Optional[int] = None
    employees: List[PayrollEmployee]


@router.post("/api/finance/payroll-targets", dependencies=[Depends(_require_xapikey)])
def receive_payroll_targets(payload: PayrollTargetsPayload, db: Session = Depends(get_db)):
    from sqlalchemy import text
    employees_json = json.dumps([e.dict() for e in payload.employees], ensure_ascii=False)
    db.execute(text("""
        INSERT INTO cm_finance_payroll_snapshots
            (year, month, month_name, days_elapsed, days_in_month, source, sent_at, employees_json, received_at)
        VALUES
            (:year, :month, :month_name, :days_elapsed, :days_in_month, :source, :sent_at, :employees_json, NOW())
        ON CONFLICT (year, month) DO UPDATE SET
            month_name     = EXCLUDED.month_name,
            days_elapsed   = EXCLUDED.days_elapsed,
            days_in_month  = EXCLUDED.days_in_month,
            source         = EXCLUDED.source,
            sent_at        = EXCLUDED.sent_at,
            employees_json = EXCLUDED.employees_json,
            received_at    = NOW()
    """), {
        "year": payload.year,
        "month": payload.month,
        "month_name": payload.month_name,
        "days_elapsed": payload.days_elapsed,
        "days_in_month": payload.days_in_month,
        "source": payload.source,
        "sent_at": payload.sent_at,
        "employees_json": employees_json,
    })
    db.commit()
    return {"ok": True}


def _load_snapshot(db, year: int, month: int):
    from sqlalchemy import text
    row = db.execute(text("""
        SELECT year, month, month_name, days_elapsed, days_in_month, employees_json, received_at
        FROM cm_finance_payroll_snapshots
        WHERE year = :year AND month = :month
    """), {"year": year, "month": month}).fetchone()
    if not row:
        return None
    return {
        "year": row[0],
        "month": row[1],
        "month_name": row[2],
        "days_elapsed": row[3],
        "days_in_month": row[4],
        "employees": json.loads(row[5]),
        "received_at": row[6].isoformat() if row[6] else None,
    }


@router.get("/api/finance/payroll-targets/me")
def get_my_payroll_targets(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    snap = _load_snapshot(db, now.year, now.month)
    if not snap:
        return {"found": False, "data": None}
    my_name = (current_user.full_name or "").strip().upper()
    match = next(
        (e for e in snap["employees"] if e["name"].strip().upper() == my_name),
        None,
    )
    return {
        "found": match is not None,
        "year": snap["year"],
        "month": snap["month"],
        "month_name": snap["month_name"],
        "days_elapsed": snap["days_elapsed"],
        "days_in_month": snap["days_in_month"],
        "received_at": snap["received_at"],
        "data": match,
    }


@router.get("/api/finance/payroll-targets/all")
def get_all_payroll_targets(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc)
    snap = _load_snapshot(db, now.year, now.month)
    if not snap:
        return {"found": False, "data": []}
    return {"found": True, **snap}
