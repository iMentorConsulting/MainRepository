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
import re
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
from models_cases import CMWebhookSource, CMWebhookLog, CMLead, CMUser

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

_LEAD_FIELDS = {"name", "phone", "phone2", "email", "afm", "notes", "service_type", "program", "program_title"}

_BUILTIN_ALIASES: dict[str, str] = {
    # name — common field names across form builders
    "full_name": "name", "fullname": "name", "firstname": "name",
    "first_name": "name", "last_name": "name", "lastname": "name",
    "surname": "name", "επωνυμο": "name", "ονομα": "name",
    "ονοματεπωνυμο": "name",
    # Contact Form 7 defaults
    "your-name": "name", "your-email": "email", "your-subject": "notes",
    "your-message": "notes", "your-phone": "phone",
    # phone
    "mobile": "phone", "mobile_phone": "phone", "cell": "phone",
    "cell_phone": "phone", "telephone": "phone", "tel": "phone",
    "phone_number": "phone", "phonenumber": "phone",
    "κινητο": "phone", "τηλεφωνο": "phone", "τηλ": "phone",
    # email
    "email_address": "email", "mail": "email", "e-mail": "email",
    # afm
    "vat": "afm", "tax_id": "afm", "afm_number": "afm", "taxid": "afm",
    # notes
    "message": "notes", "comment": "notes", "comments": "notes",
    "μηνυμα": "notes", "subject": "notes",
    # program
    "interest": "program", "program_interest": "program",
    "program_of_interest": "program", "service": "program",
    "ενδιαφερον": "program", "προγραμμα": "program",
    # program title
    "program_title": "program_title", "τιτλος_προγραμματος": "program_title",
}


def _looks_like_greek_phone(v: str) -> bool:
    """Heuristic: does this string look like a Greek phone number?"""
    s = re.sub(r"[\s\-\.\(\)]", "", v)
    if s.startswith("+30"):
        s = s[3:]
    elif s.startswith("0030"):
        s = s[4:]
    return bool(re.fullmatch(r"[26]\d{9}", s))


def _looks_like_name(v: str) -> bool:
    """Heuristic: does this string look like a person's full name?"""
    if re.search(r"\d", v):
        return False
    words = v.split()
    if len(words) < 2 or len(words) > 6:
        return False
    for w in words:
        if not re.fullmatch(r"[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ\-'\.]+", w):
            return False
    return True


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


