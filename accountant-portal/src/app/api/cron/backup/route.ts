import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.DATABASE_URL
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!dbUrl || !serviceAccountKey || !folderId) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `logistis-backup-${timestamp}.sql.gz`
  const tmpPath = path.join(os.tmpdir(), filename)

  try {
    execSync(`pg_dump "${dbUrl}" | gzip > "${tmpPath}"`, { stdio: 'pipe' })
  } catch (err: any) {
    return NextResponse.json({ error: 'pg_dump failed', detail: err.message }, { status: 500 })
  }

  try {
    const credentials = JSON.parse(serviceAccountKey)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    const drive = google.drive({ version: 'v3', auth })

    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: 'application/gzip', body: fs.createReadStream(tmpPath) },
    })

    fs.unlinkSync(tmpPath)

    // Prune backups older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const list = await drive.files.list({
      q: `'${folderId}' in parents and name contains 'logistis-backup-' and createdTime < '${cutoff}'`,
      fields: 'files(id, name)',
    })
    const pruned: string[] = []
    for (const f of (list.data.files || [])) {
      await drive.files.delete({ fileId: f.id! })
      pruned.push(f.name!)
    }

    return NextResponse.json({ ok: true, fileId: res.data.id, filename, pruned })
  } catch (err: any) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    return NextResponse.json({ error: 'Drive upload failed', detail: err.message }, { status: 500 })
  }
}
