import hashlib
import os
from fastapi import Header, HTTPException

SECRET = os.getenv("AUTH_SECRET", "booking-secret-key-2024")
SUPERADMIN_PASSWORD = os.getenv("SUPERADMIN_PASSWORD", "iMentor@Admin2024")
SUPERADMIN_ID = "__superadmin__"

# Mutable dict — populated from DB on startup; new tenants added at runtime
TENANTS: dict = {
    'evaivoni': {'name': 'EVA-IVONI APARTMENTS', 'password': 'evaivoni'},
    'vieverde': {'name': 'VIEVERDE VILLAS', 'password': 'vieverde123'},
}


def make_token(tenant_id: str) -> str:
    return hashlib.sha256(f"{tenant_id}:{SECRET}".encode()).hexdigest()


def verify_token(token: str):
    if token == make_token(SUPERADMIN_ID):
        return SUPERADMIN_ID
    for tenant_id, info in TENANTS.items():
        if make_token(tenant_id) == token and info.get('is_active', True):
            return tenant_id
    return None


def get_tenant(authorization: str = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Απαιτείται σύνδεση")
    token = authorization[7:]
    tenant = verify_token(token)
    if not tenant:
        raise HTTPException(status_code=401, detail="Μη έγκυρο token")
    if tenant == SUPERADMIN_ID:
        raise HTTPException(status_code=403, detail="Super admin δεν έχει πρόσβαση εδώ")
    return tenant


def get_superadmin(authorization: str = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Απαιτείται σύνδεση")
    token = authorization[7:]
    if token != make_token(SUPERADMIN_ID):
        raise HTTPException(status_code=403, detail="Απαιτούνται δικαιώματα super admin")
    return SUPERADMIN_ID
