from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models_cases import CMUser
from auth_cases import (
    hash_password, verify_password, create_token, get_current_user,
    _check_lockout, _record_fail, _record_success,
)

router = APIRouter(prefix="/api/cm/auth", tags=["cm-auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    username = req.username.strip().lower()

    # Check if account is locked
    _check_lockout(username)

    user = db.query(CMUser).filter(
        CMUser.username == username,
        CMUser.is_active == True,
    ).first()

    if not user or not verify_password(req.password, user.password_hash):
        _record_fail(username)
        raise HTTPException(status_code=401, detail="Λάθος όνομα χρήστη ή κωδικός")

    # Successful login
    _record_success(username)

    # Transparently upgrade legacy SHA256 hash to bcrypt on next login
    if user.password_hash and not user.password_hash.startswith("$2"):
        user.password_hash = hash_password(req.password)
        db.commit()
        print(f"[security] Upgraded password hash to bcrypt for user '{username}'", flush=True)

    token = create_token(user.id, user.role)
    return {
        "token": token,
        "expires_in_hours": 8,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
        },
    }


@router.get("/me")
def me(current_user: CMUser = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role,
    }


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Λάθος τρέχων κωδικός")
    if len(req.new_password) < 10:
        raise HTTPException(status_code=400, detail="Ο νέος κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Ο κωδικός άλλαξε επιτυχώς"}
