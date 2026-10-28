import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth_utils import TENANTS, SUPERADMIN_ID, SUPERADMIN_PASSWORD, make_token, get_superadmin
from database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateTenantRequest(BaseModel):
    id: str        # slug, e.g. 'newbusiness'
    name: str      # display name
    password: str


@router.post("/login")
def login(req: LoginRequest):
    username = req.username.strip().lower()
    # Super admin check
    if username == "admin" or username == SUPERADMIN_ID:
        if req.password == SUPERADMIN_PASSWORD:
            return {
                "token": make_token(SUPERADMIN_ID),
                "tenant_id": SUPERADMIN_ID,
                "name": "Super Admin",
                "is_superadmin": True,
            }
        raise HTTPException(status_code=401, detail="Λάθος στοιχεία σύνδεσης")

    tenant = TENANTS.get(username)
    if not tenant or not tenant.get('is_active', True):
        raise HTTPException(status_code=401, detail="Λάθος στοιχεία σύνδεσης")
    if tenant["password"] != req.password:
        raise HTTPException(status_code=401, detail="Λάθος στοιχεία σύνδεσης")
    return {
        "token": make_token(username),
        "tenant_id": username,
        "name": tenant["name"],
        "is_superadmin": False,
    }


# ── Super admin endpoints ─────────────────────────────────────────────────────

@router.get("/superadmin/tenants")
def list_tenants(_: str = Depends(get_superadmin)):
    return [
        {
            "id": tid,
            "name": info["name"],
            "is_active": info.get("is_active", True),
        }
        for tid, info in TENANTS.items()
    ]


@router.post("/superadmin/tenants")
def create_tenant(req: CreateTenantRequest, db: Session = Depends(get_db), _: str = Depends(get_superadmin)):
    tid = req.id.strip().lower()
    if not re.match(r'^[a-z0-9_-]{2,40}$', tid):
        raise HTTPException(status_code=422, detail="Το ID πρέπει να περιέχει μόνο πεζά γράμματα, αριθμούς, _ ή -")
    if tid in TENANTS:
        raise HTTPException(status_code=409, detail="Υπάρχει ήδη επιχείρηση με αυτό το ID")

    # Persist to DB
    from models import TenantRecord
    if db.query(TenantRecord).filter_by(id=tid).first():
        raise HTTPException(status_code=409, detail="Υπάρχει ήδη επιχείρηση με αυτό το ID")
    db.add(TenantRecord(id=tid, name=req.name.strip(), password=req.password))
    db.commit()

    # Add to in-memory registry so it's immediately usable
    TENANTS[tid] = {"name": req.name.strip(), "password": req.password, "is_active": True}

    return {"id": tid, "name": req.name.strip(), "token": make_token(tid)}


@router.patch("/superadmin/tenants/{tenant_id}")
def update_tenant(tenant_id: str, data: dict, db: Session = Depends(get_db), _: str = Depends(get_superadmin)):
    from models import TenantRecord
    rec = db.query(TenantRecord).filter_by(id=tenant_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε επιχείρηση")
    if "password" in data:
        rec.password = data["password"]
        if tenant_id in TENANTS:
            TENANTS[tenant_id]["password"] = data["password"]
    if "is_active" in data:
        rec.is_active = data["is_active"]
        if tenant_id in TENANTS:
            TENANTS[tenant_id]["is_active"] = data["is_active"]
    db.commit()
    return {"ok": True}
