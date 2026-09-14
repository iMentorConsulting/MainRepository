"""
Receive payroll targets from iMentor Finance app.
Protected by x-api-key header matching FINANCE_API_KEY env var.
Finance pushes daily at 09:00 (Europe/Athens); last payload is held in memory.
"""
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

router = APIRouter(prefix="/api/external", tags=["external"])

_latest: dict = {}


def require_api_key(x_api_key: str = Header(default=None)):
    api_key = os.getenv("FINANCE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_API_KEY not configured on this server")
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
):
    global _latest
    _latest = payload.dict()
    return {"ok": True, "received": len(payload.employees)}


@router.get("/payroll-targets")
def get_all_payroll_targets(_: None = Depends(require_api_key)):
    return _latest or {}


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
        "days_elapsed": _latest["days_elapsed"],
        "days_in_month": _latest["days_in_month"],
    }
