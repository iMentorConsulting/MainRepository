import json
from typing import Any, List
from fastapi import APIRouter, Depends, Body
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
def save_pricing_config(data: dict = Body(...), db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "pricing").first()
    if row:
        row.value = json.dumps(data)
    else:
        db.add(AppConfig(key="pricing", value=json.dumps(data)))
    db.commit()
    return data


@router.get("/lead-templates")
def get_lead_templates(db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "lead_templates").first()
    if row and row.value:
        return json.loads(row.value)
    return []


@router.put("/lead-templates")
def save_lead_templates(data: List[Any] = Body(...), db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "lead_templates").first()
    if row:
        row.value = json.dumps(data)
    else:
        db.add(AppConfig(key="lead_templates", value=json.dumps(data)))
    db.commit()
    return data


@router.get("/lead-links")
def get_lead_links(db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "lead_links").first()
    if row and row.value:
        return json.loads(row.value)
    return []


@router.put("/lead-links")
def save_lead_links(data: List[Any] = Body(...), db: Session = Depends(get_db)):
    row = db.query(AppConfig).filter(AppConfig.key == "lead_links").first()
    if row:
        row.value = json.dumps(data)
    else:
        db.add(AppConfig(key="lead_links", value=json.dumps(data)))
    db.commit()
    return data
