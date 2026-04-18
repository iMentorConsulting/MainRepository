from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Case

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/case/{token}")
def get_public_case(token: str, vat: str = Query(default=None), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="not_found")

    # Portal active check
    if case.portal_active is False:
        raise HTTPException(status_code=403, detail="portal_disabled")

    # VAT gate
    if case.client_vat:
        if not vat:
            raise HTTPException(status_code=403, detail="vat_required")
        if vat.strip() != (case.client_vat or "").strip():
            raise HTTPException(status_code=403, detail="vat_invalid")

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
        "income_data": case.income_data,
        "estimates": case.estimates,
        "actual_results": case.actual_results,
        "notes": case.notes or "",
        "has_vat": bool(case.client_vat),
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "completed_at": case.completed_at.isoformat() if case.completed_at else None,
    }