def _map_payload(raw: dict, field_map: dict | None, program_map: dict | None, default_program: str | None, default_program_title: str | None = None) -> dict:
    """Translate a raw form payload into a CMLead field dict.

    Multiple form fields can map to the same target.  For 'notes' they are
    concatenated as "field_name: value" lines so no data is lost.
    Fields that don't match any mapping are appended to notes so no data is
    ever silently dropped.
    """
    # Build normalised field_map lookup: lower(form_key) → target_lead_field
    fm_lower: dict[str, str] = {fk.lower(): fv for fk, fv in (field_map or {}).items()}

    def _target(key: str) -> str | None:
        k = key.lower().strip()
        if k in fm_lower:
            return fm_lower[k]
        return _BUILTIN_ALIASES.get(k)

    # Collect per-target values; notes accumulate as list of (form_key, value)
    single: dict[str, str] = {}
    notes_parts: list[tuple[str, str]] = []
    unmapped: list[tuple[str, str]] = []   # fields with no recognised target

    for key, val in raw.items():
        if val is None:
            continue
        v = str(val).strip()
        if not v:
            continue
        # Skip Typeform/form-builder unfilled placeholder values like ${b14-3}
        if re.fullmatch(r"\$\{[^}]+\}", v):
            continue
        target = _target(key)
        if not target or target not in _LEAD_FIELDS:
            unmapped.append((key, v))
            continue
        if target == "notes":
            notes_parts.append((key, v))
        elif target not in single:          # first value wins for scalar fields
            single[target] = v

    lead_fields: dict[str, Any] = {}

    # Name
    if "name" in single:
        lead_fields["name"] = single["name"]

    # Phones
    if "phone" in single:
        lead_fields["phone"] = _clean_phone(single["phone"])
    if "phone2" in single:
        lead_fields["phone2"] = _clean_phone(single["phone2"])

    # Email
    if "email" in single:
        lead_fields["email"] = _clean_email(single["email"])

    # AFM
    if "afm" in single:
        afm = single["afm"]
        if afm.isdigit() and len(afm) == 8:
            afm = "0" + afm
        lead_fields["afm"] = afm or None

    # Notes — concatenate all mapped fields with labels
    if notes_parts:
        if len(notes_parts) == 1:
            lead_fields["notes"] = notes_parts[0][1]
        else:
            lead_fields["notes"] = "\n".join(f"{k}: {v}" for k, v in notes_parts)

    # Service type
    if "service_type" in single:
        lead_fields["service_type"] = single["service_type"]

    # Program title (specific program name from the website, e.g. "Ενίσχυση Βορείου Αιγαίου")
    if "program_title" in single:
        lead_fields["program_title"] = single["program_title"]

    # program_title — fall back to source default when payload provides none
    if "program_title" not in lead_fields and default_program_title:
        lead_fields["program_title"] = default_program_title

    # Program category — detect from explicit field, fall back to program_title, then default
    program = None
    if "program" in single:
        program = _detect_program(single["program"], program_map)
    if not program and "program_title" in lead_fields:
        program = _detect_program(lead_fields["program_title"], program_map)
    if not program and default_program:
        program = default_program
    # Also try to detect program from unmapped values (e.g. a "service" field not in aliases)
    if not program:
        for _k, _v in unmapped:
            program = _detect_program(_v, program_map)
            if program:
                break
    lead_fields["program"] = program

    # ── Heuristic fallback ────────────────────────────────────────────────────
    # If name/phone are still missing, scan unmapped values by content shape.
    # This handles forms that send non-standard field names without requiring
    # a configured field_map.
    remaining_unmapped = list(unmapped)

    if "phone" not in lead_fields:
        for k, v in remaining_unmapped:
            if _looks_like_greek_phone(v):
                lead_fields["phone"] = _clean_phone(v)
                remaining_unmapped = [(ik, iv) for ik, iv in remaining_unmapped if ik != k]
                log.info("[webhook] heuristic: field '%s' detected as phone", k)
                break

    if "name" not in lead_fields:
        for k, v in remaining_unmapped:
            if _looks_like_name(v):
                lead_fields["name"] = v
                remaining_unmapped = [(ik, iv) for ik, iv in remaining_unmapped if ik != k]
                log.info("[webhook] heuristic: field '%s' detected as name", k)
                break

    if "email" not in lead_fields:
        for k, v in remaining_unmapped:
            if "@" in v and "." in v and " " not in v:
                lead_fields["email"] = _clean_email(v)
                remaining_unmapped = [(ik, iv) for ik, iv in remaining_unmapped if ik != k]
                log.info("[webhook] heuristic: field '%s' detected as email", k)
                break

    # Append all still-unmapped fields to notes so nothing is silently lost
    if remaining_unmapped:
        extra = "\n".join(f"[{k}]: {v}" for k, v in remaining_unmapped)
        if lead_fields.get("notes"):
            lead_fields["notes"] += "\n\n" + extra
        else:
            lead_fields["notes"] = extra

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

