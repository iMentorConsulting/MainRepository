from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models_cases import CMUser
from auth_cases import hash_password, get_current_user, require_admin

router = APIRouter(prefix="/api/cm/users", tags=["cm-users"])


class UserCreate(BaseModel):
    username: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = "agent"
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


def user_to_dict(u: CMUser) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/")
def list_users(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = db.query(CMUser).order_by(CMUser.full_name).all()
    return [user_to_dict(u) for u in users]


@router.post("/")
def create_user(
    req: UserCreate,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    username = req.username.strip().lower()
    if db.query(CMUser).filter(CMUser.username == username).first():
        raise HTTPException(status_code=400, detail="Το όνομα χρήστη χρησιμοποιείται ήδη")
    user = CMUser(
        username=username,
        full_name=req.full_name,
        email=req.email,
        phone=req.phone,
        role=req.role,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.put("/{user_id}")
def update_user(
    user_id: int,
    req: UserUpdate,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(CMUser).filter(CMUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Χρήστης δεν βρέθηκε")
    if req.full_name is not None:
        user.full_name = req.full_name
    if req.email is not None:
        user.email = req.email
    if req.phone is not None:
        user.phone = req.phone
    if req.role is not None:
        user.role = req.role
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.password:
        user.password_hash = hash_password(req.password)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    current_user: CMUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(CMUser).filter(CMUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Χρήστης δεν βρέθηκε")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Δεν μπορείτε να διαγράψετε τον εαυτό σας")
    db.delete(user)
    db.commit()
    return {"message": "Ο χρήστης διαγράφηκε"}
