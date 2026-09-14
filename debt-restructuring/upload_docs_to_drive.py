"""
Standalone script — uploads the instructions file to Google Drive.
Run this locally without needing Railway or the web app.

Requirements (install once):
  pip install google-auth google-api-python-client

Usage:
  python upload_docs_to_drive.py
"""

import json
import io
import os

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
# Paste the full contents of GOOGLE_SERVICE_ACCOUNT_JSON here (between the ''')
SERVICE_ACCOUNT_JSON = """
PASTE_YOUR_GOOGLE_SERVICE_ACCOUNT_JSON_HERE
"""

# The Google Drive folder ID (from the URL of the backup folder)
FOLDER_ID = "1OTfm8IERPAqvEiujRYV2qFgubg2-hZUC"

# Your Google account email (the one that owns the Drive folder)
IMPERSONATE_EMAIL = "PASTE_YOUR_SMTP_USER_EMAIL_HERE"

# Path to the instructions file (same folder as this script)
DOCS_FILE = os.path.join(os.path.dirname(__file__), "ΟΔΗΓΙΕΣ-ΕΓΚΑΤΑΣΤΑΣΗΣ-ΚΑΙ-ΑΠΟΚΑΤΑΣΤΑΣΗΣ.txt")
# ──────────────────────────────────────────────────────────────────────────────


def main():
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload

    print("Connecting to Google Drive...")
    creds = Credentials.from_service_account_info(
        json.loads(SERVICE_ACCOUNT_JSON.strip()),
        scopes=["https://www.googleapis.com/auth/drive"],
    ).with_subject(IMPERSONATE_EMAIL)
    svc = build("drive", "v3", credentials=creds, cache_discovery=False)

    filename = "ΟΔΗΓΙΕΣ-BACKUP-RESTORE.txt"

    # Delete existing file to avoid duplicates
    existing = svc.files().list(
        q=f"'{FOLDER_ID}' in parents and name='{filename}' and trashed=false",
        fields="files(id,name)",
    ).execute().get("files", [])
    for f in existing:
        svc.files().delete(fileId=f["id"]).execute()
        print(f"Deleted old version: {f['name']}")

    # Upload new file
    with open(DOCS_FILE, "rb") as f:
        content = f.read()

    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype="text/plain; charset=utf-8",
        resumable=False,
    )
    uploaded = svc.files().create(
        body={"name": filename, "parents": [FOLDER_ID]},
        media_body=media,
        fields="id,name",
    ).execute()

    print(f"\n✓ Uploaded: {uploaded['name']}")
    print(f"  File ID: {uploaded['id']}")
    print(f"  View at: https://drive.google.com/file/d/{uploaded['id']}/view")


if __name__ == "__main__":
    main()
