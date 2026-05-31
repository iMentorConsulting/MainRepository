import os
import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from auth_utils import create_access_token, TOKEN_EXPIRE_HOURS

router = APIRouter(prefix="/auth", tags=["auth"])

EMPLOYEES = ["STELLA", "VALLIA", "SOFIA", "HARIS"]

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300   # rolling 5-minute window
LOCKOUT_SECONDS = 900  # 15-minute lockout after max attempts

_attempts: dict = defaultdict(list)
_lockouts: dict = defaultdict(float)


class LoginRequest(BaseModel):
    employee: str
    password: str


@router.post("/login")
def login(body: LoginRequest, request: Request):
    ip = getattr(request.client, "host", "unknown")
    now = time.time()

    # Check active lockout
    lockout_until = _lockouts.get(ip, 0)
    if lockout_until > now:
        remaining = int(lockout_until - now)
        mins, secs = divmod(remaining, 60)
        raise HTTPException(
            status_code=429,
            detail=f"Πολλές αποτυχίες. Δοκιμάστε ξανά σε {mins}λ {secs:02d}δ."
        )

    # Trim attempts outside the rolling window
    _attempts[ip] = [t for t in _attempts[ip] if now - t < WINDOW_SECONDS]

    if len(_attempts[ip]) >= MAX_ATTEMPTS:
        _lockouts[ip] = now + LOCKOUT_SECONDS
        _attempts.pop(ip, None)
        raise HTTPException(
            status_code=429,
            detail=f"Πολλές αποτυχίες. Κλειδωμένο για {LOCKOUT_SECONDS // 60} λεπτά."
        )

    app_password = os.getenv("APP_PASSWORD", "imentor2024")
    if body.employee not in EMPLOYEES or body.password != app_password:
        _attempts[ip].append(now)
        left = MAX_ATTEMPTS - len(_attempts[ip])
        word = "προσπάθεια" if left == 1 else "προσπάθειες"
        raise HTTPException(
            status_code=401,
            detail=f"Λάθος στοιχεία. {left} {word} ακόμα."
        )

    # Success — reset rate limit for this IP
    _attempts.pop(ip, None)
    _lockouts.pop(ip, None)

    token = create_access_token(body.employee)
    return {
        "token": token,
        "employee": body.employee,
        "expires_in": TOKEN_EXPIRE_HOURS * 3600,
    }
