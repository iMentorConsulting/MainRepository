"""
Receive payment records from iMentor Finance app.
Protected by x-api-key header: set FINANCE_APP_API_KEY in Railway env vars.
"""
import os
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMCase, FinancePayment

router = APIRouter(prefix="/api/external", tags=["external"])


def require_api_key(x_api_key: str = Header(default=None)):
    api_key = os.getenv("FINANCE_APP_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FINANCE_APP_API_KEY not configured on this server")
    if x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


class PaymentItem(BaseModel):
    externalId: str
    afm: str
    onomasia: Optional[str] = None
    amount: int                    # in cents
    invoiceNumber: Optional[str] = None
    service: Optional[str] = None
    category: Optional[str] = None
    paymentDate: Optional[date] = None
    accountant: Optional[str] = None


class PaymentsPayload(BaseModel):
    payments: List[PaymentItem]


@router.post("/finance-payments")
def receive_finance_payments(
    payload: PaymentsPayload,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    received = len(payload.payments)
    matched = 0
    unmatched = 0
    errors = []

    for p in payload.payments:
        try:
            # Idempotency: skip if already stored
            existing = db.query(FinancePayment).filter_by(external_id=p.externalId).first()
            if existing:
                matched += 1 if existing.case_id is not None else 0
                unmatched += 1 if existing.case_id is None else 0
                continue

            # Match to a CMCase by AFM
            cases = db.query(CMCase).filter(CMCase.afm == p.afm.strip()).all()
            case_id = None
            if cases:
                # Prefer cases whose service_type matches; fall back to most recently created
                if p.service:
                    svc_match = [c for c in cases if c.service_type and p.service.lower() in c.service_type.lower()]
                    cases = svc_match or cases
                case_id = sorted(cases, key=lambda c: c.id, reverse=True)[0].id

            db.add(FinancePayment(
                external_id=p.externalId,
                case_id=case_id,
                afm=p.afm.strip(),
                onomasia=p.onomasia,
                amount_cents=p.amount,
                invoice_number=p.invoiceNumber,
                service=p.service,
                category=p.category,
                payment_date=p.paymentDate,
                accountant=p.accountant,
            ))

            if case_id is not None:
                matched += 1
            else:
                unmatched += 1

        except Exception as e:
            errors.append({"externalId": p.externalId, "error": str(e)})

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB commit failed: {e}")

    return {"received": received, "matched": matched, "unmatched": unmatched, "errors": errors}
