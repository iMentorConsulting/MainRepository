import logging
import uuid
import os
import shutil
from urllib.parse import quote as _url_quote
from datetime import datetime, date as _date

_log = logging.getLogger(__name__)
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from database import get_db, fmt_dt
from models_cases import CMCase, CMCasePendingItem, CMMessage, CMBudgetCategory, CMDocument, CMCaseStatusHistory, CMPortalFile, CMCaseModification
from auth_cases import get_current_user

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "portal_uploads")

router = APIRouter(prefix="/api/cm/portal", tags=["portal"])


def _content_disposition(filename: str) -> str:
    """Return a Content-Disposition header value that handles non-ASCII filenames
    (RFC 5987: filename*=UTF-8''<percent-encoded>)."""
    safe_ascii = filename.encode("ascii", errors="replace").decode("ascii")
    encoded = _url_quote(filename, safe="")
    return f"attachment; filename=\"{safe_ascii}\"; filename*=UTF-8''{encoded}"


def _get_pipeline(program_category: str, db: Session) -> dict:
    try:
        from routes.cm_pipeline import get_pipeline_config
        return get_pipeline_config(program_category, db)
    except Exception:
        from pipelines import PIPELINES
        return PIPELINES.get(program_category, {})


def _get_current_phase_id(status: str, program_category: str, db: Session) -> str | None:
    pipeline = _get_pipeline(program_category, db)
    for phase in pipeline.get("phases", []):
        if status in phase["statuses"]:
            return phase["id"]
    return None


def _get_next_status(status: str, program_category: str, db: Session) -> str | None:
    pipeline = _get_pipeline(program_category, db)
    all_statuses = []
    for phase in pipeline.get("phases", []):
        all_statuses.extend(phase["statuses"])
    try:
        idx = all_statuses.index(status)
        if idx + 1 < len(all_statuses):
            return all_statuses[idx + 1]
    except ValueError:
        pass
    return None


def _get_full_status_list(program_category: str, db: Session) -> list[dict]:
    pipeline = _get_pipeline(program_category, db)
    result = []
    for phase in pipeline.get("phases", []):
        for s in phase["statuses"]:
            result.append({"status": s, "phase_id": phase["id"], "phase_label": phase["label"], "color": phase["color"]})
    return result