@router_public.post("/lead/{token}/debug")
async def debug_webhook_lead(token: str, request: Request, db: Session = Depends(get_db)):
    """Dry-run: parse the payload and return what would be mapped, without creating a lead."""
    source = db.query(CMWebhookSource).filter(CMWebhookSource.token == token).first()
    if not source:
        raise HTTPException(status_code=404, detail="Webhook source not found")
    content_type = request.headers.get("content-type", "")
    try:
        if "json" in content_type:
            raw = await request.json()
        else:
            form = await request.form()
            raw = dict(form)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse request body")
    fields = _map_payload(raw, source.field_map, source.program_map, source.default_program, source.default_program_title)
    has_contact = bool(fields.get("name") or fields.get("phone"))
    return {
        "source_name": source.name,
        "content_type": content_type,
        "raw_keys": list(raw.keys()) if isinstance(raw, dict) else [],
        "raw_payload": raw,
        "mapped_fields": fields,
        "would_create": has_contact,
        "skip_reason": None if has_contact else "no_contact_info",
    }


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

    log.info("[webhook] source '%s' received payload (content-type: %s) keys=%s",
             source.name, content_type, list(raw.keys()) if isinstance(raw, dict) else type(raw).__name__)
    log.debug("[webhook] full payload: %s", raw)

    if not isinstance(raw, dict):
        log.warning("[webhook] source '%s' payload is not a dict: %r", source.name, raw)
        raise HTTPException(status_code=400, detail="Expected a JSON object or form fields")

    fields = _map_payload(raw, source.field_map, source.program_map, source.default_program, source.default_program_title)
    log.info("[webhook] source '%s' mapped fields: %s", source.name, {k: v for k, v in fields.items() if v})

    def _write_log(lead_created: bool, lead_id: int | None, skip_reason: str | None):
        try:
            entry = CMWebhookLog(
                source_id=source.id,
                content_type=content_type,
                raw_payload=raw if isinstance(raw, dict) else {"_raw": str(raw)},
                mapped_fields={k: v for k, v in fields.items() if v},
                lead_created=lead_created,
                lead_id=lead_id,
                skip_reason=skip_reason,
            )
            db.add(entry)
            db.flush()
            # Keep only the 20 most recent logs per source
            old_ids = (
                db.query(CMWebhookLog.id)
                .filter(CMWebhookLog.source_id == source.id)
                .order_by(CMWebhookLog.id.desc())
                .offset(20)
                .all()
            )
            if old_ids:
                db.query(CMWebhookLog).filter(CMWebhookLog.id.in_([r.id for r in old_ids])).delete(synchronize_session=False)
            db.commit()
        except Exception as _le:
            log.warning("[webhook] could not write log: %s", _le)
            db.rollback()

    # Require at least a name or a phone
    if not fields.get("name") and not fields.get("phone"):
        log.warning("[webhook] source '%s' payload has neither name nor phone — keys received: %s",
                    source.name, list(raw.keys()) if isinstance(raw, dict) else [])
        _write_log(False, None, "no_contact_info")
        return {"ok": True, "created": False, "reason": "no_contact_info"}

    lead = CMLead(
        name=fields.get("name"),
        phone=fields.get("phone"),
        phone2=fields.get("phone2"),
        email=fields.get("email"),
        afm=fields.get("afm"),
        notes=fields.get("notes"),
        service_type=fields.get("service_type"),
        program=fields.get("program"),
        program_title=fields.get("program_title"),
        status="NEW LEAD",
        source=f"website:{source.name}",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    log.info("[webhook] created lead %d from source '%s'", lead.id, source.name)
    _write_log(True, lead.id, None)
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
        "default_program_title": s.default_program_title,
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
    default_program_title: Optional[str] = None
    field_map: Optional[Dict[str, str]] = None
    program_map: Optional[Dict[str, str]] = None
    enabled: bool = True
    notes: Optional[str] = None


class WebhookSourceUpdate(BaseModel):
    name: Optional[str] = None
    default_program: Optional[str] = None
    default_program_title: Optional[str] = None
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
        default_program_title=payload.default_program_title,
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


@router_admin.get("/{source_id}/logs")
def get_webhook_logs(
    source_id: int,
    _: CMUser = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Return the 20 most recent payload submissions for this webhook source."""
    logs = (
        db.query(CMWebhookLog)
        .filter(CMWebhookLog.source_id == source_id)
        .order_by(CMWebhookLog.id.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": l.id,
            "received_at": l.received_at.isoformat() if l.received_at else None,
            "content_type": l.content_type,
            "raw_payload": l.raw_payload,
            "mapped_fields": l.mapped_fields,
            "lead_created": l.lead_created,
            "lead_id": l.lead_id,
            "skip_reason": l.skip_reason,
        }
        for l in logs
    ]
