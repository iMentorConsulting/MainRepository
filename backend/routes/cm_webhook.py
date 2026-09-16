"""
Website-form → Lead webhook integration.

Public endpoint (auth by per-source token in the URL):
  POST /api/webhook/lead/{token}

Accepts JSON or application/x-www-form-urlencoded payloads from any
website form builder (Typeform, Gravity Forms, custom HTML, etc.).

Admin CRUD endpoints (Bearer auth, admin only):
  GET    /api/cm/webhook-sources
  POST   /api/cm/webhook-sources
  PUT    /api/cm/webhook-sources/{id}
  DELETE /api/cm/webhook-sources/{id}
"""
import secrets
import unicodedata
import logging
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user
from database import get_db
from models_cases import CMWebhookSource, CMLead, CMUser

log = logging.getLogger(__name__)

# ── Routers ───────────────────────────────────────────────────────────────────

router_public = APIRouter(prefix="/api/webhook", tags=["webhook"])
router_admin  = APIRouter(prefix="/api/cm/webhook-sources", tags=["webhook-admin"])

# ── Program detection ─────────────────────────────────────────────────────────

_PROGRAMS = ["ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", "ΔΥΠΑ", "ΕΣΠΑ", "ΑΝΑΚΑΙΝΙΖΩ", "ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ"]


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    ).upper()


def _detect_program(value: str, program_map: dict | None) -> str | None:
    """Map a raw form value to a CM program category.

    1. Check the custom program_map configured for this webhook source.
    2. Fall back to keyword matching.
    """
    if not value:
        return None
    v = _strip_accents(str(value).strip())

    if program_map:
        for k, cat in program_map.items():
            if _strip_accents(k) == v or _strip_accents(k) in v:
                return cat

    # Built-in keyword heuristics
    if "ΜΙΚΡΟ" in v:
        return "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"
    if "ΑΝΑΚΑΙΝ" in v:
        return "ΑΝΑΚΑΙΝΙΖΩ"
    if "ΔΥΠΑ" in v or "ΟΑΕΔ" in v or "ΑΝΕΡΓ" in v or "ΠΡΟΣΛΗΨ" in v:
        return "ΔΥΠΑ"
    if "ΕΣΠΑ" in v:
        return "ΕΣΠΑ"
    return None


# ── Field mapping ─────────────────────────────────────────────────────────────

_LEAD_FIELDS = {"name", "phone", "phone2", "email", "afm", "notes", "service_type", "program"}

_BUILTIN_ALIASES: dict[str, str] = {
    # name
    "full_name": "name", "fullname": "name", "firstname": "name",
    "first_name": "name", "επωνυμο": "name", "ονομα": "name",
    # phone
    "mobile": "phone", "telephone": "phone", "tel": "phone",
    "κινητο": "phone", "τηλεφωνο": "phone",
    # email
    "email_address": "email", "mail": "email",
    # afm
    "vat": "afm", "tax_id": "afm", "afm_number": "afm",
    # notes
    "message": "notes", "comment": "notes", "μηνυμα": "notes",
    # program
    "interest": "program", "program_interest": "program",
    "program_of_interest": "program", "service": "program",
    "ενδιαφερον": "program", "προγραμμα": "program",
}


def _clean_phone(p):
    if not p:
        return None
    s = str(p).strip().replace(" ", "").replace("-", "")
    if s.startswith("+30"):
        s = s[3:]
    elif s.startswith("0030"):
        s = s[4:]
    return s or None


def _clean_email(e):
    if not e:
        return None
    s = str(e).strip().replace(" ", "")
    return s or None


def _map_payload(raw: dict, field_map: dict | None, program_map: dict | None, default_program: str | None) -> dict:
    """Translate a raw form payload into a CMLead field dict."""
    resolved: dict[str, str] = {}

    def _target(key: str) -> str | None:
        k = key.lower().strip()
        if field_map and k in {fk.lower(): fv for fk, fv in field_map.items()}:
            fm = {fk.lower(): fv for fk, fv in field_map.items()}
            return fm[k]
        return _BUILTIN_ALIASES.get(k)

    for key, val in raw.items():
        target = _target(key)
        if target and target in _LEAD_FIELDS:
            resolved[target] = str(val).strip() if val is not None else ""

    lead_fields: dict[str, Any] = {}

    # Name
    if "name" in resolved:
        lead_fields["name"] = resolved["name"]

    # Phones
    if "phone" in resolved:
        lead_fields["phone"] = _clean_phone(resolved["phone"])
    if "phone2" in resolved:
        lead_fields["phone2"] = _clean_phone(resolved["phone2"])

    # Email
    if "email" in resolved:
        lead_fields["email"] = _clean_email(resolved["email"])

    # AFM
    if "afm" in resolved:
        afm = resolved["afm"].strip()
        if afm.isdigit() and len(afm) == 8:
            afm = "0" + afm
        lead_fields["afm"] = afm or None

    # Notes
    if "notes" in resolved:
        lead_fields["notes"] = resolved["notes"]

    # Service type
    if "service_type" in resolved:
        lead_fields["service_type"] = resolved["service_type"]

    # Program
    program = None
    if "program" in resolved:
        program = _detect_program(resolved["program"], program_map)
    if not program and default_program:
        program = default_program
    lead_fields["program"] = program

    return lead_fields


