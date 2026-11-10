import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMAppSetting, CMUser
from auth_cases import get_current_user

router = APIRouter(prefix="/api/cm/settings", tags=["cm_settings"])

DEFAULT_SERVICE_TYPE_GROUPS = [
    {"label": "ΣΥΜΒΟΥΛΕΥΤΙΚΗ", "items": ["ΣΥΜΒΟΥΛΕΥΤΙΚΗ"]},
    {"label": "ΔΑΝΕΙΑ", "items": ["BUSINESS PLAN", "ΔΑΝΕΙΟΔΟΤΗΣΕΙΣ", "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", "ΤΕΠΙΧ"]},
    {
        "label": "ΕΠΙΧΟΡΗΓΗΣΕΙΣ",
        "items": [
            "ΔΥΠΑ 18-29", "ΔΥΠΑ ΠΡΟΣΛΗΨΗΣ ΠΡΟΣΩΠΙΚΟΥ", "ΕΠΙΧΕΙΡΩ ΠΡΑΣΙΝΑ ΚΡΗΤΗ",
            "ΕΠΙΧΕΙΡΩ ΣΤΕΡΕΑ", "ΕΣΠΑ ΚΑΤΑΔΥΤΙΚΟΥ ΤΟΥΡΙΣΜΟΥ", "ΕΣΠΑ ΜΑΚΕΔΟΝΙΑΣ",
            "ΕΣΠΑ ΝΟΤΙΟΥ ΑΙΓΑΙΟΥ", "ΕΣΠΑ ΠΤΥΧΙΟΥΧΩΝ", "ΕΣΠΑ ΤΟΥΡΙΣΜΟΣ 2024",
            "ΞΕΚΙΝΩ ΕΠΙΧΕΙΡΗΜΑΤΙΚΑ", "ΟΑΕΔ 30-59", "ΠΑΡΑΓΟΥΜΕ ΣΤΗΝ ΕΛΛΑΔΑ",
            "ΠΑΡΑΣΤΑΤΙΚΕΣ ΤΕΧΝΕΣ", "ΠΡΑΣΙΝΗ ΠΑΡΑΓΩΓΙΚΗ ΕΠΕΝΔΥΣΗ",
        ],
    },
]

SETTING_KEY_SERVICE_TYPES = "service_type_groups"


class ServiceGroup(BaseModel):
    label: str
    items: List[str]


def _get_or_default(db: Session, key: str, default):
    row = db.query(CMAppSetting).filter(CMAppSetting.key == key).first()
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except Exception:
        return default


@router.get("/service-types")
def get_service_types(db: Session = Depends(get_db)):
    return _get_or_default(db, SETTING_KEY_SERVICE_TYPES, DEFAULT_SERVICE_TYPE_GROUPS)


@router.put("/service-types")
def put_service_types(
    body: List[ServiceGroup],
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    data = [g.dict() for g in body]
    row = db.query(CMAppSetting).filter(CMAppSetting.key == SETTING_KEY_SERVICE_TYPES).first()
    if row is None:
        row = CMAppSetting(key=SETTING_KEY_SERVICE_TYPES, value=json.dumps(data, ensure_ascii=False))
        db.add(row)
    else:
        row.value = json.dumps(data, ensure_ascii=False)
    db.commit()
    return data
