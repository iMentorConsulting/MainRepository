from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os
import requests as http_requests

from database import get_db
from models import Case
from schemas import CaseCreate, CaseUpdate, CaseResponse, CaseListItem, ActualResultsUpdate, ContactUpdate

router = APIRouter(prefix="/cases", tags=["cases"])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


class ViberSendRequest(BaseModel):
    message: str
    msg_type: str = "initial"  # initial / reminder1 / reminder2 / final
    is_initial: bool = False
    is_reminder: bool = False


def _chatwoot_send(client_name: str, phone: str, message: str) -> tuple[bool, str]:
    """Create/find contact in Chatwoot, open conversation, post outgoing message.
    Returns (True, "") on success, (False, reason) on failure."""
    cw_url = os.getenv("CHATWOOT_URL", "").rstrip("/")
    cw_token = os.getenv("CHATWOOT_API_TOKEN", "")
    cw_account = os.getenv("CHATWOOT_ACCOUNT_ID", "")
    cw_inbox = os.getenv("CHATWOOT_INBOX_ID", "")

    if not all([cw_url, cw_token, cw_account, cw_inbox]):
        missing = [k for k, v in {"CHATWOOT_URL": cw_url, "CHATWOOT_API_TOKEN": cw_token,
                                   "CHATWOOT_ACCOUNT_ID": cw_account, "CHATWOOT_INBOX_ID": cw_inbox}.items() if not v]
        return False, f"Λείπουν env vars: {', '.join(missing)}"

    headers = {"api_access_token": cw_token, "Content-Type": "application/json"}
    base = f"{cw_url}/api/v1/accounts/{cw_account}"
    print(f"[Chatwoot] base={base} inbox={cw_inbox} phone={phone}")

    # 1. Search for existing contact by phone
    contact_id = None
    try:
        r = http_requests.get(
            f"{base}/contacts/search",
            params={"q": phone, "include_contacts": "true"},
            headers=headers, timeout=8,
        )
        print(f"[Chatwoot] search status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            contacts = r.json().get("payload", {}).get("contacts", [])
            if contacts:
                contact_id = contacts[0]["id"]
    except Exception as e:
        print(f"[Chatwoot] search exception: {e}")

    # 2. Create contact if not found
    if not contact_id:
        try:
            r = http_requests.post(
                f"{base}/contacts",
                json={"name": client_name, "phone_number": phone},
                headers=headers, timeout=8,
            )
            print(f"[Chatwoot] create_contact status={r.status_code} body={r.text[:300]}")
            if r.status_code in (200, 201):
                contact_id = r.json().get("id")
            else:
                return False, f"create_contact HTTP {r.status_code}: {r.text[:200]}"
        except Exception as e:
            return False, f"create_contact exception: {e}"

    if not contact_id:
        return False, "Αδυναμία δημιουργίας/εύρεσης contact"

    # 3. Create new conversation
    conv_id = None
    try:
        r = http_requests.post(
            f"{base}/contacts/{contact_id}/conversations",
            json={"inbox_id": int(cw_inbox)},
            headers=headers, timeout=8,
        )
        print(f"[Chatwoot] create_conv status={r.status_code} body={r.text[:300]}")
        if r.status_code in (200, 201):
            conv_id = r.json().get("id")
        else:
            return False, f"create_conv HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"create_conv exception: {e}"

    if not conv_id:
        return False, "Αδυναμία δημιουργίας conversation"

    # 4. Post outgoing message
    try:
        r = http_requests.post(
            f"{base}/conversations/{conv_id}/messages",
            json={"content": message, "message_type": "outgoing", "private": False},
            headers=headers, timeout=8,
        )
        print(f"[Chatwoot] send_msg status={r.status_code} body={r.text[:300]}")
        if r.status_code in (200, 201):
            return True, ""
        return False, f"send_msg HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"send_msg exception: {e}"


@router.get("/", response_model=List[CaseListItem])
def list_cases(
    employee: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Case)
    if employee:
        q = q.filter(Case.employee == employee)
    if status:
        q = q.filter(Case.status == status)
    if search:
        q = q.filter(Case.client_name.ilike(f"%{search}%"))
    return q.order_by(Case.created_at.desc()).all()


@router.post("/", response_model=CaseResponse, status_code=201)
def create_case(data: CaseCreate, db: Session = Depends(get_db)):
    if data.employee not in EMPLOYEES:
        raise HTTPException(status_code=400, detail="Μη έγκυρος υπάλληλος")
    case = Case(**data.model_dump())
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/{id}", response_model=CaseResponse)
def get_case(id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    return case


@router.put("/{id}", response_model=CaseResponse)
def update_case(id: int, data: CaseUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    if data.employee and data.employee not in EMPLOYEES:
        raise HTTPException(status_code=400, detail="Μη έγκυρος υπάλληλος")

    updates = data.model_dump(exclude_none=True)

    # Auto-set timestamps for status transitions
    if "status" in updates:
        if updates["status"] == "submitted" and case.status != "submitted":
            case.submitted_at = datetime.utcnow()
        if updates["status"] == "completed" and case.status != "completed":
            case.completed_at = datetime.utcnow()

    for k, v in updates.items():
        setattr(case, k, v)

    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/actual", response_model=CaseResponse)
def save_actual_results(id: int, data: ActualResultsUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    case.actual_results = data.actual_results
    case.updated_at = datetime.utcnow()
    if case.status not in ("completed", "cancelled"):
        case.status = "completed"
        case.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/contact", response_model=CaseResponse)
def update_contact(id: int, data: ContactUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    if data.contact_stage:
        case.contact_stage = data.contact_stage
    if data.increment_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    case.last_contacted_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.delete("/{id}")
def delete_case(id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    db.delete(case)
    db.commit()
    return {"ok": True}


@router.post("/{id}/send-viber", response_model=CaseResponse)
def send_viber_message(id: int, data: ViberSendRequest, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")

    phone = (case.client_phone or "").strip().replace(" ", "").replace("-", "")
    if phone and not phone.startswith("+"):
        if phone.startswith("00"):
            phone = "+" + phone[2:]
        elif phone.startswith("0"):
            phone = "+30" + phone[1:]
        else:
            phone = "+30" + phone

    # Try Chatwoot first (creates contact + conversation + delivers via Viber inbox)
    chatwoot_ok, chatwoot_err = _chatwoot_send(case.client_name, phone, data.message)

    # Legacy bridge fallback — only if Chatwoot not configured
    if not chatwoot_ok:
        bridge_url = os.getenv("BRIDGE_URL", "").strip()
        if not bridge_url:
            raise HTTPException(
                status_code=503,
                detail=f"Chatwoot: {chatwoot_err}" if chatwoot_err else "Δεν έχει ρυθμιστεί υπηρεσία αποστολής"
            )
        try:
            resp = http_requests.post(
                f"{bridge_url}/send",
                json={"phone": phone, "message": data.message, "caseId": id, "clientName": case.client_name},
                timeout=10,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Αποτυχία bridge (HTTP {resp.status_code})")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Αδυναμία σύνδεσης bridge: {exc}")

    case.last_contacted_at = datetime.utcnow()
    if data.is_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    if data.is_initial and (case.contact_stage or "Νέα Ανάλυση") == "Νέα Ανάλυση":
        case.contact_stage = "Εστάλη Σύνδεσμος"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{id}/duplicate", response_model=CaseResponse, status_code=201)
def duplicate_case(id: int, db: Session = Depends(get_db)):
    original = db.query(Case).filter(Case.id == id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    new_case = Case(
        client_name=f"{original.client_name} (αντίγραφο)",
        client_phone=original.client_phone,
        client_email=original.client_email,
        employee=original.employee,
        status="draft",
        debtor_type=original.debtor_type,
        debts=original.debts,
        assets=original.assets,
        income_data=original.income_data,
        estimates=original.estimates,
        notes=original.notes,
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)
    return new_case