def _build_portal_data(case: CMCase, db: Session) -> dict:
    prog = case.program_category or "ΕΣΠΑ"
    pipeline = _get_pipeline(prog, db)
    phases = [
        {"id": p["id"], "label": p["label"], "color": p["color"]}
        for p in pipeline.get("phases", [])
    ]
    current_phase_id = _get_current_phase_id(case.status or "", prog, db)
    next_status = _get_next_status(case.status or "", prog, db)
    full_status_list = _get_full_status_list(prog, db)

    # Progress percent: position of current status in full list
    progress_percent = 0
    if full_status_list:
        idx = next((i for i, s in enumerate(full_status_list) if s["status"] == case.status), None)
        if idx is not None:
            progress_percent = round((idx + 1) / len(full_status_list) * 100)

    # Status descriptions from pipeline config
    try:
        import json as _json
        from models_cases import CMPipelineConfig as _PCfg
        row = db.query(_PCfg).filter(_PCfg.program_category == prog).first()
        status_descriptions = _json.loads(row.status_descriptions_json or "{}") if row else {}
    except Exception:
        status_descriptions = {}


    pending_items = [
        {"id": pi.id, "item_text": pi.item_text, "comment": pi.comment}
        for pi in (case.pending_items or [])
    ]

    all_external = sorted(
        [m for m in (case.messages or []) if not m.is_internal],
        key=lambda m: m.created_at,
    )
    messages_out = [
        {
            "id": m.id,
            "content": m.content,
            "created_at": fmt_dt(m.created_at),
            "author": m.user.full_name if m.user else (m.author_name or "iMentor"),
            "sent_by_client": bool(m.sent_by_client),
        }
        for m in all_external[-20:]
    ]

    # Status history
    history_out = [
        {
            "from_status": h.from_status,
            "to_status": h.to_status,
            "changed_at": fmt_dt(h.changed_at),
        }
        for h in (case.status_history or [])
    ]


    # Client-uploaded documents
    client_docs = [
        {
            "id": d.id,
            "name": d.name,
            "file_url": d.file_url,
            "status": d.status,
            "created_at": fmt_dt(d.created_at),
        }
        for d in (case.documents or []) if d.uploaded_by_client
    ]

    # Budget breakdown
    budget_categories = []
    for b in (case.budget_categories or []):
        total_certified = (b.certified_request1 or 0) + (b.certified_request2 or 0) + (b.certified_final or 0)
        budget_categories.append({
            "category_name": b.category_name,
            "approved_amount": b.approved_amount or 0,
            "certified_request1": b.certified_request1 or 0,
            "certified_request2": b.certified_request2 or 0,
            "certified_final": b.certified_final or 0,
            "total_certified": total_certified,
            "remaining": (b.approved_amount or 0) - total_certified,
        })

    agreed_application = case.agreed_fee_application or 0
    agreed_implementation = case.agreed_fee_implementation or 0
    total_agreed = agreed_application + agreed_implementation
    total_paid = case.total_paid or 0
    balance = total_agreed - total_paid

    response = {
        "case_id": case.id,
        "client_name": case.client_name,
        "service_type": case.service_type,
        "program_category": prog,
        "status": case.status,
        "project_deadline": case.project_deadline.isoformat() if case.project_deadline else None,
        "approved_budget": case.approved_budget,
        "subsidy_percent": case.subsidy_percent,
        "approval_date": case.approval_date.isoformat() if case.approval_date else None,
        "dypa_start_date": case.dypa_start_date.isoformat() if case.dypa_start_date else None,
        "assigned_agent_name": case.assigned_agent.full_name if case.assigned_agent else None,
        "pending_items": pending_items,
        "messages": messages_out,
        "status_history": history_out,
        "status_descriptions": status_descriptions,
        "progress_percent": progress_percent,
        "client_documents": client_docs,
        "pipeline_phases": phases,
        "current_phase_id": current_phase_id,
        "next_status": next_status,
        "full_status_list": full_status_list,
        "budget_categories": budget_categories,
        "agreed_fee_application": agreed_application,
        "agreed_fee_implementation": agreed_implementation,
        "total_agreed": total_agreed,
        "total_paid": total_paid,
        "balance": balance,
        "portal_visit_count": case.portal_visit_count or 0,
        "modifications": [
            {
                "id": m.id,
                "modification_date": m.modification_date.isoformat() if m.modification_date else None,
                "title": m.title,
                "justification": m.justification,
                "approval_date": m.approval_date.isoformat() if m.approval_date else None,
            }
            for m in sorted(case.modifications or [], key=lambda x: x.modification_date or _date.min)
        ],
        "portal_files": _get_portal_files_for_case(case, db),
    }

    # ΑΝΑΚΑΙΝΙΖΩ extra data
    if prog == "ΑΝΑΚΑΙΝΙΖΩ":
        import json as _json
        from models_cases import CMCaseAnakainizw
        _ENERGY_KEYS = frozenset({
            'energy_insulation', 'energy_windows', 'energy_hvac',
            'energy_solar', 'energy_pv', 'energy_other',
        })
        ana = db.query(CMCaseAnakainizw).filter(CMCaseAnakainizw.case_id == case.id).first()
        if ana:
            items = _json.loads(ana.budget_items) if getattr(ana, 'budget_items', None) else {}
            if items:
                energy_total = sum(float(v) for k, v in items.items() if k in _ENERGY_KEYS)
                general_total = sum(float(v) for k, v in items.items() if k not in _ENERGY_KEYS)
            else:
                energy_total = ana.energy_works_budget or 0
                general_total = ana.general_works_budget or 0
            total = energy_total + general_total
            energy_pct = round((energy_total / total) * 100) if total > 0 else 0
            ht = (ana.household_type or "").lower()
            base_income = 25000 if ht == "άγαμος" else 35000
            income_limit = min(base_income + (ana.num_children or 0) * 5000, 45000)
            actual_income = getattr(ana, 'actual_income', None)
            doc_extras_raw = getattr(ana, 'doc_extras', None)
            doc_extras = _json.loads(doc_extras_raw) if doc_extras_raw else {}
            advisor_checks_raw = getattr(ana, 'advisor_checks', None)
            advisor_checks = _json.loads(advisor_checks_raw) if advisor_checks_raw else {}
            response["anakainizw"] = {
                "property_sqm": ana.property_sqm,
                "property_prefecture": ana.property_prefecture,
                "property_address": ana.property_address,
                "property_type": ana.property_type,
                "property_age": ana.property_age,
                "property_usage": ana.property_usage,
                "renovation_works": ana.renovation_works,
                "legality": ana.legality,
                "cooperating_engineer": ana.cooperating_engineer,
                "subsidy_percent": ana.subsidy_percent,
                "energy_works_budget": energy_total,
                "general_works_budget": general_total,
                "total_works_budget": total,
                "max_budget": min((ana.property_sqm or 0) * 300, 36000) if ana.property_sqm else 0,
                "energy_pct": energy_pct,
                "energy_ok": energy_pct >= 20,
                "budget_items": items,
                "household_type": ana.household_type,
                "num_children": ana.num_children,
                "income_limit": income_limit,
                "actual_income": actual_income,
                "income_eligible": (actual_income <= income_limit) if actual_income is not None else None,
                "is_single_parent": ana.is_single_parent,
                "is_three_children": ana.is_three_children,
                "boost_island": ana.boost_island,
                "boost_single_parent": ana.boost_single_parent,
                "boost_three_children": ana.boost_three_children,
                "boost_large_family": ana.boost_large_family,
                "boost_youth": ana.boost_youth,
                "doc_title_deed": ana.doc_title_deed,
                "doc_e9": ana.doc_e9,
                "doc_permit": ana.doc_permit,
                "doc_legalization": ana.doc_legalization,
                "doc_plans": ana.doc_plans,
                "doc_e1": ana.doc_e1,
                "doc_tax_clearance": ana.doc_tax_clearance,
                "doc_e2": ana.doc_e2,
                "doc_extras": doc_extras,
                "advisor_checks": advisor_checks,
                "inspection_fee_paid": ana.inspection_fee_paid,
                "client_intake_submitted_at": getattr(ana, 'client_intake_submitted_at', None),
                "client_intake_data": _json.loads(ana.client_intake_data) if getattr(ana, 'client_intake_data', None) else None,
            }
        else:
            response["anakainizw"] = None

    return response


