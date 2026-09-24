import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database import get_db
from models_cases import CMPipelineConfig, CMUser
from auth_cases import get_current_user
from pipelines import PIPELINES

router = APIRouter(prefix="/api/cm/admin/pipeline", tags=["pipeline"])


def _seed_if_missing(db: Session):
    for program, config in PIPELINES.items():
        if not db.query(CMPipelineConfig).filter(CMPipelineConfig.program_category == program).first():
            db.add(CMPipelineConfig(
                program_category=program,
                phases_json=json.dumps(config["phases"], ensure_ascii=False),
                extra_statuses_json=json.dumps(config.get("extra_statuses", []), ensure_ascii=False),
            ))
    db.commit()


def _row_to_dict(row: CMPipelineConfig) -> dict:
    return {
        "program_category": row.program_category,
        "phases": json.loads(row.phases_json),
        "extra_statuses": json.loads(row.extra_statuses_json or "[]"),
        "status_descriptions": json.loads(row.status_descriptions_json or "{}"),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_pipeline_config(program_category: str, db: Session) -> dict:
    """Return pipeline config from DB, seeding from defaults if needed."""
    _seed_if_missing(db)
    row = db.query(CMPipelineConfig).filter(CMPipelineConfig.program_category == program_category).first()
    if row:
        return _row_to_dict(row)
    return PIPELINES.get(program_category, {"phases": [], "extra_statuses": []})


def get_all_pipeline_configs(db: Session) -> dict:
    """Return all pipeline configs as a dict keyed by program_category."""
    _seed_if_missing(db)
    rows = db.query(CMPipelineConfig).all()
    result = {}
    for row in rows:
        d = _row_to_dict(row)
        result[row.program_category] = {
            "label": PIPELINES.get(row.program_category, {}).get("label", row.program_category),
            "phases": d["phases"],
            "extra_statuses": d["extra_statuses"],
            "status_descriptions": d["status_descriptions"],
        }
    return result


@router.get("")
def list_pipelines(
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    return get_all_pipeline_configs(db)


@router.get("/{program}")
def get_pipeline(
    program: str,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    _seed_if_missing(db)
    row = db.query(CMPipelineConfig).filter(CMPipelineConfig.program_category == program).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return _row_to_dict(row)


class PhaseSchema(BaseModel):
    id: str
    label: str
    color: str
    statuses: List[str]


class PipelineUpdate(BaseModel):
    phases: List[PhaseSchema]
    extra_statuses: Optional[List[str]] = []
    status_descriptions: Optional[dict] = {}


@router.put("/{program}")
def update_pipeline(
    program: str,
    req: PipelineUpdate,
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    _seed_if_missing(db)
    row = db.query(CMPipelineConfig).filter(CMPipelineConfig.program_category == program).first()
    if not row:
        row = CMPipelineConfig(program_category=program)
        db.add(row)

    row.phases_json = json.dumps([p.dict() for p in req.phases], ensure_ascii=False)
    row.extra_statuses_json = json.dumps(req.extra_statuses or [], ensure_ascii=False)
    row.status_descriptions_json = json.dumps(req.status_descriptions or {}, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)
