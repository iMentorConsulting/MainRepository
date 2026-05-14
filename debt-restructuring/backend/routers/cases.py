from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os, json, base64
import requests as http_requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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


class EmailSendRequest(BaseModel):
    to: str
    subject: str
    body: str


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
                return False, f"create_contact HTTP {r.status_code}: {r.text[:200]}"
        except Exception as e:
            return False, f"create_contact exception: {e}"

    if not contact_id:
        return False, "Αδυναμία δημιουργίας/εύρεσης contact"

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
    if data.contact_stage and data.contact_stage != case.contact_stage:
        case.contact_stage = data.contact_stage
        case.stage_changed_at = datetime.utcnow()
    if data.increment_reminder:
        case.reminder_count = (case.reminder_count or 0) + 1
    case.last_contacted_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()
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
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.patch("/{id}/offer", response_model=CaseResponse)
def update_offer(id: int, data: OfferPatch, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    case.commercial_offer = data.commercial_offer
    case.updated_at = datetime.utcnow()
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

    body = f"""Αίτηση έγκρισης τιμολόγησης

Υπόθεση:  {case.client_name}
ΑΦΜ:      {case.client_vat or '—'}
Τηλ:      {case.client_phone or '—'}
Σύμβουλος: {data.employee}

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
    channel: str = "viber"  # "viber" | "email"


@router.post("/{id}/send-winback", response_model=CaseResponse)
def send_winback(id: int, data: WinbackSendRequest, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Η υπόθεση δεν βρέθηκε")
    offer = dict(case.commercial_offer or {})
    if offer.get("winback_status") != "approved":
        raise HTTPException(status_code=400, detail="Η επαναφορά δεν έχει εγκριθεί")

    wb_app = offer.get("winback_app", 0)
    wb_suc = offer.get("winback_suc", 0)

    message = (
        f"Αγαπητέ/ή {case.client_name},\n\n"
        f"Γνωρίζουμε ότι η διαχείριση χρηματοοικονομικών υποχρεώσεων απαιτεί τόσο τον κατάλληλο χρόνο "
        f"όσο και την κατάλληλη στιγμή. Επανερχόμαστε, γιατί πιστεύουμε ότι ορισμένες ευκαιρίες αξίζουν "
        f"μια δεύτερη ματιά.\n\n"
        f"Η ρύθμιση οφειλών δεν είναι απλώς μια νομική διαδικασία — είναι η αφετηρία για να αφήσετε "
        f"πίσω σας το βάρος και να κοιτάξετε μπροστά με σαφήνεια. Θέλουμε να είμαστε δίπλα σας "
        f"σε αυτό το βήμα, με όρους που αντικατοπτρίζουν την πραγματική μας δέσμευση απέναντί σας:\n\n"
        f"• Κόστος υποβολής αίτησης: {int(wb_app):,} €\n"
        f"• Αμοιβή επιτυχίας: {int(wb_suc):,} €\n\n"
        f"Είμαστε στη διάθεσή σας για μια σύντομη συνομιλία, χωρίς καμία υποχρέωση.\n\nΗ ομάδα iMentor"
    )

    if data.channel == "email":
        if not (case.client_email or "").strip():
            raise HTTPException(status_code=400, detail="Δεν υπάρχει email πελάτη")
        ok, err = _send_gmail(
            case.client_email,
            "Ειδικές Συνθήκες Συνεργασίας — iMentor",
            message,
        )
        if not ok:
            raise HTTPException(status_code=503, detail=f"Αποτυχία αποστολής email: {err}")
    else:
        phone = (case.client_phone or "").strip().replace(" ", "").replace("-", "")
        if not phone:
            raise HTTPException(status_code=400, detail="Δεν υπάρχει τηλέφωνο πελάτη")
        if not phone.startswith("+"):
            phone = "+30" + (phone[1:] if phone.startswith("0") else phone)
        ok, err = _chatwoot_send(case.client_name, phone, message)
        if not ok:
            raise HTTPException(status_code=503, detail=f"Αποτυχία αποστολής Viber: {err}")

    offer["winback_status"] = "sent"
    case.commercial_offer = offer
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
