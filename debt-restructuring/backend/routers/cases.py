from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
from pydantic import BaseModel
import os, json, base64, time

_ATHENS = ZoneInfo("Europe/Athens")
def _now():
    return datetime.now(_ATHENS).replace(tzinfo=None)
import requests as http_requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from database import get_db
from models import Case
from schemas import CaseCreate, CaseUpdate, CaseResponse, CaseListItem, ActualResultsUpdate, ContactUpdate
from auth_utils import get_current_user

router = APIRouter(prefix="/cases", tags=["cases"], dependencies=[Depends(get_current_user)])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


class ViberSendRequest(BaseModel):
    message: str
    msg_type: str = "initial"  # initial / reminder1 / reminder2 / final
    is_initial: bool = False
    is_reminder: bool = False


class OfferPatch(BaseModel):
    commercial_offer: dict


class PricingApprovalNotify(BaseModel):
    employee: str
    proposed_app: float
    proposed_suc: float
    system_app: float
    system_suc: float
    score: float = 0
    breakdown: list = []
    reason: str = ""


class EmailSendRequest(BaseModel):
    to: str
    subject: str
    body: str


def _chatwoot_send_with_retry(client_name: str, phone: str, message: str, max_attempts: int = 3) -> tuple[bool, str]:
    last_err = ""
    for attempt in range(1, max_attempts + 1):
        ok, err = _chatwoot_send(client_name, phone, message)
        if ok:
            return True, ""
        last_err = err
        is_retryable = (
            "timed out" in err.lower() or "timeout" in err.lower() or
            "connectionpool" in err.lower() or "αδυναμία" in err.lower()
        )
        if not is_retryable or attempt == max_attempts:
            break
        wait = attempt * 3
        print(f"[Chatwoot] attempt {attempt} failed ({err[:60]}), retrying in {wait}s...")
        time.sleep(wait)
    return False, last_err


