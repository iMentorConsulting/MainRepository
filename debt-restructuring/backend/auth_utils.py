import os
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

SECRET_KEY = os.getenv("APP_SECRET_KEY", "CHANGE-THIS-BEFORE-PRODUCTION")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

_bearer = HTTPBearer(auto_error=False)


def create_access_token(employee: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": employee, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Απαιτείται σύνδεση")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        employee: str = payload.get("sub")
        if not employee:
            raise HTTPException(status_code=401, detail="Μη έγκυρο token")
        return employee
    except JWTError:
        raise HTTPException(status_code=401, detail="Μη έγκυρο ή ληγμένο token")


def require_admin(employee: str = Depends(get_current_user)) -> str:
    """Only HARIS (admin) — for backup/restore/export and other dangerous operations."""
    if (employee or "").upper() != "HARIS":
        raise HTTPException(status_code=403, detail="Μόνο ο διαχειριστής")
    return employee
