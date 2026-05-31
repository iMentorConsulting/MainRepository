import os
import time
import bcrypt
import jwt
from datetime import datetime, timedelta
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMUser

SECRET = os.getenv("CM_SECRET")
if not SECRET:
    raise RuntimeError("CM_SECRET environment variable is not set. Set it to a long random string.")

TOKEN_EXPIRE_HOURS = 8  # auto-logout after 8 hours

# ── Brute-force protection ────────────────────────────────────────────────────
# In-memory store: key = username.lower(), value = {"fails": int, "locked_until": float}
_login_attempts: dict[str, dict] = {}
MAX_FAILS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes


def _check_lockout(username: str) -> None:
    key = username.lower()
    record = _login_attempts.get(key)
    if record and record["locked_until"] > time.time():
        remaining = int((record["locked_until"] - time.time()) / 60) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Ο λογαριασμός είναι κλειδωμένος για {remaining} λεπτά λόγω πολλαπλών αποτυχημένων προσπαθειών.",
        )


def _record_fail(username: str) -> None:
    key = username.lower()
    record = _login_attempts.setdefault(key, {"fails": 0, "locked_until": 0.0})
    # Reset if previous lockout has expired
    if record["locked_until"] and record["locked_until"] < time.time():
        record["fails"] = 0
        record["locked_until"] = 0.0
    record["fails"] += 1
    if record["fails"] >= MAX_FAILS:
        record["locked_until"] = time.time() + LOCKOUT_SECONDS
        print(f"[security] Account '{key}' locked after {MAX_FAILS} failed attempts", flush=True)
    else:
        print(f"[security] Failed login for '{key}' ({record['fails']}/{MAX_FAILS})", flush=True)


def _record_success(username: str) -> None:
    _login_attempts.pop(username.lower(), None)


# ── Password hashing (bcrypt) ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password with bcrypt (always use for new passwords)."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password — supports bcrypt hashes and legacy SHA256 hashes."""
    try:
        # bcrypt hashes start with $2b$ or $2a$
        if stored_hash.startswith("$2"):
            return bcrypt.checkpw(password.encode(), stored_hash.encode())
        # Legacy SHA256 fallback (for accounts not yet migrated)
        import hashlib
        legacy_secret = os.getenv("CM_SECRET", "")
        legacy_hash = hashlib.sha256(f"{password}:{legacy_secret}".encode()).hexdigest()
        return legacy_hash == stored_hash
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(user_id: int, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Η συνεδρία έχει λήξει. Συνδεθείτε ξανά.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Μη έγκυρο token.")


def get_current_user(
    authorization: str = Header(default=None),
    db: Session = Depends(get_db),
) -> CMUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Απαιτείται σύνδεση")
    token = authorization[7:]
    payload = decode_token(token)
    user = db.query(CMUser).filter(CMUser.id == payload["user_id"], CMUser.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Χρήστης δεν βρέθηκε")
    return user


def require_admin(current_user: CMUser = Depends(get_current_user)) -> CMUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα διαχειριστή")
    return current_user


def seed_admin(db: Session):
    """Create default admin if no users exist."""
    if db.query(CMUser).count() == 0:
        admin = CMUser(
            username="admin",
            full_name="Administrator",
            email="admin@i-mentor.gr",
            role="admin",
            password_hash=hash_password("admin2025"),
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("[security] Default admin created — CHANGE THE PASSWORD IMMEDIATELY", flush=True)
