from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models_cases import CMUser
from auth_cases import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/cm/auth", tags=["cm-auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(CMUser).filter(
        CMUser.username == req.username.strip().lower(),
        CMUser.is_active == True,
    ).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Λάθος όνομα χρήστη ή κωδικός")
    token = create_token(user.id, user.role)
    return {
        "token": token,
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
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Ο κωδικός άλλαξε επιτυχώς"}