# ── Duplicate guard ───────────────────────────────────────────────────────────

def _phone_digits(p: str | None) -> str:
    import re
    d = re.sub(r"\D", "", p or "")
    return d[-10:] if len(d) >= 10 else d


def _find_existing(db: Session, fields: dict) -> CMLead | None:
    """Return an existing lead that matches on AFM or phone (within same program)."""
    program = fields.get("program")
    afm = fields.get("afm")
    phone = fields.get("phone")

    if afm:
        q = db.query(CMLead).filter(CMLead.afm == afm)
        if program:
            q = q.filter(CMLead.program == program)
        existing = q.order_by(CMLead.id.desc()).first()
        if existing:
            return existing

    if phone:
        key = _phone_digits(phone)
        if key:
            all_leads = db.query(CMLead).filter(
                CMLead.phone.isnot(None)
            )
            if program:
                all_leads = all_leads.filter(CMLead.program == program)
            for lead in all_leads.all():
                if _phone_digits(lead.phone) == key:
                    return lead

    return None


# ── Public webhook endpoint ───────────────────────────────────────────────────

@router_public.post("/lead/{token}")
async def receive_webhook_lead(token: str, request: Request, db: Session = Depends(get_db)):
    source = db.query(CMWebhookSource).filter(
        CMWebhookSource.token == token,
        CMWebhookSource.enabled == True,
    ).first()
    if not source:
        raise HTTPException(status_code=404, detail="Webhook source not found or disabled")

    # Accept both JSON and form-encoded payloads
    content_type = request.headers.get("content-type", "")
    try:
        if "json" in content_type:
            raw = await request.json()
        else:
            form = await request.form()
            raw = dict(form)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse request body")

    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object or form fields")

    fields = _map_payload(raw, source.field_map, source.program_map, source.default_program)

    # Require at least a name or a phone
    if not fields.get("name") and not fields.get("phone"):
        log.warning("[webhook] payload from source %d has neither name nor phone — skipping", source.id)
        return {"ok": True, "created": False, "reason": "no_contact_info"}

    existing = _find_existing(db, fields)
    if existing:
        # Update only blank fields so we don't overwrite richer existing data
        changed = False
        for f in ("name", "phone", "phone2", "email", "afm", "notes", "service_type"):
            if fields.get(f) and not getattr(existing, f):
                setattr(existing, f, fields[f])
                changed = True
        if changed:
            existing.updated_at = datetime.utcnow()
            db.commit()
        log.info("[webhook] merged into existing lead %d", existing.id)
        return {"ok": True, "created": False, "lead_id": existing.id}

    lead = CMLead(
        name=fields.get("name"),
        phone=fields.get("phone"),
        phone2=fields.get("phone2"),
        email=fields.get("email"),
        afm=fields.get("afm"),
        notes=fields.get("notes"),
        service_type=fields.get("service_type"),
        program=fields.get("program"),
        status="NEW LEAD",
        source=f"website:{source.name}",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    log.info("[webhook] created lead %d from source '%s'", lead.id, source.name)
    return {"ok": True, "created": True, "lead_id": lead.id}


# ── Admin CRUD ────────────────────────────────────────────────────────────────

def _require_admin(current_user: CMUser = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


def _source_dict(s: CMWebhookSource) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "token": s.token,
        "default_program": s.default_program,
        "field_map": s.field_map or {},
        "program_map": s.program_map or {},
        "enabled": s.enabled,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


class WebhookSourceCreate(BaseModel):
    name: str
    default_program: Optional[str] = None
    field_map: Optional[Dict[str, str]] = None
    program_map: Optional[Dict[str, str]] = None
    enabled: bool = True
    notes: Optional[str] = None


class WebhookSourceUpdate(BaseModel):
    name: Optional[str] = None
    default_program: Optional[str] = None
    field_map: Optional[Dict[str, str]] = None
    program_map: Optional[Dict[str, str]] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None


@router_admin.get("")
def list_webhook_sources(
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    sources = db.query(CMWebhookSource).order_by(CMWebhookSource.id).all()
    return [_source_dict(s) for s in sources]


@router_admin.post("")
def create_webhook_source(
    payload: WebhookSourceCreate,
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    token = secrets.token_urlsafe(32)
    s = CMWebhookSource(
        name=payload.name,
        token=token,
        default_program=payload.default_program,
        field_map=payload.field_map,
        program_map=payload.program_map,
        enabled=payload.enabled,
        notes=payload.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _source_dict(s)


@router_admin.put("/{source_id}")
def update_webhook_source(
    source_id: int,
    payload: WebhookSourceUpdate,
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(CMWebhookSource).filter(CMWebhookSource.id == source_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Webhook source not found")
    for field, val in payload.dict(exclude_none=True).items():
        setattr(s, field, val)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _source_dict(s)


@router_admin.post("/{source_id}/regenerate-token")
def regenerate_token(
    source_id: int,
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(CMWebhookSource).filter(CMWebhookSource.id == source_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Webhook source not found")
    s.token = secrets.token_urlsafe(32)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _source_dict(s)


@router_admin.delete("/{source_id}")
def delete_webhook_source(
    source_id: int,
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(CMWebhookSource).filter(CMWebhookSource.id == source_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Webhook source not found")
    db.delete(s)
    db.commit()
    return {"ok": True}
