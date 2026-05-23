"""Google Drive storage helpers for case documents and portal templates."""

import io
import logging
import os
import re

_log = logging.getLogger(__name__)

_SIMPLE_UPLOAD_MAX = 5 * 1024 * 1024  # 5 MB — use simple upload below this


def _build_service():
    """Build and return a Google Drive API service using service account credentials."""
    import json
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON env var not set")

    info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _docs_root() -> str:
    """Return the root folder ID for documents from env var."""
    folder_id = os.environ.get("GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID")
    if not folder_id:
        raise RuntimeError("GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID env var not set")
    return folder_id.strip()


def _safe_name(name: str) -> str:
    """Strip characters not allowed in Drive file/folder names."""
    return re.sub(r'[/\\:*?"<>|]', "", name).strip()


def _get_or_create_folder(svc, parent_id: str, name: str) -> str:
    """Return the Drive folder ID for `name` under `parent_id`, creating if missing."""
    safe = _safe_name(name)
    escaped = safe.replace("'", "\\'")
    query = (
        f"name = '{escaped}'"
        f" and '{parent_id}' in parents"
        f" and mimeType = 'application/vnd.google-apps.folder'"
        f" and trashed = false"
    )
    resp = svc.files().list(
        q=query,
        fields="files(id, name)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]

    folder = svc.files().create(
        body={
            "name": safe,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return folder["id"]


def _upload_media(svc, meta: dict, content: bytes, mime_type: str) -> str:
    """Upload file content and return Drive file_id.

    Uses simple (single-request) upload for files ≤ 5 MB,
    resumable chunked upload for larger files.
    """
    from googleapiclient.http import MediaIoBaseUpload

    if len(content) <= _SIMPLE_UPLOAD_MAX:
        # Single multipart request — no looping needed
        media = MediaIoBaseUpload(
            io.BytesIO(content),
            mimetype=mime_type or "application/octet-stream",
            resumable=False,
        )
        result = svc.files().create(
            body=meta,
            media_body=media,
            fields="id",
            supportsAllDrives=True,
        ).execute()
    else:
        # Resumable upload — must use next_chunk() loop
        media = MediaIoBaseUpload(
            io.BytesIO(content),
            mimetype=mime_type or "application/octet-stream",
            chunksize=4 * 1024 * 1024,
            resumable=True,
        )
        request = svc.files().create(
            body=meta,
            media_body=media,
            fields="id",
            supportsAllDrives=True,
        )
        response = None
        while response is None:
            _, response = request.next_chunk()
        result = response

    return result["id"]


def upload_case_document(
    content: bytes,
    filename: str,
    mime_type: str,
    program_category: str,
    case_id: int,
    client_name: str,
) -> str:
    """Upload a case document to Drive and return its file_id.

    Path: {root}/{program_category}/{case_id:04d} - {client_name}/{filename}
    """
    svc = _build_service()
    root = _docs_root()

    cat_folder = _get_or_create_folder(svc, root, program_category or "Γενικά")
    case_folder_name = f"{case_id:04d} - {_safe_name(client_name)}"
    case_folder = _get_or_create_folder(svc, cat_folder, case_folder_name)

    file_id = _upload_media(
        svc,
        meta={"name": _safe_name(filename), "parents": [case_folder]},
        content=content,
        mime_type=mime_type,
    )
    _log.info("Uploaded case doc to Drive: case=%s file=%s drive_id=%s", case_id, filename, file_id)
    return file_id


def upload_portal_template(
    content: bytes,
    filename: str,
    mime_type: str,
    service_type: str,
) -> str:
    """Upload a portal template to Drive and return its file_id.

    Path: {root}/Πύλη - Templates/{service_type}/{filename}
    """
    svc = _build_service()
    root = _docs_root()

    templates_folder = _get_or_create_folder(svc, root, "Πύλη - Templates")
    svc_folder = _get_or_create_folder(svc, templates_folder, _safe_name(service_type))

    file_id = _upload_media(
        svc,
        meta={"name": _safe_name(filename), "parents": [svc_folder]},
        content=content,
        mime_type=mime_type,
    )
    _log.info("Uploaded portal template to Drive: service=%s file=%s drive_id=%s", service_type, filename, file_id)
    return file_id


def download_file(file_id: str) -> bytes:
    """Download a file from Drive by its file_id and return raw bytes."""
    from googleapiclient.http import MediaIoBaseDownload

    svc = _build_service()
    request = svc.files().get_media(
        fileId=file_id,
        supportsAllDrives=True,
    )
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request, chunksize=4 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def delete_file(file_id: str) -> None:
    """Delete a file from Drive. Silently ignores all errors."""
    try:
        svc = _build_service()
        svc.files().delete(
            fileId=file_id,
            supportsAllDrives=True,
        ).execute()
        _log.info("Deleted Drive file: %s", file_id)
    except Exception as exc:
        _log.warning("Drive delete failed for %s: %s", file_id, exc)

