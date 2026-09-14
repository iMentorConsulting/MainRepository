import os
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter(prefix="/api/external", tags=["external"])

_latest: dict = {}


def require_api_key(x_api_key: str = Header(default=None)):
    api_key = os.getenv("FINANCE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_API_KEY not configured")
    if x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


class EmployeeTarget(BaseModel):
    name: str
    target: float
    sales_to_date: float
    achievement_pct: Optional[float] = None


class PayrollTargetsPayload(BaseModel):
    source: str
    sent_at: str
    year: int
    month: int
    month_name: str
    days_elapsed: int
    days_in_month: int
    employees: List[EmployeeTarget]


@router.post("/payroll-targets")
def receive_payroll_targets(
    payload: PayrollTargetsPayload,
    _: None = Depends(require_api_key),
    db: Session = Depends(get_db),
):
    global _latest
    _latest = payload.dict()

    # Persist to DB so Dashboard / WorkView widgets survive restarts
    try:
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
    except Exception as e:
        print(f"[payroll] DB write failed (in-memory still updated): {e}")

    return {"ok": True, "received": len(payload.employees)}


@router.get("/payroll-targets/{employee_name}")
def get_employee_target(employee_name: str, _: None = Depends(require_api_key)):
    if not _latest:
        raise HTTPException(status_code=404, detail="No targets received yet")
    match = next(
        (e for e in _latest.get("employees", []) if e["name"].upper() == employee_name.upper()),
        None,
    )
    if not match:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {
        **match,
        "year": _latest["year"],
        "month": _latest["month"],
        "month_name": _latest["month_name"],
    }
