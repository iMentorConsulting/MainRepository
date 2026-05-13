import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from models_cases import CMPortalFile, CMCase
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/cm/cases", tags=["portal-files"])

ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
MAX_FILES_PER_CASE = 10


def _file_meta(f: CMPortalFile) -> dict:
    ext = ALLOWED_MIME_TYPES.get(f.mime_type, "")
    file_type = ext.lstrip(".").upper() if ext else "ΑΓΝΩΣΤΟ"
    return {
        "id": f.id,
        "case_id": f.case_id,
        "original_filename": f.original_filename,
        "mime_type": f.mime_type,
        "file_type": file_type,
        "file_size": f.file_size,
        "client_description": f.client_description,
        "internal_notes": f.internal_notes,
        "replaces_id": f.replaces_id,
        "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
    }


@router.get("/{case_id}/portal-files")
def list_portal_files(case_id: int, db: Session = Depends(get_db)):
    files = (
        db.query(CMPortalFile)
        .filter(CMPortalFile.case_id == case_id)
        .order_by(CMPortalFile.uploaded_at.desc())
        .all()
    )
    return [_file_meta(f) for f in files]


@router.post("/{case_id}/portal-files")
async def upload_portal_file(
    case_id: int,
    file: UploadFile = File(...),
    client_description: str = Form(...),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    case = db.query(CMCase).filter(CMCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    count = db.query(CMPortalFile).filter(CMPortalFile.case_id == case_id).count()
    if count >= MAX_FILES_PER_CASE:
        raise HTTPException(status_code=400, detail=f"Μέγιστο όριο {MAX_FILES_PER_CASE} εγγράφων ανά υπόθεση")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Επιτρεπτές μορφές: PDF, DOC, DOCX")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 15MB")

    pf = CMPortalFile(
        case_id=case_id,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(data),
        file_data=data,
        client_description=client_description,
        internal_notes=internal_notes,
        uploaded_at=datetime.utcnow(),
    )
    db.add(pf)
    db.commit()
    db.refresh(pf)
    return _file_meta(pf)


@router.post("/{case_id}/portal-files/{file_id}/replace")
async def replace_portal_file(
    case_id: int,
    file_id: int,
    file: UploadFile = File(...),
    client_description: Optional[str] = Form(None),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    old = db.query(CMPortalFile).filter(
        CMPortalFile.id == file_id, CMPortalFile.case_id == case_id
    ).first()
    if not old:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Επιτρεπτές μορφές: PDF, DOC, DOCX")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 15MB")

    pf = CMPortalFile(
        case_id=case_id,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(data),
        file_data=data,
        client_description=client_description or old.client_description,
        internal_notes=internal_notes if internal_notes is not None else old.internal_notes,
        replaces_id=file_id,
        uploaded_at=datetime.utcnow(),
    )
    db.add(pf)
    # delete the old file to keep count stable
    db.delete(old)
    db.commit()
    db.refresh(pf)
    return _file_meta(pf)


@router.put("/{case_id}/portal-files/{file_id}")
def update_portal_file(
    case_id: int,
    file_id: int,
    client_description: Optional[str] = Form(None),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    pf = db.query(CMPortalFile).filter(
        CMPortalFile.id == file_id, CMPortalFile.case_id == case_id
    ).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    if client_description is not None:
        pf.client_description = client_description
    if internal_notes is not None:
        pf.internal_notes = internal_notes
    db.commit()
    db.refresh(pf)
    return _file_meta(pf)


@router.delete("/{case_id}/portal-files/{file_id}")
def delete_portal_file(case_id: int, file_id: int, db: Session = Depends(get_db)):
    pf = db.query(CMPortalFile).filter(
        CMPortalFile.id == file_id, CMPortalFile.case_id == case_id
    ).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    db.delete(pf)
    db.commit()
    return {"ok": True}


@router.get("/{case_id}/portal-files/{file_id}/download")
def download_portal_file(case_id: int, file_id: int, db: Session = Depends(get_db)):
    pf = db.query(CMPortalFile).filter(
        CMPortalFile.id == file_id, CMPortalFile.case_id == case_id
    ).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return Response(
        content=pf.file_data,
        media_type=pf.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{pf.original_filename}"'},
    )
