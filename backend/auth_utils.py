import hashlib
import os
from fastapi import Header, HTTPException

SECRET = os.getenv("AUTH_SECRET", "booking-secret-key-2024")

TENANTS = {
    'evaivoni': {'name': 'EVA-IVONI APARTMENTS', 'password': 'evaivoni'},
    'vieverde': {'name': 'VIEVERDE VILLAS', 'password': 'vieverde123'},
}


def make_token(tenant_id: str) -> str:
    return hashlib.sha256(f"{tenant_id}:{SECRET}".encode()).hexdigest()


def verify_token(token: str):
    for tenant_id in TENANTS:
        if make_token(tenant_id) == token:
            return tenant_id
    return None


def get_tenant(authorization: str = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Απαιτείται σύνδεση")
    token = authorization[7:]
    tenant = verify_token(token)
    if not tenant:
        raise HTTPException(status_code=401, detail="Μη έγκυρο token")
    return tenant
