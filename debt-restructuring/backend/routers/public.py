from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models import Case

router = APIRouter(prefix="/public", tags=["public"])

EXCLUDED_IPS = {"5.59.243.16", "2001:4860:7:1511::fe"}


@router.get("/case/{token}")
def get_public_case(token: str, request: Request, vat: str = Query(default=None), notrack: bool = Query(default=False), db: Session = Depends(get_db)):
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

    # Log portal visit (skip staff IPs and notrack requests)
    try:
        ip = request.client.host if request.client else "unknown"
        if not notrack and ip not in EXCLUDED_IPS:
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


STAGE_ORDER = ['Νέα Ανάλυση', 'Εστάλη Σύνδεσμος', 'Θετική Ανταπόκριση', 'Σε Διαπραγμάτευση', 'Έκλεισε', 'Δεν Ενδιαφέρεται']

@router.post("/case/{token}/interested")
def mark_interested(token: str, db: Session = Depends(get_db)):
    """Client clicked 'I want to proceed' in the portal."""
    case = db.query(Case).filter(Case.share_token == token).first()
    if not case:
        raise HTTPException(status_code=404, detail="not_found")
    current = case.contact_stage or 'Νέα Ανάλυση'
    try:
        current_idx = STAGE_ORDER.index(current)
    except ValueError:
        current_idx = 0
    interested_idx = STAGE_ORDER.index('Θετική Ανταπόκριση')
    if current_idx < interested_idx:
        case.contact_stage = 'Θετική Ανταπόκριση'
        case.last_contacted_at = datetime.utcnow()
        case.updated_at = datetime.utcnow()
        db.commit()
    return {"ok": True, "contact_stage": case.contact_stage}

@router.get("/stats")
def get_public_stats(db: Session = Depends(get_db)):
    """Aggregate stats shown in client portal (no PII)."""
    cases = db.query(Case).all()
    total = len(cases)
    total_debt = sum(float((c.estimates or {}).get("sumDebt") or 0) for c in cases)
    total_writeoff = sum(float((c.estimates or {}).get("sumWr") or 0) for c in cases)
    completed = sum(1 for c in cases if c.actual_results)
    return {
        "total_cases": total,
        "total_debt_analyzed": round(total_debt),
        "total_estimated_writeoff": round(total_writeoff),
        "completed_cases": completed,
    }