def _get_portal_files_for_case(case: CMCase, db: Session) -> list:
    if not case.service_type:
        return []
    files = (
        db.query(CMPortalFile)
        .filter(CMPortalFile.service_type == case.service_type)
        .order_by(CMPortalFile.uploaded_at)
        .all()
    )
    return [
        {
            "id": f.id,
            "original_filename": f.original_filename,
            "mime_type": f.mime_type,
            "file_type": "PDF" if f.mime_type == "application/pdf" else "Word",
            "client_description": f.client_description,
            "client_instructions": f.client_instructions,
            "uploaded_at": fmt_dt(f.uploaded_at),
        }
        for f in files
    ]


@router.get("/public/{token}")
def get_portal(token: str, db: Session = Depends(get_db)):
    """Return portal data without incrementing visit count."""
    from models_cases import CMCaseStatusHistory
    case = (
        db.query(CMCase)
        .options(
            joinedload(CMCase.assigned_agent),
            joinedload(CMCase.pending_items),
            joinedload(CMCase.messages).joinedload(CMMessage.user),
            joinedload(CMCase.budget_categories),
            joinedload(CMCase.documents),
            joinedload(CMCase.status_history),
            joinedload(CMCase.modifications),
        )
        .filter(CMCase.share_token == token)
        .first()
    )
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    return _build_portal_data(case, db)


@router.post("/public/{token}/nps")
def record_nps(token: str, body: dict, db: Session = Depends(get_db)):
    """Record NPS score from client (no auth required)."""
    from datetime import datetime
    score = body.get("score")
    if score is None or not (0 <= int(score) <= 10):
        raise HTTPException(status_code=400, detail="Invalid score")
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")
    case.portal_nps_score = int(score)
    case.portal_nps_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/public/{token}/review-click")
def record_review_click(token: str, db: Session = Depends(get_db)):
    """Record that client clicked the Google review link."""
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")
    case.portal_review_clicked = True
    db.commit()
    return {"ok": True}


@router.post("/public/{token}/message")
def client_send_message(token: str, body: dict, db: Session = Depends(get_db)):
    """Client submits a message/question from the portal."""
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Κενό μήνυμα")

    from datetime import datetime
    msg = CMMessage(
        case_id=case.id,
        content=content,
        is_internal=False,
        sent_by_client=True,
        author_name=case.client_name or "Πελάτης",
    )
    db.add(msg)
    db.commit()

    # Notify assigned agent by email if available
    if case.assigned_agent and case.assigned_agent.email:
        try:
            from routes.cm_notifications import _send_email
            _send_email(
                case.assigned_agent.email,
                f"Νέο μήνυμα από πελάτη — {case.client_name}",
                f"Ο πελάτης {case.client_name} έστειλε μήνυμα:\n\n{content}\n\nΥπόθεση: {case.service_type or ''}",
            )
        except Exception:
            pass

    return {"ok": True}



