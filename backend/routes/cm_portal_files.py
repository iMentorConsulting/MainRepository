from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db, fmt_dt
from models_cases import CMPortalFile, CMCase
from auth_cases import get_current_user
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/cm/portal-documents", tags=["portal-files"])

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB


def _file_type(mime: str) -> str:
    if mime == "application/pdf":
        return "PDF"
    return "Word"


def _meta(f: CMPortalFile) -> dict:
    return {
        "id": f.id,
        "service_type": f.service_type,
        "original_filename": f.original_filename,
        "mime_type": f.mime_type,
        "file_type": _file_type(f.mime_type),
        "client_description": f.client_description,
        "client_instructions": f.client_instructions,
        "internal_notes": f.internal_notes,
        "uploaded_at": fmt_dt(f.uploaded_at),
    }


@router.get("")
def list_documents(
    service_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(CMPortalFile)
    if service_type:
        q = q.filter(CMPortalFile.service_type == service_type)
    files = q.order_by(CMPortalFile.service_type, CMPortalFile.uploaded_at).all()
    return [_meta(f) for f in files]


@router.get("/service-types")
def list_service_types(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return all distinct service_types that have at least one case."""
    rows = db.query(CMCase.service_type).filter(CMCase.service_type.isnot(None)).distinct().order_by(CMCase.service_type).all()
    return [r[0] for r in rows if r[0]]


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    service_type: str = Form(...),
    client_description: str = Form(...),
    client_instructions: Optional[str] = Form(None),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Επιτρεπτές μορφές: PDF, DOC, DOCX")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 15MB")

    pf = CMPortalFile(
        service_type=service_type,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(data),
        file_data=data,
        client_description=client_description,
        client_instructions=client_instructions,
        internal_notes=internal_notes,
        uploaded_at=datetime.utcnow(),
    )
    db.add(pf)
    db.commit()
    db.refresh(pf)
    return _meta(pf)


@router.post("/{file_id}/replace")
async def replace_document(
    file_id: int,
    file: UploadFile = File(...),
    client_description: Optional[str] = Form(None),
    client_instructions: Optional[str] = Form(None),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    old = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not old:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Επιτρεπτές μορφές: PDF, DOC, DOCX")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Μέγιστο μέγεθος αρχείου: 15MB")

    old.original_filename = file.filename
    old.mime_type = file.content_type
    old.file_size = len(data)
    old.file_data = data
    if client_description is not None:
        old.client_description = client_description
    if client_instructions is not None:
        old.client_instructions = client_instructions
    if internal_notes is not None:
        old.internal_notes = internal_notes
    old.uploaded_at = datetime.utcnow()
    db.commit()
    db.refresh(old)
    return _meta(old)


@router.put("/{file_id}")
def update_document_meta(
    file_id: int,
    client_description: Optional[str] = Form(None),
    client_instructions: Optional[str] = Form(None),
    internal_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pf = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    if client_description is not None:
        pf.client_description = client_description
    if client_instructions is not None:
        pf.client_instructions = client_instructions
    if internal_notes is not None:
        pf.internal_notes = internal_notes
    db.commit()
    db.refresh(pf)
    return _meta(pf)


@router.delete("/{file_id}")
def delete_document(
    file_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pf = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    db.delete(pf)
    db.commit()
    return {"ok": True}


@router.get("/{file_id}/download")
def download_document_admin(
    file_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pf = db.query(CMPortalFile).filter(CMPortalFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Αρχείο δεν βρέθηκε")
    return Response(
        content=pf.file_data,
        media_type=pf.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{pf.original_filename}"'},
    )
