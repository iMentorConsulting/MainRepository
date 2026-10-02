import os
import time
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models import FinancePayment, Case
from auth_utils import get_current_user

router = APIRouter(prefix="/finance-intake", tags=["finance-intake"])

FINANCE_API_URL = "https://finance.i-mentor.gr/api/lead-intake"

EMPLOYEE_GREEK = {
    "STELLA": "ΣΤΕΛΛΑ",
    "VALLIA": "ΒΑΛΛΙΑ",
    "SOFIA": "ΣΟΦΙΑ",
    "HARIS": "ΧΑΡΗΣ",
}


class FinanceIntakeRequest(BaseModel):
    case_id: int
    payment_type: str
    invoice_type: str          # ΤΙΜΟΛΟΓΙΟ / ΑΠΟΔΕΙΞΗ / ΑΝΕΥ
    amount_collected: float
    sale_date: str             # YYYY-MM-DD
    description: str
    targeting_category: str
    source_referral: str
    work_status: str
    service_type: Optional[str] = "ΕΞΩΔΙΚΑΣΤΙΚΟΣ"
    deal_application_fee: Optional[float] = 0.0   # agreed Ποσό Αίτησης from commercial offer
    deal_success_fee: Optional[float] = 0.0        # agreed Ποσό Υλοποίησης from commercial offer
    address: Optional[str] = ""
    city: Optional[str] = ""


@router.post("")
def record_payment(
    req: FinanceIntakeRequest,
    db: Session = Depends(get_db),
    employee: str = Depends(get_current_user),
):
    api_key = os.getenv("LEAD_INTAKE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="LEAD_INTAKE_API_KEY not configured")

    case = db.query(Case).filter(Case.id == req.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    external_id = f"exo-{req.case_id}-{req.payment_type.lower().replace(' ', '-')}-{int(time.time())}"

    vat_amount = round(req.amount_collected * 0.24, 2) if req.invoice_type != "ΑΝΕΥ" else 0.0

    payload = {
        "external_id": external_id,
        "organization": "I-MENTOR",
        "source": "exodikastikos",
        "client_name": case.client_name or "",
        "client_vat": case.client_vat or "",
        "client_phone": case.client_phone or "",
        "client_email": case.client_email or "",
        "payment_type": req.payment_type,
        "invoice_type": req.invoice_type,
        "amount_collected": req.amount_collected,
        "vat_amount": vat_amount,
        "sale_date": req.sale_date,
        "description": req.description,
        "targeting_category": req.targeting_category,
        "source_referral": req.source_referral,
        "work_status": req.work_status,
        "service_type": req.service_type or "ΕΞΩΔΙΚΑΣΤΙΚΟΣ",
        "deal_application_fee": req.deal_application_fee or 0.0,
        "deal_success_fee": req.deal_success_fee or 0.0,
        "sent_by": EMPLOYEE_GREEK.get(employee, employee),
        "address": req.address or "",
        "city": req.city or "",
    }

    finance_id = None
    is_duplicate = False
    error_text = ""

    try:
        resp = httpx.post(
            FINANCE_API_URL,
            json=payload,
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        finance_id = data.get("id")
        is_duplicate = bool(data.get("duplicate", False))
    except httpx.HTTPStatusError as e:
        error_text = f"HTTP {e.response.status_code}: {e.response.text[:500]}"
    except Exception as e:
        error_text = str(e)[:500]

    record = FinancePayment(
        case_id=req.case_id,
        external_id=external_id,
        finance_id=finance_id,
        payment_type=req.payment_type,
        invoice_type=req.invoice_type,
        amount_collected=req.amount_collected,
        vat_amount=vat_amount,
        sale_date=req.sale_date,
        description=req.description,
        targeting_category=req.targeting_category,
        source_referral=req.source_referral,
        work_status=req.work_status,
        service_type=req.service_type or "ΕΞΩΔΙΚΑΣΤΙΚΟΣ",
        deal_application_fee=req.deal_application_fee or 0.0,
        deal_success_fee=req.deal_success_fee or 0.0,
        address=req.address or "",
        city=req.city or "",
        sent_by=EMPLOYEE_GREEK.get(employee, employee),
        is_duplicate=is_duplicate,
        error=error_text,
        sent_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    if error_text:
        raise HTTPException(status_code=502, detail=f"Finance API error: {error_text}")

    return {
        "ok": True,
        "id": record.id,
        "finance_id": finance_id,
        "duplicate": is_duplicate,
        "external_id": external_id,
        "vat_amount": vat_amount,
    }


@router.get("/case/{case_id}")
def list_payments(
    case_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    rows = (
        db.query(FinancePayment)
        .filter(FinancePayment.case_id == case_id)
        .order_by(FinancePayment.sent_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "external_id": r.external_id,
            "finance_id": r.finance_id,
            "payment_type": r.payment_type,
            "invoice_type": r.invoice_type,
            "amount_collected": r.amount_collected,
            "vat_amount": r.vat_amount,
            "sale_date": r.sale_date,
            "description": r.description,
            "targeting_category": r.targeting_category,
            "source_referral": r.source_referral,
            "work_status": r.work_status,
            "service_type": r.service_type,
            "sent_by": r.sent_by,
            "is_duplicate": r.is_duplicate,
            "error": r.error,
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        }
        for r in rows
    ]
