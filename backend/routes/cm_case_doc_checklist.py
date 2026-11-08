from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import get_db
from models_cases import CMCaseDocChecklist, CMCaseDocChecklistItem, CMCase
from auth_cases import get_current_user
from models_cases import CMUser

router = APIRouter(tags=["cm-case-doc-checklist"])


# ── Pydantic ───────────────────────────────────────────────────────────────────

class ChecklistItemInput(BaseModel):
    item_code: Optional[str] = None
    opske_code: Optional[str] = None
    group_code: Optional[str] = None
    group_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    requirement_type: Optional[str] = None
    condition_notes: Optional[str] = None
    is_applicable: bool = True
    sort_order: int = 0


class ChecklistCreate(BaseModel):
    doc_set_id: Optional[int] = None
    title: str
    notes: Optional[str] = None
    items: List[ChecklistItemInput]


class ChecklistUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None   # active | hidden


class ChecklistItemUpdate(BaseModel):
    is_applicable: Optional[bool] = None
    is_received: Optional[bool] = None
    client_notes: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _item_dict(i: CMCaseDocChecklistItem) -> dict:
    return {
        "id": i.id,
        "checklist_id": i.checklist_id,
        "item_code": i.item_code,
        "opske_code": i.opske_code,
        "group_code": i.group_code,
        "group_name": i.group_name,
        "title": i.title,
        "description": i.description,
        "requirement_type": i.requirement_type,
        "condition_notes": i.condition_notes,
        "is_applicable": i.is_applicable,
        "is_received": i.is_received,
        "received_at": i.received_at.isoformat() if i.received_at else None,
        "client_notes": i.client_notes,
        "sort_order": i.sort_order,
    }


