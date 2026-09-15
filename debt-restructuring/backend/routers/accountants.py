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


def _serialize_assignment(a: AccountantAssignment) -> dict:
    return {
        "id": a.id,
        "accountant_id": a.accountant_id,
        "status": a.status,
        "notes": a.notes,
        "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.get("/my")
def get_my_assignments(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all active (non-terminal) assignments for this employee."""
    active_list = (
        db.query(AccountantAssignment)
        .filter(AccountantAssignment.employee == employee,
                ~AccountantAssignment.status.in_(TERMINAL_STATUSES))
        .order_by(AccountantAssignment.assigned_at.desc())
        .all()
    )

    if not active_list:
        return {"assignments": []}

    try:
        all_accs = _fetch_accountants()
        accs_by_id = {str(a["id"]): a for a in all_accs}
    except Exception:
        accs_by_id = {}

    return {
        "assignments": [
            {
                "assignment": _serialize_assignment(a),
                "accountant": accs_by_id.get(a.accountant_id),
            }
            for a in active_list
        ]
    }


@router.post("/my/assign-next")
def assign_next(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Assign the next available accountant from the pool to this employee.
    Multiple concurrent assignments are allowed."""
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
        "assignment": _serialize_assignment(assignment),
        "accountant": chosen,
    }


@router.patch("/my/status")
async def update_status(
    employee: str = Depends(get_current_user),
    db: Session = Depends(get_db),
    assignment_id: Optional[int] = Body(None, embed=True),
    status: str = Body(..., embed=True),
    notes: Optional[str] = Body(None, embed=True),
):
    if status not in STATUS_ORDER:
        raise HTTPException(status_code=422, detail=f"Invalid status. Valid: {STATUS_ORDER}")

    query = db.query(AccountantAssignment).filter(
        AccountantAssignment.employee == employee,
        ~AccountantAssignment.status.in_(TERMINAL_STATUSES),
    )
    if assignment_id:
        query = query.filter(AccountantAssignment.id == assignment_id)

    active = query.order_by(AccountantAssignment.assigned_at.desc()).first()
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
    # Use most-recent non-skipped assignment per accountant
    assignments: dict[str, AccountantAssignment] = {}
    for row in db.query(AccountantAssignment).order_by(AccountantAssignment.assigned_at.desc()).all():
        if row.accountant_id not in assignments and row.status != "skipped":
            assignments[row.accountant_id] = row

    result = []
    for a in all_accs:
        aid = str(a["id"])
        asgn = assignments.get(aid)
        result.append({
            **a,
            "assignment": {
                "id": asgn.id,
                "employee": asgn.employee,
                "status": asgn.status,
            } if asgn else None,
        })
    return result


@router.get("/admin/overview")
def admin_overview(employee: str = Depends(get_current_user), db: Session = Depends(get_db)):
    if employee != "HARIS":
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        all_accs = _fetch_accountants()
        accs_by_id = {str(a["id"]): a for a in all_accs}
    except Exception:
        all_accs = []
        accs_by_id = {}

    all_assignments = (
        db.query(AccountantAssignment)
        .order_by(AccountantAssignment.assigned_at.desc())
        .all()
    )

    # All active assignments per employee (list, not just one)
    employee_data = []
    for emp in EMPLOYEES:
        active_list = [
            a for a in all_assignments
            if a.employee == emp and a.status not in TERMINAL_STATUSES
        ]
        assignments_data = []
        for a in active_list:
            acc = accs_by_id.get(a.accountant_id)
            assignments_data.append({
                "assignment": _serialize_assignment(a),
                "accountant": acc,
            })
        employee_data.append({
            "employee": emp,
            "assignments": assignments_data,
        })

    # Stats
    stats = {s: 0 for s in STATUS_ORDER}
    for a in all_assignments:
        if a.status in stats:
            stats[a.status] += 1

    used = _used_ids(db)
    stats["available"] = max(0, len(all_accs) - len(used))
    stats["total"] = len(all_assignments)

    # History (last 80, all statuses)
    history = []
    for a in all_assignments[:80]:
        acc = accs_by_id.get(a.accountant_id)
        history.append({
            "id": a.id,
            "employee": a.employee,
            "accountant_id": a.accountant_id,
            "accountant_name": acc["name"] if acc else a.accountant_id,
            "accountant_phone": acc.get("phone") if acc else None,
            "status": a.status,
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        })

    return {
        "employees": employee_data,
        "stats": stats,
        "pool_total": len(all_accs),
        "history": history,
    }


@router.post("/admin/force-skip/{target_employee}")
async def admin_force_skip(
    target_employee: str,
    employee: str = Depends(get_current_user),
    db: Session = Depends(get_db),
    assignment_id: Optional[int] = Body(None, embed=True),
):
    if employee != "HARIS":
        raise HTTPException(status_code=403, detail="Admin only")

    query = db.query(AccountantAssignment).filter(
        AccountantAssignment.employee == target_employee,
        ~AccountantAssignment.status.in_(TERMINAL_STATUSES),
    )
    if assignment_id:
        query = query.filter(AccountantAssignment.id == assignment_id)

    active = query.order_by(AccountantAssignment.assigned_at.desc()).first()
    if not active:
        raise HTTPException(status_code=404, detail="No active assignment")
    active.status = "skipped"
    active.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "employee": target_employee}


@router.post("/admin/force-assign/{target_employee}")
async def admin_force_assign(
    target_employee: str,
    employee: str = Depends(get_current_user),
    db: Session = Depends(get_db),
    accountant_id: Optional[str] = Body(None, embed=True),
):
    """Manually assign next (or specific) accountant to any employee.
    Multiple concurrent assignments are allowed."""
    if employee != "HARIS":
        raise HTTPException(status_code=403, detail="Admin only")

    all_accs = _fetch_accountants()

    if accountant_id:
        chosen = next((a for a in all_accs if str(a["id"]) == accountant_id), None)
        if not chosen:
            raise HTTPException(status_code=404, detail="Accountant not found")
    else:
        used = _used_ids(db)
        available = [a for a in all_accs if str(a["id"]) not in used]
        if not available:
            return {"assigned": False, "message": "No available accountants"}
        idx = _get_pool_index(db) % len(available)
        chosen = available[idx]
        _set_pool_index(db, idx + 1)

    assignment = AccountantAssignment(
        employee=target_employee,
        accountant_id=str(chosen["id"]),
        status="assigned",
        assigned_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {"assigned": True, "accountant": chosen}