@router.get("/public/{token}/files/{file_id}/download")
def download_portal_file_public(token: str, file_id: int, db: Session = Depends(get_db)):
    """Public download of a portal file via share token."""
    from fastapi.responses import Response as _Resp
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Not found")
    # File is shared per service_type — verify the token's case has matching service_type
    pf = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not pf or pf.service_type != case.service_type:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    content = None
    if pf.drive_file_id:
        try:
            from drive_storage import download_file as _drive_dl
            content = _drive_dl(pf.drive_file_id)
        except Exception:
            pass
    if content is None and pf.file_data:
        content = bytes(pf.file_data)
    if content is None:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return _Resp(
        content=content,
        media_type=pf.mime_type,
        headers={"Content-Disposition": _content_disposition(pf.original_filename)},
    )


@router.put("/public/{token}/anakainizw-intake")
def submit_anakainizw_intake(token: str, body: dict, db: Session = Depends(get_db)):
    """Client submits property + household intake form from ΑΝΑΚΑΙΝΙΖΩ portal."""
    import json as _json
    from datetime import datetime as _dt
    from models_cases import CMCaseAnakainizw

    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")
    if case.program_category != "ΑΝΑΚΑΙΝΙΖΩ":
        raise HTTPException(status_code=400, detail="Not an ΑΝΑΚΑΙΝΙΖΩ case")

    ana = db.query(CMCaseAnakainizw).filter(CMCaseAnakainizw.case_id == case.id).first()
    if not ana:
        raise HTTPException(status_code=404, detail="ΑΝΑΚΑΙΝΙΖΩ data not found")

    allowed_fields = {
        "property_sqm", "property_prefecture", "property_address",
        "property_type", "property_age", "property_usage",
        "renovation_works", "legality",
        "household_type", "num_children", "actual_income",
        "boost_island", "boost_single_parent", "boost_three_children",
        "boost_large_family", "boost_youth", "boost_disability",
    }
    boost_fields = {
        "boost_island", "boost_single_parent", "boost_three_children",
        "boost_large_family", "boost_youth", "boost_disability",
    }
    for field, value in body.items():
        if field in allowed_fields:
            if field == "property_sqm":
                try:
                    setattr(ana, field, float(value) if value not in (None, "") else None)
                except (TypeError, ValueError):
                    pass
            elif field in ("num_children",):
                try:
                    setattr(ana, field, int(value) if value not in (None, "") else 0)
                except (TypeError, ValueError):
                    pass
            elif field == "actual_income":
                try:
                    setattr(ana, field, float(value) if value not in (None, "") else None)
                except (TypeError, ValueError):
                    pass
            elif field in boost_fields:
                setattr(ana, field, bool(value))
            else:
                setattr(ana, field, value)

    # Recalculate subsidy_percent: base 70% + 5% per active boost flag
    active_boosts = sum(1 for f in boost_fields if getattr(ana, f, False))
    ana.subsidy_percent = 70 + active_boosts * 5

    now_str = _dt.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    ana.client_intake_submitted_at = now_str
    ana.client_intake_data = _json.dumps(body, ensure_ascii=False)
    ana.updated_at = _dt.utcnow()
    db.commit()

    # Notify office + assigned agent
    _subj = f"Νέα Φόρμα Στοιχείων ΑΝΑΚΑΙΝΙΖΩ — {case.client_name}"
    _body = f"Ο πελάτης {case.client_name} υπέβαλε τη φόρμα επιβεβαίωσης στοιχείων.\n\nΥπόθεση: {case.service_type or ''}"
    try:
        from routes.cm_notifications import _send_email
        _send_email("info@i-mentor.gr", _subj, _body)
        _agent_email = case.assigned_agent.email if case.assigned_agent else None
        if _agent_email and _agent_email != "info@i-mentor.gr":
            _send_email(_agent_email, _subj, _body)
    except Exception:
        pass

    return {"ok": True, "submitted_at": now_str}


