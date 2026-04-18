from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Case

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/case/{token}")
def get_public_case(token: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    return {
        "id": case.id,
        "client_name": case.client_name,
        "debtor_type": case.debtor_type,
        "status": case.status,
        "debts": case.debts,
        "assets": case.assets,
        "income_data": case.income_data,
        "estimates": case.estimates,
        "actual_results": case.actual_results,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "completed_at": case.completed_at.isoformat() if case.completed_at else None,
    }
