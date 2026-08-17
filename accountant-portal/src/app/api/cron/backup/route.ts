import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const KEEP_BACKUPS = 20 // days to keep (each night = 1 DB file + 1 code file)
const BACKUP_PREFIX = 'logistis-backup-'
const CODE_PREFIX = 'logistis-code-'
const MIN_HOURS_BETWEEN = 20 // auto mode: skip if the newest backup is fresher than this
// Auto mode only fires inside this night window (Athens time)
const NIGHT_WINDOW_START = 3 // 03:00
const NIGHT_WINDOW_END = 6 // 06:00

function getDrive(): { drive: ReturnType<typeof google.drive> } | { error: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return { error: 'GOOGLE_SERVICE_ACCOUNT_KEY is not set' }

  // Accept plain JSON or base64-encoded JSON; tolerate stray wrapping quotes
  let credentials: any = null
  const candidates = [
    raw,
    raw.trim().replace(/^['"]|['"]$/g, ''),
    (() => { try { return Buffer.from(raw, 'base64').toString('utf-8') } catch { return '' } })(),
  ]
  for (const c of candidates) {
    if (!c) continue
    try { credentials = JSON.parse(c); break } catch {}
  }
  if (!credentials?.client_email || !credentials?.private_key) {
    return { error: `GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON (starts with: ${raw.slice(0, 30)}...). Paste the service-account JSON as a single line, or base64-encode it.` }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return { drive: google.drive({ version: 'v3', auth }) }
}

// pg_dump is unavailable in the Railway nixpacks image. The JSON-dump-of-all-
// tables fallback caused OOM crashes (GemiLookup alone is hundreds of MB).
//
// Instead we export only the unsubscriber list — the one piece of data that
// is legally/ethically critical and cannot be reconstructed from the GEMI API.
// GemiLookup business records are re-importable via the admin CSV export.
async function dumpUnsubscribersGz(): Promise<Buffer> {
  const rows = await prisma.gemiLookup.findMany({
    where: { unsubscribedAt: { not: null } },
    select: { id: true, afm: true, email: true, phone: true, unsubscribedAt: true },
    orderBy: { unsubscribedAt: 'asc' },
  })
  const lines = [
    'id,afm,email,phone,unsubscribedAt',
    ...rows.map(r =>
      [r.id, r.afm, r.email ?? '', r.phone ?? '', r.unsubscribedAt!.toISOString()]
        .map(v => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v))
        .join(',')
    ),
  ]
  return zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf-8'))
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || (headerSecret !== cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'Missing GDRIVE_BACKUP_FOLDER_ID' }, { status: 500 })
  }
  const driveResult = getDrive()
  if ('error' in driveResult) {
    console.error('[Backup]', driveResult.error)
    return NextResponse.json({ error: driveResult.error }, { status: 500 })
  }
  const drive = driveResult.drive

  // Auto mode (called from the 5-minute cron): run once per night, only
  // inside the night window (Athens time), and only if the newest backup
  // in Drive is older than MIN_HOURS_BETWEEN hours.
  const auto = request.nextUrl.searchParams.get('auto') === '1'
  if (auto) {
    const athensHour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Athens' }).format(new Date())
    )
    if (athensHour < NIGHT_WINDOW_START || athensHour >= NIGHT_WINDOW_END) {
      return NextResponse.json({ ok: true, skipped: true, reason: `outside night window (Athens hour: ${athensHour})` })
    }
    const newest = await drive.files.list({
      q: `'${folderId}' in parents and name contains '${BACKUP_PREFIX}' and trashed = false`,
      orderBy: 'createdTime desc',
      pageSize: 1,
      fields: 'files(name, createdTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const newestTime = newest.data.files?.[0]?.createdTime
    if (newestTime && Date.now() - new Date(newestTime).getTime() < MIN_HOURS_BETWEEN * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, skipped: true, newestBackup: newestTime })
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const results: Record<string, unknown> = {}

  // ── 1. UNSUBSCRIBER LIST (critical safety backup) ────────────────────
  // pg_dump is not available in the Railway nixpacks image. A full JSON dump
  // of all tables caused OOM crashes. We back up only the unsubscriber list —
  // the one dataset that is legally critical and cannot be reconstructed.
  // GemiLookup business records are re-importable via the admin CSV export.
  const dbFileName = `${BACKUP_PREFIX}${timestamp}-unsubscribers.csv.gz`
  const dbFilePath = path.join(os.tmpdir(), dbFileName)
  let dbExported = false
  try {
    const gz = await dumpUnsubscribersGz()
    fs.writeFileSync(dbFilePath, gz)
    results.dbMethod = 'unsubscribers-csv'
    dbExported = true
  } catch (err) {
    console.error('[Backup] unsubscriber export failed:', err instanceof Error ? err.message : err)
    results.dbError = err instanceof Error ? err.message : String(err)
  }

  if (dbExported) {
    try {
      const upload = await drive.files.create({
        requestBody: { name: dbFileName, parents: [folderId] },
        media: { mimeType: 'application/gzip', body: fs.createReadStream(dbFilePath) },
        supportsAllDrives: true,
        fields: 'id',
      })
      results.dbFile = dbFileName
      results.dbFileId = upload.data.id
      results.dbSizeMB = Math.round(fs.statSync(dbFilePath).size / 1024 / 102.4) / 10
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('[Backup] DB upload failed:', detail)
      if (fs.existsSync(dbFilePath)) fs.unlinkSync(dbFilePath)
      return NextResponse.json({ error: 'Drive upload failed', detail }, { status: 500 })
    }
    fs.unlinkSync(dbFilePath)
  }

  // ── 2. CODE + BUILD BACKUP ────────────────────────────────────────────
  // Archive the deployed application directory (source + built .next output),
  // excluding node_modules (reinstallable) and caches.
  const codeFileName = `${CODE_PREFIX}${timestamp}.tar.gz`
  const codeFilePath = path.join(os.tmpdir(), codeFileName)
  try {
    const appDir = process.cwd()
    execSync(
      `tar -czf "${codeFilePath}" --exclude=node_modules --exclude=.next/cache --exclude=.git -C "${appDir}" .`,
      { stdio: 'pipe', timeout: 180_000 },
    )
    const upload = await drive.files.create({
      requestBody: { name: codeFileName, parents: [folderId] },
      media: { mimeType: 'application/gzip', body: fs.createReadStream(codeFilePath) },
      supportsAllDrives: true,
      fields: 'id',
    })
    results.codeFile = codeFileName
    results.codeFileId = upload.data.id
    results.codeSizeMB = Math.round(fs.statSync(codeFilePath).size / 1024 / 102.4) / 10
    fs.unlinkSync(codeFilePath)
  } catch (err) {
    // Code backup is best-effort — the source of truth is GitHub anyway
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[Backup] code archive failed (non-fatal):', detail.slice(0, 300))
    if (fs.existsSync(codeFilePath)) fs.unlinkSync(codeFilePath)
    results.codeError = detail.slice(0, 300)
  }

  // ── 3. PRUNE — keep the newest KEEP_BACKUPS nights ────────────────────
  const pruned: string[] = []
  try {
    for (const prefix of [BACKUP_PREFIX, CODE_PREFIX]) {
      const list = await drive.files.list({
        q: `'${folderId}' in parents and name contains '${prefix}' and trashed = false`,
        orderBy: 'createdTime desc',
        pageSize: 200,
        fields: 'files(id, name, createdTime)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      const files = list.data.files || []
      for (const f of files.slice(KEEP_BACKUPS)) {
        await drive.files.delete({ fileId: f.id!, supportsAllDrives: true })
        pruned.push(f.name!)
      }
    }
  } catch (err) {
    console.error('[Backup] prune failed (non-fatal):', err instanceof Error ? err.message : err)
  }
  results.pruned = pruned

  console.log('[Backup] completed:', JSON.stringify(results))
  return NextResponse.json({ ok: true, ...results })
}
