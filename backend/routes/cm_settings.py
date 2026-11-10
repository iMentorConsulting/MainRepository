import json
from typing import List, Any
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


SETTING_KEY_WORK_STATUSES = "work_statuses"
SETTING_KEY_DESCRIPTIONS = "descriptions"
SETTING_KEY_SOURCE_REFERRALS = "source_referrals"

DEFAULT_WORK_STATUSES = [
    "ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ",
    "ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ",
    "ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
    "ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ",
]

DEFAULT_DESCRIPTIONS = [
    "Αίτηση & Συμβ. υποστήριξη για το πρόγραμμα ΔΥΠΑ 18-29",
    "Αίτηση & Συμβ. Υποστήριξη για το πρόγραμμα ΔΥΠΑ 30-59",
    "Αίτηση & Συμβ. υποστήριξη για το πρόγραμμα ΔΥΠΑ Πρόσληψης Προσωπικού",
    "Αίτηση & Συμβ. Υποστήριξη για το Ταμείο Μικροπιστώσεων",
    "Αίτηση & Συμβ. Υποστήριξη για Τραπεζική Χρηματοδότηση",
    "Αρχικός Έλεγχος Φακέλου - Πρόγραμμα Ανακαίνισης Παλαιών Κατοικιών",
    "ΜΕΤΡΗΤΑ",
    "Παρακολούθηση επενδυτικού σχεδίου Επιχειρώ Στερεά",
    "Παρακολούθηση επενδυτικού σχεδίου Πράσινη Παραγωγική Επένδυση ΜμΕ",
    "ΣΥΜΒΟΥΛΕΥΤΙΚΕΣ ΥΠΗΡΕΣΙΕΣ",
    "Συμβουλευτική υποστήριξη για την παρακολούθηση της υλοποίησης του επενδυτικού σχεδίου",
    "Συμβουλευτική Υποστήριξη για την Υποβολή Αίτησης Επενδυτικού Σχεδίου",
]

DEFAULT_SOURCE_REFERRALS = [
    "FACEBOOK", "GOOGLE", "LOGISTIS.I-MENTOR.GR", "NEWSLETTER",
    "TIKTOK", "WEBSITE", "ΣΥΣΤΑΣΗ", "ΤΗΛΕΦΩΝΟ", "ΥΦΙΣΤΑΜΕΝΟΣ ΠΕΛΑΤΗΣ",
]

_LIST_DEFAULTS = {
    SETTING_KEY_WORK_STATUSES: DEFAULT_WORK_STATUSES,
    SETTING_KEY_DESCRIPTIONS: DEFAULT_DESCRIPTIONS,
    SETTING_KEY_SOURCE_REFERRALS: DEFAULT_SOURCE_REFERRALS,
}

_ALLOWED_LIST_KEYS = set(_LIST_DEFAULTS.keys())


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


@router.get("/list/{key}")
def get_setting_list(key: str, db: Session = Depends(get_db)):
    if key not in _ALLOWED_LIST_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    return _get_or_default(db, key, _LIST_DEFAULTS[key])


@router.put("/list/{key}")
def put_setting_list(
    key: str,
    body: List[str],
    db: Session = Depends(get_db),
    current_user: CMUser = Depends(get_current_user),
):
    if key not in _ALLOWED_LIST_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    row = db.query(CMAppSetting).filter(CMAppSetting.key == key).first()
    if row is None:
        row = CMAppSetting(key=key, value=json.dumps(body, ensure_ascii=False))
        db.add(row)
    else:
        row.value = json.dumps(body, ensure_ascii=False)
    db.commit()
    return body


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
