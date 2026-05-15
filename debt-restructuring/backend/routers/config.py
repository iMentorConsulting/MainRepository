import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import AppConfig

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/pricing")
def get_pricing_config(db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "pricing").first()
    if row and row.value:
        return json.loads(row.value)
    return {}


@router.put("/pricing")
def save_pricing_config(data: dict, db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "pricing").first()
    if row:
        row.value = json.dumps(data)
    else:
        db.add(AppConfig(key="pricing", value=json.dumps(data)))
    db.commit()
    return data
