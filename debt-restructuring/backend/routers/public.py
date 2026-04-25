from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models import Case

router = APIRouter(prefix="/public", tags=["public"])

EXCLUDED_IPS = {"5.59.243.16", "2001:4860:7:1511::fe"}


@router.get("/case/{token}")
def get_public_case(token: str, request: Request, vat: str = Query(default=None), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="not_found")

    if case.portal_active is False:
        raise HTTPException(status_code=403, detail="portal_disabled")

    if case.client_vat:
        if not vat:
            raise HTTPException(status_code=403, detail="vat_required")
        if vat.strip() != (case.client_vat or "").strip():
            raise HTTPException(status_code=403, detail="vat_invalid")

    # Log portal visit (skip staff IPs)
    try:
        ip = request.client.host if request.client else "unknown"
        if ip not in EXCLUDED_IPS:
            now = datetime.utcnow().isoformat()
            visits = list(case.portal_visits or [])
            visits.append({"at": now, "ip": ip})
            case.portal_visits = visits
            case.portal_visit_count = len(visits)
            db.commit()
    except Exception:
        db.rollback()

    return {
        "id": case.id,
        "client_name": case.client_name,
        "client_phone": case.client_phone or "",
        "client_email": case.client_email or "",
        "debtor_type": case.debtor_type,
        "status": case.status,
        "employee": case.employee,
        "debts": case.debts,
        "assets": case.assets,
        "income_data": case.income_data or {},
        "estimates": case.estimates,
        "actual_results": case.actual_results,
        "notes": case.notes or "",
        "has_vat": bool(case.client_vat),
        "commercial_offer": case.commercial_offer or {},
        "portal_visit_count": case.portal_visit_count or 0,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "completed_at": case.completed_at.isoformat() if case.completed_at else None,
    }
