"""
Read-only API for iMentor Finance to pull case data.
Protected by a static API key: set FINANCE_API_KEY in Railway env vars.
Call with:  Authorization: Bearer <FINANCE_API_KEY>
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMCase

router = APIRouter(prefix="/api/finance-sync", tags=["finance-sync"])


def require_api_key(authorization: str = Header(default=None)):
    api_key = os.getenv("FINANCE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_API_KEY not configured on this server")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization[7:]
    if token != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.get("/cases", dependencies=[Depends(require_api_key)])
def get_cases_for_finance(db: Session = Depends(get_db)):
    """
    Returns all active cases with the fields iMentor Finance needs:
    client_name, afm, service_type, status, approval_date, project_deadline (=completion_deadline).
    """
    cases = db.query(CMCase).order_by(CMCase.client_name).all()
    return {
        "count": len(cases),
        "data": [
            {
                "id":                c.id,
                "client_name":       c.client_name,
                "afm":               c.afm,
                "service_type":      c.service_type,
                "program_category":  c.program_category,
                "status":            c.status,
                "sale_date":         c.sale_date.isoformat() if c.sale_date else None,
                "approval_date":     c.approval_date.isoformat() if c.approval_date else None,
                "project_deadline":  c.project_deadline.isoformat() if c.project_deadline else None,
                "follow_up_date":    c.follow_up_date.isoformat() if c.follow_up_date else None,
                "approved_budget":   c.approved_budget,
                "assigned_agent":    c.assigned_agent.full_name if c.assigned_agent else None,
            }
            for c in cases
        ],
    }