def _checklist_dict(c: CMCaseDocChecklist, include_items: bool = False) -> dict:
    total = len(c.items) if c.items is not None else 0
    applicable = sum(1 for i in (c.items or []) if i.is_applicable)
    received = sum(1 for i in (c.items or []) if i.is_received and i.is_applicable)
    d = {
        "id": c.id,
        "case_id": c.case_id,
        "doc_set_id": c.doc_set_id,
        "title": c.title,
        "notes": c.notes,
        "status": c.status,
        "assigned_by_id": c.assigned_by_id,
        "total_items": total,
        "applicable_items": applicable,
        "received_items": received,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_items:
        d["items"] = [_item_dict(i) for i in (c.items or [])]
    return d


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/api/cm/cases/{case_id}/doc-checklists")
def list_checklists(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    rows = (
        db.query(CMCaseDocChecklist)
        .filter(CMCaseDocChecklist.case_id == case_id)
        .order_by(CMCaseDocChecklist.created_at.desc())
        .all()
    )
    return [_checklist_dict(r) for r in rows]


@router.post("/api/cm/cases/{case_id}/doc-checklists")
def create_checklist(
    case_id: int,
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    checklist = CMCaseDocChecklist(
        case_id=case_id,
        doc_set_id=body.doc_set_id,
        title=body.title,
        notes=body.notes,
        status="active",
        assigned_by_id=current_user.id,
    )
    db.add(checklist)
    db.flush()
    for idx, item in enumerate(body.items):
        db.add(CMCaseDocChecklistItem(
            checklist_id=checklist.id,
            item_code=item.item_code,
            opske_code=item.opske_code,
            group_code=item.group_code,
            group_name=item.group_name,
            title=item.title,
            description=item.description,
            requirement_type=item.requirement_type,
            condition_notes=item.condition_notes,
            is_applicable=item.is_applicable,
            sort_order=item.sort_order if item.sort_order is not None else idx,
        ))
    db.commit()
    db.refresh(checklist)
    return _checklist_dict(checklist, include_items=True)


@router.get("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def get_checklist(
    case_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return _checklist_dict(c, include_items=True)


@router.put("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def update_checklist(
    case_id: int,
    checklist_id: int,
    body: ChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(c, field, val)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return _checklist_dict(c, include_items=True)


@router.delete("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}")
def delete_checklist(
    case_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.put("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}/items/{item_id}")
def update_checklist_item(
    case_id: int,
    checklist_id: int,
    item_id: int,
    body: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    item = db.query(CMCaseDocChecklistItem).filter(
        CMCaseDocChecklistItem.id == item_id,
        CMCaseDocChecklistItem.checklist_id == checklist_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    data = body.model_dump(exclude_none=True)
    for field, val in data.items():
        setattr(item, field, val)
    if "is_received" in data and data["is_received"] and not item.received_at:
        item.received_at = datetime.utcnow()
    elif "is_received" in data and not data["is_received"]:
        item.received_at = None
    db.commit()
    db.refresh(item)
    return _item_dict(item)


# ── Send email ─────────────────────────────────────────────────────────────────

@router.post("/api/cm/cases/{case_id}/doc-checklists/{checklist_id}/send-email")
def send_checklist_email(
    case_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not getattr(case, "email", None):
        raise HTTPException(status_code=400, detail="Δεν υπάρχει email πελάτη στην υπόθεση")

    c = db.query(CMCaseDocChecklist).filter(
        CMCaseDocChecklist.id == checklist_id,
        CMCaseDocChecklist.case_id == case_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")

    import os
    app_base = os.getenv("PORTAL_BASE_URL", "").rstrip("/")
    logo_url = f"{app_base}/logo-white.png" if app_base else ""

    # Build grouped items
    applicable = [i for i in (c.items or []) if i.is_applicable]
    pending = [i for i in applicable if not i.is_received]
    received_items = [i for i in applicable if i.is_received]

    groups: dict = {}
    for item in pending:
        g = item.group_name or item.group_code or "Λοιπά"
        if g not in groups:
            groups[g] = []
        groups[g].append(item)

    REQ_COLORS_CSS = {
        "ΥΠΟΧΡΕΩΤΙΚΟ": ("Υποχρεωτικό", "#fce8e8", "#b91c1c"),
        "ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ": ("Υπό Προϋπόθεση", "#fff3e0", "#c2410c"),
        "ΕΝΑΛΛΑΚΤΙΚΑ": ("Εναλλακτικό", "#fefce8", "#854d0e"),
        "ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ": ("Για Βαθμολόγηση", "#eff6ff", "#1d4ed8"),
        "ΠΡΟΑΙΡΕΤΙΚΟ": ("Προαιρετικό", "#f9fafb", "#6b7280"),
    }

    def req_badge(rt):
        label, bg, color = REQ_COLORS_CSS.get(rt, (rt or "", "#f9fafb", "#6b7280"))
        return f'<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:{bg};color:{color};white-space:nowrap;">{label}</span>'

    rows_html = ""
    for grp, items in groups.items():
        rows_html += f"""
        <tr><td colspan="2" style="padding:12px 0 4px;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">{grp}</td></tr>"""
        for item in items:
            notes_row = ""
            if item.client_notes:
                notes_row = f'<div style="margin-top:4px;padding:6px 10px;background:#fafafa;border-left:3px solid #cbd5e1;font-size:12px;color:#475569;font-style:italic;">{item.client_notes}</div>'
            cond_row = ""
            if item.condition_notes:
                cond_row = f'<div style="margin-top:3px;font-size:11px;color:#ea580c;font-style:italic;">▸ {item.condition_notes}</div>'
            desc_row = ""
            if item.description:
                desc_row = f'<div style="margin-top:4px;font-size:12px;color:#64748b;line-height:1.5;">{item.description}</div>'
            rows_html += f"""
        <tr>
          <td style="padding:10px 8px 10px 0;vertical-align:top;border-bottom:1px solid #f1f5f9;width:28px;">
            <div style="width:20px;height:20px;border-radius:50%;border:2px solid #cbd5e1;flex-shrink:0;"></div>
          </td>
          <td style="padding:10px 0;vertical-align:top;border-bottom:1px solid #f1f5f9;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              {f'<span style="font-size:10px;font-family:monospace;color:#94a3b8;background:#f1f5f9;padding:1px 6px;border-radius:4px;">{item.item_code}</span>' if item.item_code else ''}
              {req_badge(item.requirement_type)}
              <span style="font-size:14px;font-weight:600;color:#1e293b;">{item.title}</span>
            </div>
            {cond_row}{desc_row}{notes_row}
          </td>
        </tr>"""

    progress_pct = round((len(received_items) / len(applicable) * 100)) if applicable else 0
    logo_html = (
        f'<img src="{logo_url}" alt="iMentor Consulting" style="height:52px;width:auto;display:block;" />'
        if logo_url else
        '<h2 style="color:white;margin:0;font-family:Arial,sans-serif;font-size:20px;">iMentor Consulting</h2>'
    )

    html = f"""<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:30px 10px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563a8 100%);padding:28px 32px;text-align:center;">
      {logo_html}
      <p style="color:#93c5fd;margin:10px 0 0;font-size:13px;letter-spacing:0.03em;">Διαχείριση Δικαιολογητικών</p>
    </td>
  </tr>

  <!-- Intro -->
  <tr>
    <td style="background:#fff;padding:28px 32px 20px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#1e3a5f;">Εκκρεμή Δικαιολογητικά</h1>
      <p style="margin:0 0 4px;font-size:14px;color:#475569;">{c.title}</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Αγαπητέ/ή <strong style="color:#1e293b;">{case.client_name or ''}</strong>, παρακαλούμε να μας αποστείλετε τα παρακάτω δικαιολογητικά για την ολοκλήρωση της αίτησής σας.</p>
    </td>
  </tr>

  <!-- Progress bar -->
  <tr>
    <td style="background:#fff;padding:0 32px 20px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;background:#e2e8f0;border-radius:8px;overflow:hidden;height:10px;">
          <div style="width:{progress_pct}%;background:linear-gradient(90deg,#22c55e,#16a34a);height:10px;border-radius:8px;"></div>
        </div>
        <span style="font-size:12px;color:#64748b;white-space:nowrap;">{len(received_items)}/{len(applicable)} παραλήφθηκαν</span>
      </div>
    </td>
  </tr>

  <!-- Pending items -->
  <tr>
    <td style="background:#fff;padding:0 32px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        {rows_html}
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">iMentor Consulting | <a href="https://consult.i-mentor.gr" style="color:#3b82f6;text-decoration:none;">consult.i-mentor.gr</a></p>
      <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">Αυτόματο μήνυμα — παρακαλώ μη απαντήσετε σε αυτό το email.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>"""

    subject = f"Εκκρεμή Δικαιολογητικά — {c.title}"
    plain = f"Αγαπητέ/ή {case.client_name or ''}, παρακαλούμε να μας αποστείλετε τα εκκρεμή δικαιολογητικά για: {c.title}. Σύνολο εκκρεμών: {len(pending)}."

    try:
        from routes.cm_notifications import _send_email
        ok, err = _send_email(case.email, subject, plain, html_override=html)
        if not ok:
            raise HTTPException(status_code=500, detail=f"Αποτυχία αποστολής: {err}")
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")

    return {"ok": True, "sent_to": case.email, "pending_count": len(pending)}
