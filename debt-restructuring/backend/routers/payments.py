"""IRIS payments (DIAS Request to Pay) integration.

Spec: DIAS-ORG05-V1R4 "IRIS payments - Hlektroniko Emporio - Prodiagrafes
Leitourgias Hlektronikou Katastimatos" (v1.4, 08/01/2025), Parartima A.

SECURITY: all HTTP calls to DIAS happen exclusively here, on the backend.
Credentials (DIAS_IRIS_USERNAME / DIAS_IRIS_PASSWORD) are never sent to the
frontend and are never written to logs.

The organisation is enrolled with RI0 (unstructured payment code) only.
RI18 / RF (structured codes) are intentionally NOT implemented.

SANDBOX NOTE: this module talks to whatever DIAS_IRIS_INITIATION_URL /
DIAS_IRIS_RESULT_URL are configured with. Do not point these at the
production DIAS endpoints until the production Initiation URL, Result URL,
API username/password, Merchant/Activity Code, and confirmation that the
Return URL is registered with DIAS have all been explicitly provided.
"""

import os
import uuid
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests as http_requests

from database import get_db
from models import IrisPayment
from auth_utils import get_current_user

logger = logging.getLogger("iris_payments")

router = APIRouter(prefix="/payments/iris", tags=["iris-payments"])

VAT_RATE = 0.24

# DIAS Result Response -> internal status, per Parartima A.2 / section 3.4.
# orderStatus values: PENDING, CANCELLED, ABORTED, ERROR, TRANSACTION_CREATED
# txStatus (only when orderStatus == TRANSACTION_CREATED): AUTHORISED, PENDING,
# TIMEOUT, AUTHORISINGPARTYABORTED, ERROR
ORDER_STATUS_MAP = {
    "PENDING": "pending",
    "CANCELLED": "cancelled",
    "ABORTED": "cancelled",
    "ERROR": "failed",
}
TX_STATUS_MAP = {
    "AUTHORISED": "authorised",
    "PENDING": "pending",
    "TIMEOUT": "expired",
    "AUTHORISINGPARTYABORTED": "cancelled",
    "ERROR": "failed",
}

# DMSP error codes the Initiation / Result APIs may return (Parartima A.1 / A.2)
DMSP_ERROR_MESSAGES = {
    "DMSP1000": "Γενικό σφάλμα διακομιστή ΔΙΑΣ.",
    "DMSP1001": "Γενικό σφάλμα αιτήματος.",
    "DMSP1002": "Λάθος όνομα χρήστη ή κωδικός πρόσβασης.",
    "DMSP1003": "Το αίτημα πληρωμής δεν βρέθηκε.",
    "DMSP1010": "Η υπηρεσία IRIS βρίσκεται σε προγραμματισμένη συντήρηση.",
    "DMSP1102": "Λείπει το messageId.",
    "DMSP1103": "Μη έγκυρο messageId.",
    "DMSP1104": "Μη έγκυρη ημερομηνία/ώρα δημιουργίας μηνύματος.",
    "DMSP1107": "Λείπει το initiatingPartyRefId.",
    "DMSP1108": "Μη έγκυρο initiatingPartyRefId.",
    "DMSP1109": "Μη έγκυρη διάρκεια ισχύος αιτήματος.",
    "DMSP1110": "Λείπει το νόμισμα.",
    "DMSP1111": "Μη έγκυρο νόμισμα.",
    "DMSP1112": "Λείπει το ποσό πληρωμής.",
    "DMSP1113": "Μη έγκυρο ποσό πληρωμής.",
    "DMSP1114": "Λείπει το initiatingPartyReturnURL.",
    "DMSP1115": "Μη έγκυρο initiatingPartyReturnURL.",
    "DMSP1116": "Μη έγκυρη περιγραφή πληρωμής (unstructured1).",
    "DMSP1117": "Μη έγκυρος κωδικός πληρωμής RI0 (unstructured2).",
    "DMSP1118": "Λείπει το orderId.",
    "DMSP1119": "Μη έγκυρο orderId.",
    "DMSP1120": "Το initiatingPartyRefId υπάρχει ήδη.",
    "DMSP1130": "Διπλό messageId.",
    "DMSP1131": "Λείπει η περιγραφή πληρωμής (unstructured1).",
    "DMSP1140": "Μη εξουσιοδοτημένη ενέργεια.",
    "DMSP1141": "Λείπει ο κωδικός πληρωμής RI0 (unstructured2).",
    "DMSP1143": "Μη έγκυρη τιμή πεδίου version.",
    "DMSP1144": "Μη έγκυρο initiationChannel.",
    "DMSP1145": "Μη έγκυρη εμπορική επωνυμία τελικού δικαιούχου.",
    "DMSP1146": "Μη έγκυρος λογαριασμός τελικού δικαιούχου.",
}