def _send_gmail(to: str, subject: str, body: str) -> tuple[bool, str]:
    """Send email via Gmail API using Google Service Account (Domain-Wide Delegation).
    Returns (True, "") on success, (False, reason) on failure."""
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    sender = os.getenv("SMTP_USER", "").strip()
    if not sa_json or not sender:
        return False, "GOOGLE_SERVICE_ACCOUNT_JSON ή SMTP_USER δεν έχουν οριστεί"
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_service_account_info(
            json.loads(sa_json),
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        ).with_subject(sender)

        svc = build("gmail", "v1", credentials=creds, cache_discovery=False)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to
        msg.attach(MIMEText(body, "plain", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        svc.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True, ""
    except Exception as e:
        return False, str(e)


def _chatwoot_send(client_name: str, phone: str, message: str) -> tuple[bool, str]:
    """Create/find contact in Chatwoot, open conversation, post outgoing message.
    Returns (True, "") on success, (False, reason) on failure."""
    cw_url = os.getenv("CHATWOOT_URL", "").strip().rstrip("/")
    cw_token = os.getenv("CHATWOOT_API_TOKEN", "").strip()
    cw_account = os.getenv("CHATWOOT_ACCOUNT_ID", "").strip()
    cw_inbox = os.getenv("CHATWOOT_INBOX_ID", "").strip()

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
            # payload is a list of contacts directly (not a dict with "contacts" key)
            payload = r.json().get("payload", [])
            contacts = payload if isinstance(payload, list) else payload.get("contacts", [])
            if contacts:
                contact_id = contacts[0]["id"]
                print(f"[Chatwoot] found existing contact id={contact_id}")
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
                # Some Chatwoot versions embed the existing contact in the error body
                try:
                    body = r.json()
                    contact_id = (
                        body.get("id") or
                        body.get("data", {}).get("id") or
                        (body.get("errors", [{}])[0] if isinstance(body.get("errors"), list) else {}).get("id")
                    ) or None
                except Exception:
                    pass
                # If still not found, wait briefly then retry search — Chatwoot may need time to commit
                if not contact_id:
                    print(f"[Chatwoot] create failed ({r.status_code}), waiting 2s then retrying search...")
                    time.sleep(2)
                    try:
                        r2 = http_requests.get(
                            f"{base}/contacts/search",
                            params={"q": phone, "include_contacts": "true"},
                            headers=headers, timeout=8,
                        )
                        if r2.status_code == 200:
                            payload = r2.json().get("payload", [])
                            contacts = payload if isinstance(payload, list) else payload.get("contacts", [])
                            if contacts:
                                contact_id = contacts[0]["id"]
                                print(f"[Chatwoot] found contact on retry id={contact_id}")
                    except Exception as e2:
                        print(f"[Chatwoot] retry search exception: {e2}")
        except Exception as e:
            return False, f"create_contact exception: {e}"

    if not contact_id:
        return False, f"Αδυναμία δημιουργίας/εύρεσης contact για αριθμό {phone}"

    # 3. Create new conversation
    conv_id = None
    try:
        conv_url = f"{base}/conversations"
        conv_body = {"inbox_id": int(cw_inbox), "contact_id": contact_id}
        print(f"[Chatwoot] create_conv POST {conv_url} body={conv_body}")
        r = http_requests.post(conv_url, json=conv_body, headers=headers, timeout=8)
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
            case.submitted_at = _now()
        if updates["status"] == "completed" and case.status != "completed":
            case.completed_at = _now()

    for k, v in updates.items():
        setattr(case, k, v)

    case.updated_at = _now()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/actual", response_model=CaseResponse)
def save_actual_results(id: int, data: ActualResultsUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    case.actual_results = data.actual_results
    case.updated_at = _now()
    if case.status not in ("completed", "cancelled"):
        case.status = "completed"
        case.completed_at = _now()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/contact", response_model=CaseResponse)
def update_contact(id: int, data: ContactUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    if data.contact_stage and data.contact_stage != case.contact_stage:
        case.contact_stage = data.contact_stage
        case.stage_changed_at = _now()
    if data.increment_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    case.last_contacted_at = _now()
    case.updated_at = _now()
    db.commit()
    db.refresh(case)
    return case


class WinbackApprove(BaseModel):
    approve: bool  # True = approve, False = dismiss


@router.post("/{id}/approve-winback", response_model=CaseResponse)
def approve_winback(id: int, data: WinbackApprove, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    offer = dict(case.commercial_offer or {})
    if data.approve:
        orig_app = float(offer.get("application_fee") or offer.get("system_app") or 0)
        orig_suc = float(offer.get("success_fee") or offer.get("system_suc") or 0)
        wb_app = round(orig_app * 0.7 / 10) * 10
        wb_suc = round(orig_suc * 0.7 / 10) * 10
        offer["winback_app"] = max(wb_app, 10)
        offer["winback_suc"] = max(wb_suc, 10)
        offer["winback_status"] = "approved"
        offer["winback_saving"] = round((orig_app - offer["winback_app"]) + (orig_suc - offer["winback_suc"]))
    else:
        offer["winback_status"] = "dismissed"
    case.commercial_offer = offer
    case.updated_at = _now()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/offer", response_model=CaseResponse)
def update_offer(id: int, data: OfferPatch, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    case.commercial_offer = data.commercial_offer
    case.updated_at = _now()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{id}/notify-pricing-approval")
def notify_pricing_approval(id: int, data: PricingApprovalNotify, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")

    diff_app = data.proposed_app - data.system_app
    diff_suc = data.proposed_suc - data.system_suc
    breakdown_lines = "\n".join(
        f"  • {it.get('label','')}: {'+' if it.get('value',0) >= 0 else ''}{it.get('value',0)}"
        for it in (data.breakdown or [])
    )

    reason_block = f"\n── Αιτιολόγηση Συμβούλου ────────────────────\n{data.reason}\n" if data.reason else ""

    body = f"""Αίτηση έγκρισης τιμολόγησης

Υπόθεση:  {case.client_name}
ΑΦΜ:      {case.client_vat or '—'}
Τηλ:      {case.client_phone or '—'}
Σύμβουλος: {data.employee}
{reason_block}
── Τιμολόγηση ───────────────────────────────
Πρόταση σύμβουλου:
  Ποσό Αίτησης:  {data.proposed_app:,.0f} €
  Success Fee:   {data.proposed_suc:,.0f} €

Πρόταση συστήματος:
  Ποσό Αίτησης:  {data.system_app:,.0f} €
  Success Fee:   {data.system_suc:,.0f} €

Διαφορά:  {diff_app:+,.0f} € / {diff_suc:+,.0f} €

── Ανάλυση Score ({data.score}) ──────────────
{breakdown_lines}

── Οφειλές ──────────────────────────────────
{chr(10).join(f"  • {d.get('creditorName') or d.get('type','')}: {d.get('amount',0):,.0f} €" for d in (case.debts or []) if d.get('amount',0) > 0)}

Μπορείτε να εγκρίνετε ή να απορρίψετε την αίτηση από το Admin Dashboard.
"""

    ok, err = _send_gmail("haris.apostolakis@gmail.com",
                          f"[iMentor] Αίτηση Έγκρισης Τιμολόγησης — {case.client_name}",
                          body)
    if not ok:
        raise HTTPException(status_code=503, detail=f"Αποτυχία αποστολής email: {err}")
    return {"sent": True}


class WinbackSendRequest(BaseModel):
    channel: str = "viber"  # "viber" | "email" | "both"
    message: str
    subject: str = "Ειδικές Συνθήκες Συνεργασίας — iMentor"


@router.post("/{id}/send-winback", response_model=CaseResponse)
def send_winback(id: int, data: WinbackSendRequest, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    offer = dict(case.commercial_offer or {})
    if offer.get("winback_status") != "approved":
        raise HTTPException(status_code=400, detail="Η επαναφορά δεν έχει εγκριθεί")

    errors = []

    if data.channel in ("viber", "both"):
        phone = (case.client_phone or "").strip().replace(" ", "").replace("-", "")
        if not phone:
            errors.append("Δεν υπάρχει τηλέφωνο πελάτη")
        else:
            if not phone.startswith("+"):
                phone = "+30" + (phone[1:] if phone.startswith("0") else phone)
            ok, err = _chatwoot_send_with_retry(case.client_name, phone, data.message)
            if not ok:
                errors.append(f"Viber: {err}")

    if data.channel in ("email", "both"):
        if not (case.client_email or "").strip():
            errors.append("Δεν υπάρχει email πελάτη")
        else:
            ok, err = _send_gmail(case.client_email, data.subject, data.message)
            if not ok:
                errors.append(f"Email: {err}")

    if errors:
        raise HTTPException(status_code=503, detail=" | ".join(errors))

    offer["winback_status"] = "sent"
    case.commercial_offer = offer
    case.last_contacted_at = _now()
    case.updated_at = _now()
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

    case.last_contacted_at = _now()
    if data.is_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    if data.is_initial and (case.contact_stage or "Νέα Ανάλυση") == "Νέα Ανάλυση":
        case.contact_stage = "Εστάλη Σύνδεσμος"
    case.updated_at = _now()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{id}/send-email")
def send_email_message(id: int, data: EmailSendRequest, db: Session = Depends(get_db)):
    """Send email via Gmail API (Service Account). Used from Pipeline Viber+Email modal."""
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    ok, err = _send_gmail(data.to, data.subject, data.body)
    if not ok:
        raise HTTPException(status_code=503, detail=f"Αποτυχία αποστολής email: {err}")
    return {"ok": True}


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
