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

function getDrive() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!serviceAccountKey) return null
  const credentials = JSON.parse(serviceAccountKey)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// Dump every table in the public schema to JSON via Prisma — works without
// pg_dump (not installed in the Railway nixpacks image). BigInt-safe.
async function dumpDatabaseJson(): Promise<Buffer> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )
  const dump: Record<string, unknown[]> = {}
  for (const { tablename } of tables) {
    if (tablename.startsWith('_prisma')) continue
    try {
      const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM \"${tablename}\"`)
      dump[tablename] = rows
    } catch (err) {
      dump[tablename] = [{ __error: err instanceof Error ? err.message : String(err) }]
    }
  }
  const json = JSON.stringify(
    { exportedAt: new Date().toISOString(), tables: Object.keys(dump).length, data: dump },
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  )
  return zlib.gzipSync(Buffer.from(json, 'utf-8'))
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || (headerSecret !== cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
  const drive = getDrive()
  if (!folderId || !drive) {
    return NextResponse.json({ error: 'Missing GDRIVE_BACKUP_FOLDER_ID or GOOGLE_SERVICE_ACCOUNT_KEY' }, { status: 500 })
  }

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

  // ── 1. DATABASE BACKUP ────────────────────────────────────
  // Try pg_dump first (full fidelity restore); fall back to a JSON export
  // of every table via Prisma if pg_dump is unavailable in the image.
  const dbUrl = process.env.DATABASE_URL
  let dbFilePath: string | null = null
  let dbFileName = ''
  try {
    dbFileName = `${BACKUP_PREFIX}${timestamp}.sql.gz`
    dbFilePath = path.join(os.tmpdir(), dbFileName)
    execSync(`pg_dump \"${dbUrl}\" | gzip > \"${dbFilePath}\"`, { stdio: 'pipe', timeout: 180_000 })
    const size = fs.statSync(dbFilePath).size
    if (size < 1024) throw new Error(`pg_dump output suspiciously small (${size} bytes)`)
    results.dbMethod = 'pg_dump'
  } catch (err) {
    console.log('[Backup] pg_dump unavailable/failed, using JSON export:', err instanceof Error ? err.message.slice(0, 200) : err)
    if (dbFilePath && fs.existsSync(dbFilePath)) fs.unlinkSync(dbFilePath)
    dbFileName = `${BACKUP_PREFIX}${timestamp}.json.gz`
    dbFilePath = path.join(os.tmpdir(), dbFileName)
    const gz = await dumpDatabaseJson()
    fs.writeFileSync(dbFilePath, gz)
    results.dbMethod = 'json-export'
  }

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

  // ── 2. CODE + BUILD BACKUP ────────────────────────────────
  // Archive the deployed application directory (source + built .next output),
  // excluding node_modules (reinstallable) and caches.
  const codeFileName = `${CODE_PREFIX}${timestamp}.tar.gz`
  const codeFilePath = path.join(os.tmpdir(), codeFileName)
  try {
    const appDir = process.cwd()
    execSync(
      `tar -czf \"${codeFilePath}\" --exclude=node_modules --exclude=.next/cache --exclude=.git -C \"${appDir}\" .`,
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

  // ── 3. PRUNE — keep the newest KEEP_BACKUPS nights ────────────────
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