def iris_enabled() -> bool:
    enabled = os.getenv("ENABLE_IRIS_PAYMENTS", "false").lower() == "true"
    if enabled:
        logger.info("IRIS Payments enabled")
    return enabled


def _iris_config():
    return {
        "username": os.getenv("DIAS_IRIS_USERNAME", ""),
        "password": os.getenv("DIAS_IRIS_PASSWORD", ""),
        "initiation_url": os.getenv("DIAS_IRIS_INITIATION_URL", ""),
        "result_url": os.getenv("DIAS_IRIS_RESULT_URL", ""),
        "return_url": os.getenv("DIAS_IRIS_RETURN_URL", ""),
        "validity": os.getenv("DIAS_IRIS_DEFAULT_VALIDITY", "18"),
        "language": os.getenv("DIAS_IRIS_LANGUAGE", "el"),
        "channel": os.getenv("DIAS_IRIS_INITIATION_CHANNEL", "1"),
    }


def _short(name: str, max_len: int = 30) -> str:
    name = (name or "").strip()
    return name[:max_len]


def _generate_ri0_code(db: Session) -> str:
    """Unique RI0 unstructured payment code, e.g. IM202606190001.

    Format: IM + YYYYMMDD + 4-digit daily sequence.
    """
    today_prefix = "IM" + datetime.utcnow().strftime("%Y%m%d")
    count_today = (
        db.query(func.count(IrisPayment.id))
        .filter(IrisPayment.payment_code_ri0.like(f"{today_prefix}%"))
        .scalar()
        or 0
    )
    return f"{today_prefix}{count_today + 1:04d}"


def _now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.utcnow().microsecond // 1000:03d}Z"


def _redact(payload: dict) -> dict:
    """Copy of a DIAS request payload with credentials masked, safe for logs."""
    redacted = dict(payload)
    if "password" in redacted:
        redacted["password"] = "***"
    if "userName" in redacted:
        redacted["userName"] = (redacted["userName"][:2] + "***") if redacted["userName"] else ""
    return redacted


def _call_dias(url: str, payload: dict, label: str) -> dict:
    """POST a JSON message to DIAS and return the parsed JSON body.

    Per spec: must be treated as a valid response only when HTTP status is 200.
    The eshop environment should wait up to 10s for a response.
    """
    logger.info("IRIS %s request -> %s payload=%s", label, url, _redact(payload))
    try:
        resp = http_requests.post(url, json=payload, timeout=10)
    except http_requests.exceptions.RequestException as exc:
        logger.error("IRIS %s request failed: %s", label, exc)
        raise HTTPException(status_code=502, detail=f"Αδυναμία επικοινωνίας με ΔΙΑΣ ({label}).")

    try:
        body = resp.json()
    except ValueError:
        body = {}

    logger.info("IRIS %s response <- status=%s body=%s", label, resp.status_code, body)

    if resp.status_code != 200:
        error_code = body.get("errorCode") or body.get("resp", {}).get("errorCode")
        error_desc = body.get("errorDescription") or DMSP_ERROR_MESSAGES.get(error_code, "Σφάλμα ΔΙΑΣ.")
        raise HTTPException(
            status_code=502,
            detail={"errorCode": error_code, "errorDescription": error_desc, "diasHttpStatus": resp.status_code},
        )

    return body


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateIrisPaymentRequest(BaseModel):
    customerName: str
    customerAFM: str = ""
    serviceType: str = ""
    netAmount: float
    linkedCaseId: int | None = None


