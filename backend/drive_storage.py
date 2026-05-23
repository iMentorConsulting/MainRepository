"""Google Drive storage helpers for case documents and portal templates."""

import io
import os
import re


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
    return folder_id


def _safe_name(name: str) -> str:
    """Strip characters not allowed in Drive file/folder names."""
    return re.sub(r'[/\\:*?"<>|]', "", name)


def _get_or_create_folder(svc, parent_id: str, name: str) -> str:
    """Return the Drive folder ID for `name` under `parent_id`, creating if missing."""
    safe = _safe_name(name)
    # Search for existing folder
    query = (
        f"name = '{safe.replace(chr(39), chr(92)+chr(39))}'"
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

    # Create the folder
    meta = {
        "name": safe,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = svc.files().create(
        body=meta,
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return folder["id"]


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
    from googleapiclient.http import MediaIoBaseUpload

    svc = _build_service()
    root = _docs_root()

    # Build folder hierarchy
    cat_folder = _get_or_create_folder(svc, root, _safe_name(program_category))
    case_folder_name = f"{case_id:04d} - {_safe_name(client_name)}"
    case_folder = _get_or_create_folder(svc, cat_folder, case_folder_name)

    safe_filename = _safe_name(filename)
    meta = {
        "name": safe_filename,
        "parents": [case_folder],
    }
    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype=mime_type or "application/octet-stream",
        chunksize=4 * 1024 * 1024,
        resumable=True,
    )
    file = svc.files().create(
        body=meta,
        media_body=media,
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return file["id"]


def upload_portal_template(
    content: bytes,
    filename: str,
    mime_type: str,
    service_type: str,
) -> str:
    """Upload a portal template to Drive and return its file_id.

    Path: {root}/Πύλη - Templates/{service_type}/{filename}
    """
    from googleapiclient.http import MediaIoBaseUpload

    svc = _build_service()
    root = _docs_root()

    templates_folder = _get_or_create_folder(svc, root, "Πύλη - Templates")
    svc_folder = _get_or_create_folder(svc, templates_folder, _safe_name(service_type))

    safe_filename = _safe_name(filename)
    meta = {
        "name": safe_filename,
        "parents": [svc_folder],
    }
    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype=mime_type or "application/octet-stream",
        chunksize=4 * 1024 * 1024,
        resumable=True,
    )
    file = svc.files().create(
        body=meta,
        media_body=media,
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return file["id"]


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
    except Exception:
        pass
