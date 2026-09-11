import os
import json
import time
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from auth_utils import create_access_token, TOKEN_EXPIRE_HOURS
from database import get_db
from models import AppConfig

router = APIRouter(prefix="/auth", tags=["auth"])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300   # rolling 5-minute window
LOCKOUT_SECONDS = 900  # 15-minute lockout


def _get_state(db: Session, ip: str) -> dict:
    key = f"ratelimit:{ip}"
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    if row and row.value:
        return json.loads(row.value)
    return {"attempts": [], "lockout_until": 0}


def _save_state(db: Session, ip: str, state: dict):
    key = f"ratelimit:{ip}"
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    val = json.dumps(state)
    if row:
        row.value = val
    else:
        db.add(AppConfig(key=key, value=val))
    db.commit()


def _clear_state(db: Session, ip: str):
    key = f"ratelimit:{ip}"
    db.query(AppConfig).filter(AppConfig.key == key).delete()
    db.commit()


class LoginRequest(BaseModel):
    employee: str
    password: str


@router.post("/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = getattr(request.client, "host", "unknown")
    now = time.time()

    state = _get_state(db, ip)

    # Check active lockout
    if state["lockout_until"] > now:
        remaining = int(state["lockout_until"] - now)
        mins, secs = divmod(remaining, 60)
        raise HTTPException(
            status_code=429,
            detail=f"Πολλές αποτυχίες. Δοκιμάστε ξανά σε {mins}λ {secs:02d}δ."
        )

    # Trim old attempts outside rolling window
    state["attempts"] = [t for t in state["attempts"] if now - t < WINDOW_SECONDS]

    if len(state["attempts"]) >= MAX_ATTEMPTS:
        state["lockout_until"] = now + LOCKOUT_SECONDS
        state["attempts"] = []
        _save_state(db, ip, state)
        raise HTTPException(
            status_code=429,
            detail=f"Πολλές αποτυχίες. Κλειδωμένο για {LOCKOUT_SECONDS // 60} λεπτά."
        )

    app_password = os.getenv("APP_PASSWORD", "imentor2024")
    if body.employee not in EMPLOYEES or body.password != app_password:
        state["attempts"].append(now)
        _save_state(db, ip, state)
        left = MAX_ATTEMPTS - len(state["attempts"])
        word = "προσπάθεια" if left == 1 else "προσπάθειες"
        raise HTTPException(
            status_code=401,
            detail=f"Λάθος στοιχεία. {left} {word} ακόμα."
        )

    # Success — clear rate limit state
    _clear_state(db, ip)

    token = create_access_token(body.employee)
    return {
        "token": token,
        "employee": body.employee,
        "expires_in": TOKEN_EXPIRE_HOURS * 3600,
    }
