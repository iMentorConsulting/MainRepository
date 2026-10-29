"""
CRUD for editable message templates used in the Leads send modal.

GET    /api/cm/message-templates          — list (all authenticated users)
POST   /api/cm/message-templates          — create (admin)
PUT    /api/cm/message-templates/{id}     — update (admin)
DELETE /api/cm/message-templates/{id}     — delete (admin)
POST   /api/cm/message-templates/seed     — seed defaults if table is empty (admin)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_cases import get_current_user
from database import get_db
from models_cases import CMMessageTemplate, CMUser

router = APIRouter(prefix="/api/cm/message-templates", tags=["message-templates"])

_DEFAULT_TEMPLATES = [
    {"label": "👋 Πρώτη επικοινωνία", "sort_order": 0, "programs": None,
     "text": "Καλησπέρα σας! Είμαστε από την iMentor Consulting και επικοινωνούμε σχετικά με το αίτημά σας. Θα θέλαμε να σας ενημερώσουμε για τα προγράμματα χρηματοδότησης που ταιριάζουν στη δραστηριότητά σας. Πότε θα ήταν βολικό να μιλήσουμε;"},
    {"label": "📞 Υπενθύμιση κλήσης", "sort_order": 1, "programs": None,
     "text": "Καλησπέρα! Προσπαθήσαμε να επικοινωνήσουμε μαζί σας χωρίς αποτέλεσμα. Παρακαλούμε ενημερώστε μας για κάποια βολική ώρα να σας καλέσουμε σχετικά με τα διαθέσιμα προγράμματα χρηματοδότησης."},
    {"label": "📄 Αίτηση εγγράφων", "sort_order": 2, "programs": None,
     "text": "Καλησπέρα! Για να προχωρήσουμε με την αίτησή σας, χρειαζόμαστε τα παρακάτω έγγραφα:\n• Εκκαθαριστικό τελευταίου έτους\n• Άδεια λειτουργίας επιχείρησης\n• Καταστατικό (για εταιρείες)\n\nΠαρακαλούμε αποστείλτε τα το συντομότερο δυνατό."},
    {"label": "✅ Έγκριση αίτησης", "sort_order": 3, "programs": None,
     "text": "Καλησπέρα! Χαρούμενοι να σας ανακοινώσουμε ότι η αίτησή σας εγκρίθηκε! Θα επικοινωνήσουμε σύντομα για τα επόμενα βήματα."},
    {"label": "⏰ Υπενθύμιση προθεσμίας", "sort_order": 4, "programs": None,
     "text": "Καλησπέρα! Σας υπενθυμίζουμε ότι η προθεσμία υποβολής των εγγράφων για το πρόγραμμα πλησιάζει. Παρακαλούμε επικοινωνήστε μαζί μας το συντομότερο για να ολοκληρώσουμε τη διαδικασία."},
    {"label": "📋 Ενημέρωση προόδου", "sort_order": 5, "programs": None,
     "text": "Καλησπέρα! Θέλαμε να σας ενημερώσουμε για την πρόοδο της αίτησής σας. Η υπόθεσή σας βρίσκεται σε επεξεργασία και θα σας ειδοποιήσουμε άμεσα για οποιαδήποτε εξέλιξη."},
    {"label": "💶 Μικροπιστώσεις", "sort_order": 6, "programs": ["ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"],
     "text": "Καλησπέρα! Σας επικοινωνούμε για το πρόγραμμα Μικροπιστώσεων. Παρέχει δάνειο έως €25.000 με εγγύηση του δημοσίου, χωρίς εξασφαλίσεις. Ιδανικό για νέες και μικρές επιχειρήσεις. Θέλετε να μάθετε περισσότερα;"},
    {"label": "🏠 Ανακαινίζω", "sort_order": 7, "programs": ["ΑΝΑΚΑΙΝΙΖΩ"],
     "text": "Καλησπέρα! Σχετικά με το πρόγραμμα «Ανακαινίζω — Νοικιάζω / Αξιοποιώ». Επιδοτείται το 40% των δαπανών ανακαίνισης. Θα θέλατε να κλείσουμε ένα ραντεβού για αναλυτική ενημέρωση;"},
    {"label": "🎓 ΔΥΠΑ", "sort_order": 8, "programs": ["ΔΥΠΑ", "ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ"],
     "text": "Καλησπέρα! Σχετικά με το πρόγραμμα ΔΥΠΑ. Επιδοτεί την απασχόληση νέων ανέργων με κάλυψη του μισθολογικού κόστους για 12 μήνες. Ενδείκνυται για επιχειρήσεις που σχεδιάζουν προσλήψεις. Ενδιαφέρεστε να ενημερωθείτε;"},
    {"label": "📊 ΕΣΠΑ", "sort_order": 9, "programs": ["ΕΣΠΑ"],
     "text": "Καλησπέρα! Σχετικά με τα προγράμματα ΕΣΠΑ για επιχειρήσεις. Επιχορήγηση έως 50% για επενδύσεις σε εξοπλισμό, λογισμικό και αναβάθμιση υποδομών. Θα θέλατε να αξιολογήσουμε μαζί την επιλεξιμότητα της επιχείρησής σας;"},
]


class TemplateIn(BaseModel):
    label: str
    text: str
    programs: Optional[List[str]] = None
    sort_order: int = 0
    enabled: bool = True


def _to_dict(t: CMMessageTemplate) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "text": t.text,
        "programs": t.programs,
        "sort_order": t.sort_order,
        "enabled": t.enabled,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_templates(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(CMMessageTemplate).filter(CMMessageTemplate.enabled == True).order_by(
        CMMessageTemplate.sort_order, CMMessageTemplate.id
    ).all()
    # If table is empty seed defaults automatically
    if not rows:
        _seed(db)
        rows = db.query(CMMessageTemplate).filter(CMMessageTemplate.enabled == True).order_by(
            CMMessageTemplate.sort_order, CMMessageTemplate.id
        ).all()
    return [_to_dict(r) for r in rows]


@router.get("/all")
def list_all_templates(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # All authenticated users can list all templates
    rows = db.query(CMMessageTemplate).order_by(
        CMMessageTemplate.sort_order, CMMessageTemplate.id
    ).all()
    return [_to_dict(r) for r in rows]


@router.post("")
def create_template(
    body: TemplateIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    t = CMMessageTemplate(**body.dict())
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_dict(t)


@router.put("/{tid}")
def update_template(
    tid: int,
    body: TemplateIn,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # All authenticated users can edit templates
    t = db.query(CMMessageTemplate).filter(CMMessageTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404)
    for k, v in body.dict().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return _to_dict(t)


@router.delete("/{tid}")
def delete_template(
    tid: int,
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    t = db.query(CMMessageTemplate).filter(CMMessageTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404)
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/seed")
def seed_templates(
    current_user: CMUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    count = _seed(db)
    return {"seeded": count}


def _seed(db: Session) -> int:
    added = 0
    for d in _DEFAULT_TEMPLATES:
        t = CMMessageTemplate(**d)
        db.add(t)
        added += 1
    db.commit()
    return added
