# iMentor Finance — Backup Setup

## What gets backed up
Every day at **03:00 UTC** the app exports all database tables to a single JSON file
and uploads it to Google Drive → **iMentor Finance / Database Backups**.

Tables included: `income`, `expenses`, `customers`, `service_agreements`,
`list_items`, `recurring_expenses`, `commission_logs`.

The last **30** backups are kept; older files are deleted automatically.

Google Drive folder: https://drive.google.com/drive/folders/1D-BdHnXcdfGSX_H-fc6nWDtfivcU_6iO

---

## One-time Google Cloud setup (needed once, ~10 min)

### 1. Create a Service Account
1. Go to https://console.cloud.google.com/
2. Select (or create) any project
3. **APIs & Services → Enable APIs** → enable **Google Drive API**
4. **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `imentor-backup`
   - Role: none needed at project level
5. Open the new service account → **Keys → Add Key → JSON** → download

### 2. Share the Drive folder with the service account
Open the downloaded JSON and copy the `client_email` value (looks like
`imentor-backup@your-project.iam.gserviceaccount.com`).

In Google Drive, right-click the **Database Backups** folder →
**Share** → paste the email → **Editor**.

### 3. Add the key to Railway
Encode the JSON key file as base64:
```bash
base64 -i service-account-key.json | tr -d '\n'
```
In Railway → your service → **Variables**:
```
GOOGLE_SERVICE_ACCOUNT_KEY=<paste the base64 string>
```

That's it. The next 03:00 UTC run will upload to Drive automatically.

---

## Manual backup

### From the app UI
Settings page → **Backup Δεδομένων** panel → "Αποστολή στο Google Drive"

### From the command line (local dev)
```bash
cd imentor-finance/backend
DATABASE_URL=<railway-url> GOOGLE_SERVICE_ACCOUNT_KEY=<base64> npm run backup
```

### Download-only (no Drive)
Settings page → "Λήψη JSON Backup" downloads the file directly in the browser.
Or hit the API directly:
```
GET /api/backup/export   (requires auth token)
```

---

## Restore from backup

```bash
# Install jq if needed: brew install jq / apt install jq
cat imentor-finance-backup-YYYY-MM-DDTHH-MM-SS.json | jq '.income | length'

# The JSON structure mirrors the database tables exactly.
# Use the /api/import endpoint or restore via psql pg_dump if needed.
```
