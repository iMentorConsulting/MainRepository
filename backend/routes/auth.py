from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from auth_utils import TENANTS, make_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    tenant_id: str
    password: str


@router.get("/tenants")
def get_tenants():
    return [{"id": k, "name": v["name"]} for k, v in TENANTS.items()]


@router.post("/login")
def login(req: LoginRequest):
    tenant = TENANTS.get(req.tenant_id)
    if not tenant or tenant["password"] != req.password:
        raise HTTPException(status_code=401, detail="Λάθος επιχείρηση ή κωδικός")
    return {
        "token": make_token(req.tenant_id),
        "tenant_id": req.tenant_id,
        "name": tenant["name"],
    }
