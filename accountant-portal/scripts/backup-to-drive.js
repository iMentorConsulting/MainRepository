#!/usr/bin/env node
/**
 * Daily PostgreSQL backup to Google Drive.
 * Env vars needed:
 *   DATABASE_URL              — postgres connection string
 *   GOOGLE_SERVICE_ACCOUNT_KEY — JSON string of service account credentials
 *   GOOGLE_DRIVE_FOLDER_ID    — target folder ID on shared Google Drive
 */

const { execSync } = require('child_process')
const { google } = require('googleapis')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const dbUrl = process.env.DATABASE_URL
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!dbUrl || !serviceAccountKey || !folderId) {
    console.error('Missing required env vars: DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID')
    process.exit(1)
  }

  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `logistis-backup-${timestamp}.sql.gz`
  const tmpPath = path.join(os.tmpdir(), filename)

  console.log(`[backup] Starting backup → ${filename}`)

  // pg_dump + gzip
  try {
    execSync(`pg_dump "${dbUrl}" | gzip > "${tmpPath}"`, { stdio: 'pipe' })
    console.log(`[backup] Dump complete: ${tmpPath}`)
  } catch (err) {
    console.error('[backup] pg_dump failed:', err.message)
    process.exit(1)
  }

  // Auth
  const credentials = JSON.parse(serviceAccountKey)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
  const drive = google.drive({ version: 'v3', auth })

  // Upload
  try {
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/gzip',
        body: fs.createReadStream(tmpPath),
      },
    })
    console.log(`[backup] Uploaded to Google Drive: ${res.data.id}`)
  } catch (err) {
    console.error('[backup] Upload failed:', err.message)
    fs.unlinkSync(tmpPath)
    process.exit(1)
  }

  fs.unlinkSync(tmpPath)

  // Delete backups older than 30 days from folder
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const list = await drive.files.list({
      q: `'${folderId}' in parents and name contains 'logistis-backup-' and createdTime < '${cutoff}'`,
      fields: 'files(id, name)',
    })
    const old = list.data.files || []
    for (const f of old) {
      await drive.files.delete({ fileId: f.id })
      console.log(`[backup] Deleted old backup: ${f.name}`)
    }
  } catch (err) {
    console.warn('[backup] Cleanup warning:', err.message)
  }

  console.log('[backup] Done.')
}

main().catch(err => {
  console.error('[backup] Fatal:', err)
  process.exit(1)
})
