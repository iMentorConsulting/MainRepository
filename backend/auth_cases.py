import hashlib
import os
import jwt
from datetime import datetime, timedelta
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMUser

SECRET = os.getenv("CM_SECRET", "imentorconsulting-secret-2025")
TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    return hashlib.sha256(f"{password}:{SECRET}".encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def create_token(user_id: int, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
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