class IrisPaymentOut(BaseModel):
    id: int
    paymentId: str
    customerName: str
    customerAFM: str
    serviceType: str
    netAmount: float
    vatAmount: float
    totalAmount: float
    paymentReason: str
    paymentCodeRI0: str
    diasOrderId: str
    bankSelectionToolUrl: str
    status: str
    originalTxStatus: str
    payerName: str
    createdAt: datetime
    expiresAt: datetime | None
    paidAt: datetime | None
    errorCode: str
    errorDescription: str

    class Config:
        from_attributes = True


def _serialize(p: IrisPayment) -> dict:
    return {
        "id": p.id,
        "paymentId": p.payment_id,
        "customerName": p.customer_name,
        "customerAFM": p.customer_afm,
        "serviceType": p.service_type,
        "netAmount": p.net_amount,
        "vatAmount": p.vat_amount,
        "totalAmount": p.total_amount,
        "paymentReason": p.payment_reason,
        "paymentCodeRI0": p.payment_code_ri0,
        "diasOrderId": p.dias_order_id,
        "bankSelectionToolUrl": p.bank_selection_tool_url,
        "status": p.status,
        "originalTxStatus": p.original_tx_status,
        "payerName": p.payer_name,
        "createdAt": p.created_at,
        "expiresAt": p.expires_at,
        "paidAt": p.paid_at,
        "errorCode": p.error_code,
        "errorDescription": p.error_description,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/create", dependencies=[Depends(get_current_user)])
def create_iris_payment(data: CreateIrisPaymentRequest, db: Session = Depends(get_db)):
    if not iris_enabled():
        raise HTTPException(status_code=503, detail="Οι πληρωμές IRIS δεν είναι ενεργοποιημένες.")

    cfg = _iris_config()
    if not cfg["username"] or not cfg["password"] or not cfg["initiation_url"] or not cfg["return_url"]:
        raise HTTPException(status_code=500, detail="Λείπει ρύθμιση IRIS (env vars) στο backend.")

    if data.netAmount is None or data.netAmount <= 0:
        raise HTTPException(status_code=400, detail="Μη έγκυρο ποσό.")

    net_amount = round(data.netAmount, 2)
    vat_amount = round(net_amount * VAT_RATE, 2)
    total_amount = round(net_amount + vat_amount, 2)
    instructed_amount_cents = int(round(total_amount * 100))

    payment_reason = f"{_short(data.customerName)} {_short(data.serviceType)}".strip()[:128]

    payment_id = f"PAY-{uuid.uuid4().hex[:12].upper()}"
    message_id = uuid.uuid4().hex
    initiating_party_ref_id = uuid.uuid4().hex
    ri0_code = _generate_ri0_code(db)

    record = IrisPayment(
        payment_id=payment_id,
        customer_name=data.customerName,
        customer_afm=data.customerAFM,
        service_type=data.serviceType,
        net_amount=net_amount,
        vat_amount=vat_amount,
        total_amount=total_amount,
        payment_reason=payment_reason,
        payment_code_ri0=ri0_code,
        message_id=message_id,
        initiating_party_ref_id=initiating_party_ref_id,
        status="created",
        linked_case_id=data.linkedCaseId,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return_url = f"{cfg['return_url']}?paymentId={payment_id}"

    payload = {
        "userName": cfg["username"],
        "password": cfg["password"],
        "messageId": message_id,
        "creationDateTime": _now_iso(),
        "initiatingPartyRefId": initiating_party_ref_id,
        "validityPeriod": str(cfg["validity"]),
        "initiatingPartyReturnURL": return_url,
        "instructedAmount": str(instructed_amount_cents),
        "currency": "EUR",
        "remmittanceInfo": {
            "unstructured1": payment_reason,
            "unstructured2": ri0_code,
        },
        "language": cfg["language"],
        "initiationChannel": str(cfg["channel"]),
    }

    try:
        body = _call_dias(cfg["initiation_url"], payload, "Initiation")
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        record.status = "failed"
        record.error_code = detail.get("errorCode", "")
        record.error_description = detail.get("errorDescription", str(exc.detail))
        db.commit()
        raise

    resp = body.get("resp")
    if not resp:
        error_code = body.get("errorCode", "")
        error_desc = body.get("errorDescription") or DMSP_ERROR_MESSAGES.get(error_code, "Άγνωστο σφάλμα ΔΙΑΣ.")
        record.status = "failed"
        record.error_code = error_code
        record.error_description = error_desc
        record.raw_initiation_response = body
        db.commit()
        raise HTTPException(status_code=502, detail={"errorCode": error_code, "errorDescription": error_desc})

    record.dias_order_id = resp.get("orderId", "")
    record.bank_selection_tool_url = resp.get("bankSelectionToolUrl", "")
    record.status = "pending"
    record.expires_at = datetime.utcnow() + timedelta(minutes=int(cfg["validity"]))
    record.raw_initiation_response = body
    db.commit()
    db.refresh(record)

    return _serialize(record)


@router.get("", dependencies=[Depends(get_current_user)])
def list_iris_payments(db: Session = Depends(get_db)):
    rows = db.query(IrisPayment).order_by(IrisPayment.created_at.desc()).limit(500).all()
    return [_serialize(r) for r in rows]


@router.get("/{payment_id}", dependencies=[Depends(get_current_user)])
def get_iris_payment(payment_id: str, db: Session = Depends(get_db)):
    record = db.query(IrisPayment).filter(IrisPayment.payment_id == payment_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε η πληρωμή.")
    return _serialize(record)


@router.post("/{payment_id}/recheck", dependencies=[Depends(get_current_user)])
def recheck_iris_payment(payment_id: str, db: Session = Depends(get_db)):
    if not iris_enabled():
        raise HTTPException(status_code=503, detail="Οι πληρωμές IRIS δεν είναι ενεργοποιημένες.")

    record = db.query(IrisPayment).filter(IrisPayment.payment_id == payment_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε η πληρωμή.")
    if not record.dias_order_id:
        raise HTTPException(status_code=400, detail="Δεν υπάρχει orderId για αυτή την πληρωμή.")

    cfg = _iris_config()
    payload = {
        "userName": cfg["username"],
        "password": cfg["password"],
        "messageId": uuid.uuid4().hex,
        "creationDateTime": _now_iso(),
        "orderId": record.dias_order_id,
        "version": "2",
    }

    try:
        body = _call_dias(cfg["result_url"], payload, "Result")
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        record.error_code = detail.get("errorCode", "")
        record.error_description = detail.get("errorDescription", str(exc.detail))
        db.commit()
        raise

    resp = body.get("resp")
    if not resp:
        error_code = body.get("errorCode", "")
        error_desc = body.get("errorDescription") or DMSP_ERROR_MESSAGES.get(error_code, "Άγνωστο σφάλμα ΔΙΑΣ.")
        record.error_code = error_code
        record.error_description = error_desc
        record.raw_result_response = body
        db.commit()
        raise HTTPException(status_code=502, detail={"errorCode": error_code, "errorDescription": error_desc})

    order_status = resp.get("orderStatus", "")
    tx_status = resp.get("txStatus", "")
    result = resp.get("result") or {}
    original_tx_status = result.get("originalTxStatus", "")

    if order_status == "TRANSACTION_CREATED" and tx_status:
        new_status = TX_STATUS_MAP.get(tx_status, "pending")
        if tx_status == "AUTHORISED" and original_tx_status == "RJCT":
            new_status = "failed"
    else:
        new_status = ORDER_STATUS_MAP.get(order_status, record.status)

    record.status = new_status
    record.original_tx_status = original_tx_status
    record.payer_name = result.get("debtorName", record.payer_name)
    record.raw_result_response = body
    record.error_code = ""
    record.error_description = ""
    if new_status == "authorised" and not record.paid_at:
        record.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(record)

    return _serialize(record)