@router.get("/public/{token}/related-cases")
def get_related_cases(token: str, db: Session = Depends(get_db)):
    """Return other portal-active cases for the same client (matched by AFM and/or phone)."""
    import re as _re

    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Not found")

    def norm_phone(p):
        p = _re.sub(r'\D', '', p or '')
        if p.startswith('30') and len(p) > 10:
            p = p[2:]
        return p

    def effective_phone(c):
        """Phone from case.phone field, or from share_token if it's digits-only (legacy ΑΝΑΚΑΙΝΙΖΩ)."""
        p = norm_phone(c.phone)
        if p:
            return p
        tok = c.share_token or ''
        if tok.isdigit() and 8 <= len(tok) <= 12:
            return tok
        return ''

    case_afm = (case.afm or "").strip()
    case_phone = effective_phone(case)

    print(f"[related-cases] token={token} case_id={case.id} afm={case.afm!r} phone={case.phone!r} share_token={case.share_token!r} → case_afm={case_afm!r} case_phone={case_phone!r}", flush=True)

    if not case_afm and not case_phone:
        print("[related-cases] no afm/phone to match on, returning []", flush=True)
        return []

    related = []
    seen_ids: set = set()

    # Match by AFM (DB-level, case-sensitive exact match on trimmed value)
    if case_afm:
        afm_matches = db.query(CMCase).filter(
            CMCase.afm == case_afm,
            CMCase.portal_active == True,
            CMCase.id != case.id,
        ).all()
        print(f"[related-cases] AFM query for {case_afm!r} → {len(afm_matches)} results", flush=True)
        for c in afm_matches:
            if c.id not in seen_ids:
                related.append(c)
                seen_ids.add(c.id)

    # Match by phone (covers ΑΝΑΚΑΙΝΙΖΩ without AFM, or cases where AFM wasn't filled)
    if case_phone:
        candidates = db.query(CMCase).filter(
            CMCase.portal_active == True,
            CMCase.id != case.id,
        ).all()
        print(f"[related-cases] phone query for {case_phone!r} → {len(candidates)} portal-active candidates", flush=True)
        for c in candidates:
            ep = effective_phone(c)
            print(f"[related-cases]   candidate id={c.id} phone={c.phone!r} share_token={c.share_token!r} → ep={ep!r} match={ep == case_phone and c.id not in seen_ids}", flush=True)
            if c.id not in seen_ids and ep == case_phone:
                related.append(c)
                seen_ids.add(c.id)

    print(f"[related-cases] final related: {[c.id for c in related]}", flush=True)
    return [
        {
            "token": c.share_token,
            "program_category": c.program_category,
            "service_type": c.service_type or "",
        }
        for c in related if c.share_token
    ]


