import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any
from database import get_db, fmt_dt
from models_cases import CMCaseAnakainizw, CMCase
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/anakainizw", tags=["anakainizw"])

ENERGY_KEYS = frozenset({
    'energy_insulation', 'energy_windows', 'energy_hvac',
    'energy_solar', 'energy_pv', 'energy_other',
})


class AnakainizwUpdate(BaseModel):
    # Property
    property_sqm: Optional[float] = None
    property_prefecture: Optional[str] = None
    property_address: Optional[str] = None
    property_type: Optional[str] = None
    property_age: Optional[str] = None
    property_usage: Optional[str] = None
    renovation_works: Optional[str] = None
    legality: Optional[str] = None
    cooperating_engineer: Optional[str] = None
    subsidy_percent: Optional[float] = None
    # Budget (manual fallback; overridden when budget_items present)
    energy_works_budget: Optional[float] = None
    general_works_budget: Optional[float] = None
    # Predefined budget items JSON
    budget_items: Optional[Any] = None
    # Household
    household_type: Optional[str] = None
    num_children: Optional[int] = None
    actual_income: Optional[float] = None
    # Legacy flags
    is_single_parent: Optional[bool] = None
    is_three_children: Optional[bool] = None
    # Boost flags
    boost_island: Optional[bool] = None
    boost_single_parent: Optional[bool] = None
    boost_three_children: Optional[bool] = None
    boost_large_family: Optional[bool] = None
    boost_youth: Optional[bool] = None
    boost_disability: Optional[bool] = None
    # Document checklist
    doc_title_deed: Optional[bool] = None
    doc_e9: Optional[bool] = None
    doc_permit: Optional[bool] = None
    doc_legalization: Optional[bool] = None
    doc_plans: Optional[bool] = None
    doc_e1: Optional[bool] = None
    doc_tax_clearance: Optional[bool] = None
    doc_e2: Optional[bool] = None
    doc_extras: Optional[Any] = None
    advisor_checks: Optional[Any] = None
    # Inspection fee
    inspection_fee_paid: Optional[bool] = None


def _income_limit(household_type: str, num_children: int) -> int:
    base = 25000 if (household_type or "").lower() == "άγαμος" else 35000
    return min(base + (num_children or 0) * 5000, 45000)


def _compute_budget_totals(row: CMCaseAnakainizw):
    """Return (energy_total, general_total) from budget_items if present, else from columns."""
    items = json.loads(row.budget_items) if row.budget_items else {}
    if items:
        energy = sum(float(v) for k, v in items.items() if k in ENERGY_KEYS)
        general = sum(float(v) for k, v in items.items() if k not in ENERGY_KEYS)
        return energy, general
    return (row.energy_works_budget or 0), (row.general_works_budget or 0)


def _row_to_dict(row: CMCaseAnakainizw) -> dict:
    energy, general = _compute_budget_totals(row)
    total = energy + general
    max_budget = min((row.property_sqm or 0) * 300, 36000) if row.property_sqm else 0
    energy_pct = round((energy / total) * 100) if total > 0 else 0
    income_limit = _income_limit(row.household_type or "", row.num_children or 0)
    actual_income = row.actual_income
    items = json.loads(row.budget_items) if row.budget_items else {}
    return {
        "case_id": row.case_id,
        # Property
        "property_sqm": row.property_sqm,
        "property_prefecture": row.property_prefecture,
        "property_address": row.property_address,
        "property_type": row.property_type,
        "property_age": row.property_age,
        "property_usage": row.property_usage,
        "renovation_works": row.renovation_works,
        "legality": row.legality,
        "cooperating_engineer": row.cooperating_engineer,
        "subsidy_percent": row.subsidy_percent,
        # Budget
        "energy_works_budget": energy,
        "general_works_budget": general,
        "total_works_budget": total,
        "max_budget": max_budget,
        "energy_pct": energy_pct,
        "energy_ok": energy_pct >= 20,
        "budget_items": items,
        # Household
        "household_type": row.household_type,
        "num_children": row.num_children,
        "income_limit": income_limit,
        "actual_income": actual_income,
        "income_eligible": (actual_income <= income_limit) if actual_income is not None else None,
        # Legacy flags
        "is_single_parent": row.is_single_parent,
        "is_three_children": row.is_three_children,
        # Boost flags
        "boost_island": row.boost_island,
        "boost_single_parent": row.boost_single_parent,
        "boost_three_children": row.boost_three_children,
        "boost_large_family": row.boost_large_family,
        "boost_youth": row.boost_youth,
        "boost_disability": row.boost_disability,
        # Document checklist
        "doc_title_deed": row.doc_title_deed,
        "doc_e9": row.doc_e9,
        "doc_permit": row.doc_permit,
        "doc_legalization": row.doc_legalization,
        "doc_plans": row.doc_plans,
        "doc_e1": row.doc_e1,
        "doc_tax_clearance": row.doc_tax_clearance,
        "doc_e2": row.doc_e2,
        "doc_extras": json.loads(row.doc_extras) if row.doc_extras else {},
        "advisor_checks": json.loads(row.advisor_checks) if row.advisor_checks else {},
        # Inspection fee
        "inspection_fee_paid": row.inspection_fee_paid,
        "inspection_fee_paid_at": fmt_dt(row.inspection_fee_paid_at),
        "updated_at": fmt_dt(row.updated_at),
    }


@router.get("/{case_id}")
def get_anakainizw_data(
    case_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(CMCaseAnakainizw).filter(CMCaseAnakainizw.case_id == case_id).first()
    if not row:
        return {}
    return _row_to_dict(row)


@router.put("/{case_id}")
def upsert_anakainizw_data(
    case_id: int,
    req: AnakainizwUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Υπόθεση δεν βρέθηκε")
    row = db.query(CMCaseAnakainizw).filter(CMCaseAnakainizw.case_id == case_id).first()
    if not row:
        row = CMCaseAnakainizw(case_id=case_id)
        db.add(row)
    data = req.dict(exclude_none=True)
    # Handle JSON fields
    if 'doc_extras' in data:
        row.doc_extras = json.dumps(data.pop('doc_extras'))
    if 'advisor_checks' in data:
        row.advisor_checks = json.dumps(data.pop('advisor_checks'))
    if 'budget_items' in data:
        items = data.pop('budget_items')
        row.budget_items = json.dumps(items)
        energy = sum(float(v) for k, v in items.items() if k in ENERGY_KEYS)
        general = sum(float(v) for k, v in items.items() if k not in ENERGY_KEYS)
        row.energy_works_budget = energy
        row.general_works_budget = general
        # Remove manual totals from data since we computed them
        data.pop('energy_works_budget', None)
        data.pop('general_works_budget', None)
    for field, val in data.items():
        if hasattr(row, field):
            setattr(row, field, val)
    if req.inspection_fee_paid is True and not row.inspection_fee_paid_at:
        row.inspection_fee_paid_at = datetime.utcnow()
    elif req.inspection_fee_paid is False:
        row.inspection_fee_paid_at = None
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)
