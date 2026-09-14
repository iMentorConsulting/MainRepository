import os
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Body
from sqlalchemy.orm import Session

from database import get_db
from models import AppConfig
from auth_utils import get_current_user

router = APIRouter(prefix="/finance", tags=["finance"])


def _payroll_key(year: int, month: int) -> str:
    return f"finance_payroll_{year}_{month:02d}"


@router.post("/payroll-targets", status_code=200)
async def receive_payroll_targets(
    payload: dict = Body(...),
    x_api_key: str = Header(None, alias="x-api-key"),
    db: Session = Depends(get_db),
):
    expected = os.getenv("EXODIKASTIKOS_API_KEY", "")
    if not expected or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    year = payload.get("year")
    month = payload.get("month")
    if not year or not month:
        raise HTTPException(status_code=422, detail="year and month are required")

    key = _payroll_key(int(year), int(month))
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    serialized = json.dumps(payload, ensure_ascii=False)
    if row:
        row.value = serialized
    else:
        db.add(AppConfig(key=key, value=serialized))
    db.commit()
    return {"ok": True}


@router.get("/payroll-targets/current", dependencies=[Depends(get_current_user)])
def get_current_payroll(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    key = _payroll_key(now.year, now.month)
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    if not row:
        return None
    return json.loads(row.value)
