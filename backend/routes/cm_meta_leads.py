"""
Meta Lead Ads → Case Management CRM integration.

Public endpoints (no auth — verified by Meta signature / verify_token):
  GET  /api/meta/webhook          — Meta hub verification handshake
  POST /api/meta/webhook          — Receive lead notifications

Admin endpoints (Bearer auth, admin only):
  GET    /api/cm/meta-pages        — List configured pages
  POST   /api/cm/meta-pages        — Add a page config
  PUT    /api/cm/meta-pages/{id}   — Update a page config
  DELETE /api/cm/meta-pages/{id}   — Delete a page config
  GET    /api/cm/meta-leads-log    — Recent incoming lead log
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime
from typing import Optional

import requests as _requests
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user
from database import get_db
from models_cases import CMMetaPageConfig, CMMetaLeadLog, CMLead, CMUser

log = logging.getLogger(__name__)

GRAPH_API = "https://graph.facebook.com/v19.0"

router_public = APIRouter(prefix="/api/meta", tags=["meta-leads"])
router_admin  = APIRouter(prefix="/api/cm/meta-pages", tags=["meta-leads-admin"])
router_log    = APIRouter(prefix="/api/cm/meta-leads-log", tags=["meta-leads-admin"])


# ── Field mapping ─────────────────────────────────────────────────────────────

_META_FIELD_ALIASES = {
    "full_name": "name",
    "first_name": "name",
    "last_name": "name",
    "phone_number": "phone",
    "phone": "phone",
    "email": "email",
    "work_email": "email",
    # Greek custom fields
    "ονομα": "name",
    "ονοματεπωνυμο": "name",
    "κινητο": "phone",
    "τηλεφωνο": "phone",
    "afm": "afm",
    "αφμ": "afm",
}

_PROGRAM_KEYWORDS = {
    "ΜΙΚΡΟ": "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ",
    "ΑΝΑΚΑΙΝ": "ΑΝΑΚΑΙΝΙΖΩ",
    "ΔΥΠΑ": "ΔΥΠΑ",
    "ΟΑΕΔ": "ΔΥΠΑ",
    "ΕΣΠΑ": "ΕΣΠΑ",
}


def _clean_phone(p: str) -> Optional[str]:
    if not p:
        return None
    s = str(p).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if s.startswith("+30"):
        s = s[3:]
    elif s.startswith("0030"):
        s = s[4:]
    return s or None


def _detect_program_from_text(text: str) -> Optional[str]:
    t = text.upper()
    for kw, cat in _PROGRAM_KEYWORDS.items():
        if kw in t:
            return cat
    return None


def _map_lead_fields(field_data: list, ad_name: str = "", campaign_name: str = "") -> dict:
    """Convert Meta field_data list → CMLead field dict."""
    mapped: dict = {}
    for item in field_data:
        key = (item.get("name") or "").lower().strip()
        values = item.get("values") or []
        val = values[0].strip() if values else ""
        if not val:
            continue
        target = _META_FIELD_ALIASES.get(key)
        if target == "phone":
            mapped["phone"] = _clean_phone(val)
        elif target and target not in mapped:
            mapped[target] = val
        # Unknown field → append to notes
        elif not target:
            existing_notes = mapped.get("notes", "")
            label = item.get("name", key)
            mapped["notes"] = (existing_notes + f"\n{label}: {val}").strip() if existing_notes else f"{label}: {val}"

    # Detect program from ad/campaign name
    if "program" not in mapped:
        for src in [ad_name, campaign_name]:
            prog = _detect_program_from_text(src)
            if prog:
                mapped["program"] = prog
                break

    return mapped


# ── Graph API helper ──────────────────────────────────────────────────────────

def _fetch_lead(leadgen_id: str, access_token: str) -> Optional[dict]:
    """Fetch full lead data from Meta Graph API."""
    url = f"{GRAPH_API}/{leadgen_id}"
    try:
        r = _requests.get(url, params={
            "fields": "field_data,created_time,ad_name,adset_name,campaign_name,form_id",
            "access_token": access_token,
        }, timeout=15)
        if r.ok:
            return r.json()
        log.error("[meta] Graph API error for %s: %s %s", leadgen_id, r.status_code, r.text[:300])
    except Exception as exc:
        log.exception("[meta] Graph API fetch failed for %s: %s", leadgen_id, exc)
    return None


# ── Signature verification ────────────────────────────────────────────────────

def _verify_signature(body: bytes, signature_header: str, app_secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header[7:])


# ── Public webhook endpoints ──────────────────────────────────────────────────

@router_public.get("/webhook")
def meta_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    db: Session = Depends(get_db),
):
    """Meta hub verification — responds with hub.challenge when verify_token matches."""
    if hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")
    # Accept if any configured page has this verify_token
    cfg = db.query(CMMetaPageConfig).filter(
        CMMetaPageConfig.verify_token == hub_verify_token,
        CMMetaPageConfig.enabled == True,
    ).first()
    if not cfg:
        log.warning("[meta] Webhook verification failed — no matching verify_token")
        raise HTTPException(status_code=403, detail="Invalid verify_token")
    log.info("[meta] Webhook verified for page %s", cfg.page_id)
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(hub_challenge or "")


@router_public.post("/webhook")
async def meta_webhook_receive(request: Request, db: Session = Depends(get_db)):
    """Receive Meta lead notifications and create CMLead records."""
    body = await request.body()
    app_secret = os.getenv("META_APP_SECRET", "")

    # Signature check (skip if app_secret not configured — warn but continue)
    sig = request.headers.get("X-Hub-Signature-256", "")
    if app_secret and not _verify_signature(body, sig, app_secret):
        log.warning("[meta] Signature verification failed — rejecting payload")
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if payload.get("object") != "page":
        return {"ok": True, "skipped": "not a page event"}

    created_leads = []
    for entry in payload.get("entry", []):
        page_id = str(entry.get("id", ""))
        cfg = db.query(CMMetaPageConfig).filter(
            CMMetaPageConfig.page_id == page_id,
            CMMetaPageConfig.enabled == True,
        ).first()
        if not cfg:
            log.warning("[meta] No config for page_id=%s — ignoring", page_id)
            continue

        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue
            val = change.get("value", {})
            leadgen_id = str(val.get("leadgen_id", ""))
            form_id = str(val.get("form_id", ""))
            ad_name = val.get("ad_name", "") or ""
            campaign_name = val.get("campaign_name", "") or ""

            if not leadgen_id:
                continue

            # Idempotency — skip if we already processed this leadgen_id
            existing_log = db.query(CMMetaLeadLog).filter(
                CMMetaLeadLog.leadgen_id == leadgen_id
            ).first()
            if existing_log:
                log.info("[meta] leadgen_id=%s already processed — skipping", leadgen_id)
                continue

            # Fetch full lead data
            lead_data = _fetch_lead(leadgen_id, cfg.page_access_token)
            status, error, lead_id = "ok", None, None

            if not lead_data:
                status, error = "fetch_error", "Could not fetch from Graph API"
            else:
                field_data = lead_data.get("field_data", [])
                fields = _map_lead_fields(
                    field_data,
                    ad_name=ad_name or lead_data.get("ad_name", ""),
                    campaign_name=campaign_name or lead_data.get("campaign_name", ""),
                )

                # Merge with page-level defaults
                if not fields.get("program") and cfg.default_program:
                    fields["program"] = cfg.default_program
                if not fields.get("program_title") and cfg.default_program_title:
                    fields["program_title"] = cfg.default_program_title

                name = fields.get("name") or fields.get("email") or f"Meta Lead #{leadgen_id[-6:]}"
                phone = fields.get("phone")

                if name or phone:
                    lead = CMLead(
                        name=name,
                        phone=phone,
                        email=fields.get("email"),
                        afm=fields.get("afm"),
                        program=fields.get("program"),
                        program_title=fields.get("program_title"),
                        notes=fields.get("notes"),
                        source="Meta Ads",
                        status="NEW LEAD",
                        assigned_agent_id=cfg.assigned_agent_id,
                        assigned_name=cfg.assigned_agent.full_name if cfg.assigned_agent else None,
                    )
                    db.add(lead)
                    db.flush()
                    lead_id = lead.id
                    log.info("[meta] Created lead id=%s for leadgen_id=%s (page=%s)", lead_id, leadgen_id, page_id)
                    created_leads.append(lead_id)
                else:
                    status, error = "no_contact", "No name or phone in lead data"

            db.add(CMMetaLeadLog(
                page_id=page_id,
                form_id=form_id,
                leadgen_id=leadgen_id,
                ad_name=ad_name,
                campaign_name=campaign_name,
                raw_payload=val,
                field_data=lead_data.get("field_data") if lead_data else None,
                lead_id=lead_id,
                status=status,
                error=error,
            ))
            db.commit()

    return {"ok": True, "leads_created": len(created_leads), "lead_ids": created_leads}


# ── Admin — page config CRUD ──────────────────────────────────────────────────

class PageConfigIn(BaseModel):
    page_id: str
    page_name: Optional[str] = None
    page_access_token: str
    verify_token: str
    default_program: Optional[str] = None
    default_program_title: Optional[str] = None
    assigned_agent_id: Optional[int] = None
    enabled: bool = True


@router_admin.get("")
def list_meta_pages(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
    cfgs = db.query(CMMetaPageConfig).order_by(CMMetaPageConfig.id).all()
    return [_cfg_to_dict(c) for c in cfgs]


@router_admin.post("")
def create_meta_page(
    body: PageConfigIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
    cfg = CMMetaPageConfig(**body.dict())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return _cfg_to_dict(cfg)


@router_admin.put("/{cfg_id}")
def update_meta_page(
    cfg_id: int,
    body: PageConfigIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
    cfg = db.query(CMMetaPageConfig).filter(CMMetaPageConfig.id == cfg_id).first()
    if not cfg:
        raise HTTPException(status_code=404)
    for k, v in body.dict().items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return _cfg_to_dict(cfg)


@router_admin.delete("/{cfg_id}")
def delete_meta_page(
    cfg_id: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
    cfg = db.query(CMMetaPageConfig).filter(CMMetaPageConfig.id == cfg_id).first()
    if not cfg:
        raise HTTPException(status_code=404)
    db.delete(cfg)
    db.commit()
    return {"ok": True}


@router_log.get("")
def get_meta_lead_log(
    limit: int = 50,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
    rows = db.query(CMMetaLeadLog).order_by(CMMetaLeadLog.id.desc()).limit(limit).all()
    return [_log_to_dict(r) for r in rows]


def _cfg_to_dict(c: CMMetaPageConfig) -> dict:
    return {
        "id": c.id,
        "page_id": c.page_id,
        "page_name": c.page_name,
        "page_access_token": "****" + (c.page_access_token or "")[-6:],
        "verify_token": c.verify_token,
        "default_program": c.default_program,
        "default_program_title": c.default_program_title,
        "assigned_agent_id": c.assigned_agent_id,
        "enabled": c.enabled,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _log_to_dict(r: CMMetaLeadLog) -> dict:
    return {
        "id": r.id,
        "page_id": r.page_id,
        "form_id": r.form_id,
        "leadgen_id": r.leadgen_id,
        "ad_name": r.ad_name,
        "campaign_name": r.campaign_name,
        "lead_id": r.lead_id,
        "status": r.status,
        "error": r.error,
        "field_data": r.field_data,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