@router.get("/public/{token}/related-cases-diag")
def related_cases_diag(token: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Admin-only: returns full diagnostic info for the related-cases matching of a given portal token."""
    import re as _re

    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case:
        return {"error": "case not found for token"}

    def norm_phone(p):
        p = _re.sub(r'\D', '', p or '')
        if p.startswith('30') and len(p) > 10:
            p = p[2:]
        return p

    def effective_phone(c):
        p = norm_phone(c.phone)
        if p:
            return p
        tok = c.share_token or ''
        if tok.isdigit() and 8 <= len(tok) <= 12:
            return tok
        return ''

    case_afm = (case.afm or "").strip()
    case_phone = effective_phone(case)

    all_active = db.query(CMCase).filter(
        CMCase.portal_active == True,
        CMCase.id != case.id,
    ).all()

    candidates_info = []
    for c in all_active:
        ep = effective_phone(c)
        candidates_info.append({
            "id": c.id,
            "client_name": c.client_name,
            "afm": c.afm,
            "phone": c.phone,
            "share_token_prefix": (c.share_token or '')[:12],
            "effective_phone": ep,
            "afm_match": bool(case_afm and (c.afm or "").strip() == case_afm),
            "phone_match": bool(case_phone and ep == case_phone),
        })

    afm_matches = [x for x in candidates_info if x["afm_match"]]
    phone_matches = [x for x in candidates_info if x["phone_match"] and not x["afm_match"]]

    return {
        "case": {
            "id": case.id,
            "client_name": case.client_name,
            "afm": case.afm,
            "phone": case.phone,
            "share_token": case.share_token,
            "portal_active": case.portal_active,
            "program_category": case.program_category,
        },
        "computed": {
            "case_afm": case_afm,
            "case_phone": case_phone,
            "would_return_early": not case_afm and not case_phone,
        },
        "afm_matches": afm_matches,
        "phone_matches": phone_matches,
        "total_portal_active_candidates": len(all_active),
    }


@router.post("/public/lookup")
def portal_lookup(body: dict, db: Session = Depends(get_db)):
    """Find active portal cases by AFM or phone number."""
    import re as _re
    credential = (body.get("credential") or "").strip().replace(" ", "")
    if not credential:
        raise HTTPException(status_code=400, detail="Απαιτείται στοιχείο αναγνώρισης")

    # Normalize as phone
    norm_phone = _re.sub(r'\D', '', credential)
    if norm_phone.startswith('30') and len(norm_phone) > 10:
        norm_phone = norm_phone[2:]

    is_afm = len(credential) == 9 and credential.isdigit()

    # Search by AFM first
    cases = []
    if is_afm:
        cases = db.query(CMCase).filter(
            CMCase.afm == credential,
            CMCase.portal_active == True,
        ).all()

    # If no AFM match (or not AFM format), try phone
    if not cases:
        phone_cases = db.query(CMCase).filter(CMCase.portal_active == True).filter(
            CMCase.phone.isnot(None)
        ).all()
        for c in phone_cases:
            p = _re.sub(r'\D', '', c.phone or '')
            if p.startswith('30') and len(p) > 10:
                p = p[2:]
            if p and p == norm_phone:
                cases.append(c)

    if not cases:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκαν ενεργές υποθέσεις με αυτά τα στοιχεία")

    return [
        {
            "token": c.share_token,
            "client_name": c.client_name,
            "program_category": c.program_category,
            "service_type": c.service_type or "",
            "status": c.status or "",
        }
        for c in cases if c.share_token
    ]


@router.post("/public/{token}/visit")
def record_visit(token: str, body: dict, db: Session = Depends(get_db)):
    """Verify client AFM (or phone for ΑΝΑΚΑΙΝΙΖΩ) and increment visit counter."""
    import re as _re
    credential = (body.get("afm") or "").strip()
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found or inactive")

    # For ΑΝΑΚΑΙΝΙΖΩ cases without AFM: verify entered phone
    if case.program_category == "ΑΝΑΚΑΙΝΙΖΩ" and not (case.afm or "").strip():
        def _norm(p):
            p = _re.sub(r'\D', '', p or '')
            if p.startswith('30') and len(p) > 10:
                p = p[2:]
            return p
        normalized_cred = _norm(credential)
        # Use case.phone if stored; legacy cases have phone encoded as share_token (digits-only token)
        stored_phone = _norm(case.phone or '')
        expected = stored_phone if stored_phone else token
        if not normalized_cred or normalized_cred != expected:
            raise HTTPException(status_code=403, detail="Λάθος τηλέφωνο")
    else:
        if not credential or (case.afm or "").strip() != credential:
            raise HTTPException(status_code=403, detail="Λάθος ΑΦΜ")

    from datetime import datetime
    case.portal_visit_count = (case.portal_visit_count or 0) + 1
    case.portal_last_visit_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{case_id}/toggle")
def toggle_portal(case_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not case.share_token:
        case.share_token = str(uuid.uuid4())

    case.portal_active = not case.portal_active
    db.commit()
    db.refresh(case)
    return {"portal_active": case.portal_active, "share_token": case.share_token}


@router.post("/{case_id}/regenerate-token")
def regenerate_token(case_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case.share_token = str(uuid.uuid4())
    db.commit()
    db.refresh(case)
    return {"share_token": case.share_token}


def _normalize_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if p.startswith("0"):
        return "30" + p[1:]
    if p.startswith("+"):
        return p[1:]
    if not p.startswith("30"):
        return "30" + p
    return p


@router.post("/activate-all")
def activate_all_portals(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Activate portals for ALL cases that don't have one yet, without any notifications."""
    cases = db.query(CMCase).all()
    activated = 0
    for case in cases:
        if not case.share_token:
            case.share_token = str(uuid.uuid4())
        if not case.portal_active:
            case.portal_active = True
            activated += 1
    db.commit()
    return {"total": len(cases), "activated": activated}


@router.post("/bulk-activate-notify")
def bulk_activate_notify(body: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Activate portals and send Viber/email notifications for selected cases."""
    from routes.cm_notifications import _send_email, _send_viber, _log_notification

    case_ids = body.get("case_ids", [])
    portal_base_url = (body.get("portal_base_url") or "").rstrip("/")
    message_template = body.get("message_template", "")
    activate = body.get("activate", True)
    notify = body.get("notify", True)
    notification_type = body.get("notification_type", "viber")  # viber | email | both

    results = []

    for case_id in case_ids:
        case = db.query(CMCase).filter(CMCase.id == case_id).first()
        if not case:
            results.append({"case_id": case_id, "ok": False, "error": "not found"})
            continue

        if activate:
            if not case.share_token:
                case.share_token = str(uuid.uuid4())
            case.portal_active = True
            db.commit()
            db.refresh(case)

        portal_url = f"{portal_base_url}/portal/{case.share_token}" if case.share_token else ""
        msg = (message_template
               .replace("{client_name}", case.client_name or "")
               .replace("{portal_url}", portal_url)
               .replace("{service_type}", case.service_type or ""))

        notified = False
        error_parts = []

        if notify:
            send_viber = notification_type in ("viber", "both")
            send_email = notification_type in ("email", "both")

            if send_viber:
                phone = (case.phone or "").strip()
                if phone:
                    ok, err = _send_viber(phone, msg, case.client_name or "", current_user.full_name, case.service_type or "")
                    if ok:
                        notified = True
                        case.portal_notified_at = datetime.utcnow()
                        _log_notification(db, case.id, "viber", case.client_name, phone,
                                          "Ενεργοποίηση Πύλης Πελάτη", msg, "sent", current_user.full_name)
                    else:
                        error_parts.append(f"Viber: {err[:100]}")
                else:
                    error_parts.append("no phone")

            if send_email:
                email_addr = (case.email or "").strip()
                if email_addr:
                    subject = f"Ενεργοποίηση Πύλης Πελάτη - {case.client_name or ''}"
                    ok, err = _send_email(email_addr, subject, msg)
                    if ok:
                        notified = True
                        case.portal_notified_at = datetime.utcnow()
                        _log_notification(db, case.id, "email", case.client_name, email_addr,
                                          subject, msg, "sent", current_user.full_name)
                    else:
                        error_parts.append(f"Email: {err or 'failed'}")
                else:
                    error_parts.append("no email")

        results.append({
            "case_id": case_id,
            "client_name": case.client_name,
            "phone": case.phone,
            "email": case.email,
            "portal_url": portal_url,
            "notified": notified,
            "error": "; ".join(error_parts),
        })

    db.commit()
    return {
        "results": results,
        "activated": sum(1 for r in results if r.get("portal_url")),
        "notified": sum(1 for r in results if r.get("notified")),
    }


@router.post("/public/{token}/message")
def client_send_message(token: str, body: dict, db: Session = Depends(get_db)):
    """Client sends a message from the portal (no auth required)."""
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Κενό μήνυμα")
    case = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")

    msg = CMMessage(
        case_id=case.id,
        content=content,
        is_internal=False,
        author_name=case.client_name or "Πελάτης",
        sent_by_client=True,
    )
    db.add(msg)
    db.commit()

    # Notify assigned agent by email
    agent_email = case.assigned_agent.email if case.assigned_agent else None
    if agent_email:
        try:
            from routes.cm_notifications import _send_email
            subject = f"Νέο μήνυμα από πελάτη: {case.client_name}"
            body_text = (
                f"Ο πελάτης {case.client_name} έστειλε μήνυμα μέσω του portal:\n\n"
                f"{content}\n\n"
                f"Υπόθεση: {case.service_type or ''} | {case.program_category or ''}"
            )
            _send_email(agent_email, subject, body_text)
        except Exception:
            pass

    return {"ok": True}


@router.post("/public/{token}/upload")
async def client_upload_file(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Client uploads a file from the portal — stored as binary in DB."""
    case = db.query(CMCase).options(joinedload(CMCase.assigned_agent)).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Portal not found")

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 20MB")

    # Try to upload to Google Drive; fall back to DB storage on any failure.
    drive_id = None
    file_data_db = None
    try:
        from drive_storage import upload_case_document
        drive_id = upload_case_document(
            content=data,
            filename=file.filename or "upload",
            mime_type=file.content_type or "application/octet-stream",
            program_category=case.program_category or "Άλλο",
            case_id=case.id,
            client_name=case.client_name or "Πελάτης",
        )
    except Exception as _exc:
        _log.warning("Drive upload failed for case %s (%s) — falling back to DB: %s", case.id, file.filename, _exc)
        file_data_db = data

    # Use raw SQL so the BYTEA column is always stored (ORM deferred columns
    # can silently skip binary data in INSERT on some SQLAlchemy versions).
    from sqlalchemy import text as _sqlt
    db.execute(_sqlt("""
        INSERT INTO cm_documents
            (case_id, name, document_type, status, uploaded_by,
             uploaded_by_client, file_data, mime_type, drive_file_id, created_at)
        VALUES
            (:case_id, :name, 'client_upload', 'pending', :uploaded_by,
             TRUE, :file_data, :mime_type, :drive_file_id, NOW())
    """), {
        "case_id": case.id,
        "name": file.filename or "upload",
        "uploaded_by": case.client_name or "Πελάτης",
        "file_data": file_data_db,
        "mime_type": file.content_type or "application/octet-stream",
        "drive_file_id": drive_id,
    })
    db.commit()

    # Notify office + assigned agent
    subject = f"Νέο αρχείο από πελάτη: {case.client_name}"
    body = f"Ο πελάτης {case.client_name} ανέβασε αρχείο: {file.filename}\n\nΥπόθεση: {case.service_type or ''}"
    try:
        from routes.cm_notifications import _send_email
        _send_email("info@i-mentor.gr", subject, body)
        agent_email = case.assigned_agent.email if case.assigned_agent else None
        if agent_email and agent_email != "info@i-mentor.gr":
            _send_email(agent_email, subject, body)
    except Exception:
        pass

    return {"ok": True, "filename": file.filename}


@router.get("/public/{token}/documents/{doc_id}/download")
def download_client_upload(token: str, doc_id: int, db: Session = Depends(get_db)):
    """Client downloads one of their own uploaded files via share token."""
    from fastapi.responses import Response as _Resp
    from sqlalchemy import text as _sqlt
    case = db.query(CMCase).filter(CMCase.share_token == token).first()
    if not case or not case.portal_active:
        raise HTTPException(status_code=404, detail="Not found")
    row = db.execute(
        _sqlt("SELECT name, file_data, mime_type, drive_file_id FROM cm_documents WHERE id = :doc_id AND case_id = :case_id AND uploaded_by_client = TRUE"),
        {"doc_id": doc_id, "case_id": case.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    content = None
    if row.drive_file_id:
        try:
            from drive_storage import download_file as _drive_dl
            content = _drive_dl(row.drive_file_id)
        except Exception:
            pass
    if content is None and row.file_data:
        content = bytes(row.file_data)
    if content is None:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return _Resp(
        content=content,
        media_type=row.mime_type or "application/octet-stream",
        headers={"Content-Disposition": _content_disposition(row.name)},
    )


@router.get("/uploads/{case_id}/{filename}")
def serve_portal_upload(case_id: int, filename: str, db: Session = Depends(get_db)):
    """Backward-compat: redirect old filesystem uploads; now falls back to DB lookup by name."""
    from fastapi.responses import Response as _Resp
    # Try to find by name in DB (filesystem files are gone after redeploy)
    doc = (
        db.query(CMDocument)
        .filter(CMDocument.case_id == case_id, CMDocument.uploaded_by_client == True)
        .filter(CMDocument.name.ilike(f"%{os.path.basename(filename).split('_', 2)[-1]}%"))
        .first()
    )
    if doc:
        content = None
        if doc.drive_file_id:
            try:
                from drive_storage import download_file as _drive_dl
                content = _drive_dl(doc.drive_file_id)
            except Exception:
                pass
        if content is None and doc.file_data:
            content = bytes(doc.file_data)
        if content is not None:
            return _Resp(
                content=content,
                media_type=doc.mime_type or "application/octet-stream",
                headers={"Content-Disposition": _content_disposition(doc.name)},
            )
    raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")


@router.get("/{case_id}/client-uploads")
def list_client_uploads(
    case_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List client-uploaded files for a case (advisor access)."""
    docs = (
        db.query(CMDocument)
        .filter(CMDocument.case_id == case_id, CMDocument.uploaded_by_client == True)
        .order_by(CMDocument.created_at.desc())
        .all()
    )
    return [
        {
            "id": d.id,
            "name": d.name,
            "file_url": d.file_url,
            "created_at": fmt_dt(d.created_at),
        }
        for d in docs
    ]
