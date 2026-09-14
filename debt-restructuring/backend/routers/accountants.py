import os
import json
import requests as req_lib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from database import get_db
from models import AccountantAssignment, AppConfig
from auth_utils import get_current_user

router = APIRouter(prefix="/accountants", tags=["accountants"], dependencies=[Depends(get_current_user)])

LOGISTIS_BASE_URL = os.getenv("LOGISTIS_BASE_URL", "https://logistis.i-mentor.gr")
TERMINAL_STATUSES = {"converted", "rejected", "skipped"}
STATUS_ORDER = ["assigned", "called", "meeting_set", "demo_done", "converted", "rejected", "skipped"]

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]


def _api_key() -> str:
    key = os.getenv("EXODIKASTIKOS_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="EXODIKASTIKOS_API_KEY not configured")
    return key


def _fetch_accountants():
    url = f"{LOGISTIS_BASE_URL}/api/exodikastikos/accountants"
    r = req_lib.get(url, headers={"x-api-key": _api_key()}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Logistis API error: {r.status_code}")
    return r.json()


def _pool_index_key() -> str:
    return "accountant_pool_index"


def _get_pool_index(db: Session) -> int:
    row = db.query(AppConfig).filter(AppConfig.key == _pool_index_key()).first()
    return int(row.value) if row else 0


def _set_pool_index(db: Session, idx: int):
    row = db.query(AppConfig).filter(AppConfig.key == _pool_index_key()).first()
    if row:
        row.value = str(idx)
    else:
        db.add(AppConfig(key=_pool_index_key(), value=str(idx)))
    db.commit()


def _used_ids(db: Session):
    """Accountant IDs unavailable for new assignment:
    active (in-progress), converted (done), or rejected.
    Skipped assignments release the accountant back into the pool."""
    rows = db.query(AccountantAssignment.accountant_id).filter(
        AccountantAssignment.status != "skipped"
    ).all()
    return {r.accountant_id for r in rows}


@router.get("/my")
def get_my_assignment(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    active = (
        db.query(AccountantAssignment)
        .filter(AccountantAssignment.employee == employee,
                ~AccountantAssignment.status.in_(TERMINAL_STATUSES))
        .order_by(AccountantAssignment.assigned_at.desc())
        .first()
    )
    if not active:
        return None

    try:
        all_accs = _fetch_accountants()
        acc = next((a for a in all_accs if str(a["id"]) == active.accountant_id), None)
    except Exception:
        acc = None

    return {
        "assignment": {
            "id": active.id,
            "accountant_id": active.accountant_id,
            "status": active.status,
            "notes": active.notes,
            "assigned_at": active.assigned_at.isoformat() if active.assigned_at else None,
            "updated_at": active.updated_at.isoformat() if active.updated_at else None,
        },
        "accountant": acc,
    }


@router.post("/my/assign-next")
def assign_next(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Assign the next available accountant from the pool to this employee."""
    active = (
        db.query(AccountantAssignment)
        .filter(AccountantAssignment.employee == employee,
                ~AccountantAssignment.status.in_(TERMINAL_STATUSES))
        .first()
    )
    if active:
        raise HTTPException(status_code=409, detail="Already has an active assignment")

    all_accs = _fetch_accountants()
    used = _used_ids(db)
    available = [a for a in all_accs if str(a["id"]) not in used]

    if not available:
        return {"assigned": False, "message": "Δεν υπάρχουν διαθέσιμοι λογιστές"}

    # Round-robin from pool index
    idx = _get_pool_index(db) % len(available)
    chosen = available[idx]
    _set_pool_index(db, idx + 1)

    assignment = AccountantAssignment(
        employee=employee,
        accountant_id=str(chosen["id"]),
        status="assigned",
        assigned_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "assigned": True,
        "assignment": {
            "id": assignment.id,
            "accountant_id": assignment.accountant_id,
            "status": assignment.status,
            "assigned_at": assignment.assigned_at.isoformat(),
        },
        "accountant": chosen,
    }


@router.patch("/my/status")
async def update_status(
    employee: str = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str = Body(..., embed=True),
    notes: Optional[str] = Body(None, embed=True),
):
    if status not in STATUS_ORDER:
        raise HTTPException(status_code=422, detail=f"Invalid status. Valid: {STATUS_ORDER}")

    active = (
        db.query(AccountantAssignment)
        .filter(AccountantAssignment.employee == employee,
                ~AccountantAssignment.status.in_(TERMINAL_STATUSES))
        .order_by(AccountantAssignment.assigned_at.desc())
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="No active assignment")

    active.status = status
    active.updated_at = datetime.utcnow()
    if notes is not None:
        active.notes = notes
    db.commit()

    return {"ok": True, "status": status}


@router.get("/pool")
def get_pool(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin view: all accountants with assignment status."""
    all_accs = _fetch_accountants()
    assignments = {
        row.accountant_id: row
        for row in db.query(AccountantAssignment).all()
    }
    result = []
    for a in all_accs:
        aid = str(a["id"])
        asgn = assignments.get(aid)
        result.append({
            **a,
            "assignment": {
                "employee": asgn.employee,
                "status": asgn.status,
            } if asgn else None,
        })
    return result
