from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from database import get_db
from auth_utils import get_tenant
from models import AvailabilityRule, Unit
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta

router = APIRouter(prefix="/availability", tags=["availability"])


class RuleIn(BaseModel):
    unit_id: int
    date: date
    status: str = 'open'
    availability: Optional[int] = None
    min_stay: Optional[int] = None
    max_stay: Optional[int] = None
    checkin_restriction: str = 'allowed'


class BulkIn(BaseModel):
    unit_id: int
    date_from: date
    date_to: date
    days_of_week: Optional[List[int]] = None   # 0=Mon … 6=Sun; None = every day
    status: Optional[str] = None
    availability: Optional[int] = None
    min_stay: Optional[int] = None
    max_stay: Optional[int] = None
    checkin_restriction: Optional[str] = None
    clear: bool = False                         # True = delete rules in range


def _rule_dict(r):
    return {
        'id': r.id,
        'unit_id': r.unit_id,
        'date': r.date.isoformat(),
        'status': r.status,
        'availability': r.availability,
        'min_stay': r.min_stay,
        'max_stay': r.max_stay,
        'checkin_restriction': r.checkin_restriction,
    }


@router.get("/")
def list_rules(
    unit_id: int,
    date_from: str,
    date_to: str,
    db: Session = Depends(get_db),
    tenant: str = Depends(get_tenant),
):
    rows = (
        db.query(AvailabilityRule)
        .filter(
            AvailabilityRule.tenant == tenant,
            AvailabilityRule.unit_id == unit_id,
            AvailabilityRule.date >= date_from,
            AvailabilityRule.date <= date_to,
        )
        .all()
    )
    return [_rule_dict(r) for r in rows]


@router.post("/")
def upsert_rule(data: RuleIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    row = db.query(AvailabilityRule).filter_by(
        tenant=tenant, unit_id=data.unit_id, date=data.date
    ).first()
    if row:
        row.status = data.status
        row.availability = data.availability
        row.min_stay = data.min_stay
        row.max_stay = data.max_stay
        row.checkin_restriction = data.checkin_restriction
        row.updated_at = datetime.utcnow()
    else:
        row = AvailabilityRule(tenant=tenant, **data.dict())
        db.add(row)
    db.commit()
    db.refresh(row)
    return _rule_dict(row)


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    row = db.query(AvailabilityRule).filter_by(id=rule_id, tenant=tenant).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.delete("/by-date/{unit_id}/{date_str}")
def delete_by_date(unit_id: int, date_str: str, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    row = db.query(AvailabilityRule).filter_by(
        tenant=tenant, unit_id=unit_id, date=date_str
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


@router.post("/bulk")
def bulk_update(data: BulkIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    cur = data.date_from
    count = 0
    while cur <= data.date_to:
        if data.days_of_week is None or cur.weekday() in data.days_of_week:
            row = db.query(AvailabilityRule).filter_by(
                tenant=tenant, unit_id=data.unit_id, date=cur
            ).first()
            if data.clear:
                if row:
                    db.delete(row)
                    count += 1
            else:
                if row:
                    if data.status is not None:
                        row.status = data.status
                    if data.availability is not None:
                        row.availability = data.availability
                    if data.min_stay is not None:
                        row.min_stay = data.min_stay
                    if data.max_stay is not None:
                        row.max_stay = data.max_stay
                    if data.checkin_restriction is not None:
                        row.checkin_restriction = data.checkin_restriction
                    row.updated_at = datetime.utcnow()
                else:
                    kwargs = {
                        'tenant': tenant,
                        'unit_id': data.unit_id,
                        'date': cur,
                        'status': data.status or 'open',
                        'availability': data.availability,
                        'min_stay': data.min_stay,
                        'max_stay': data.max_stay,
                        'checkin_restriction': data.checkin_restriction or 'allowed',
                    }
                    db.add(AvailabilityRule(**kwargs))
                count += 1
        cur += timedelta(days=1)
    db.commit()
    return {"updated": count}
