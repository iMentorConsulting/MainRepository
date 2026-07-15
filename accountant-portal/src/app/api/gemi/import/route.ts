import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_ROWS = 25000

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  let text = ''
  let batch: string | null = null

  if (contentType.includes('application/json')) {
    const body = await request.json()
    batch = body.batch ?? body.batchName ?? body.importBatch ?? null
    if (body.csv) {
      text = body.csv
    } else if (body.fileData) {
      // base64 data URL: data:text/csv;base64,...
      const base64 = (body.fileData as string).replace(/^data:[^;]+;base64,/, '')
      text = Buffer.from(base64, 'base64').toString('utf8')
    } else {
      return NextResponse.json({ error: 'No csv or fileData in JSON body' }, { status: 400 })
    }
  } else {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    batch = (formData.get('batch') as string | null) || null
    text = await file.text()
  }
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')

  if (lines.length < 2) {
    return NextResponse.json({ imported: 0, updated: 0, skipped: 0, errors: [] })
  }

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())

  const afmIdx = headers.indexOf('afm')
  const emailIdx = headers.indexOf('email')
  const phoneIdx = headers.indexOf('phone')

  if (afmIdx === -1) {
    return NextResponse.json({ error: 'CSV must have an afm column' }, { status: 400 })
  }

  const dataLines = lines.slice(1)

  if (dataLines.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows: ${dataLines.length}. Maximum allowed is ${MAX_ROWS}.` },
      { status: 400 }
    )
  }

  let imported = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    const fields = parseCSVLine(line)

    const rawAfm = (fields[afmIdx] ?? '').replace(/^"|"$/g, '').trim()
    const afm = rawAfm.replace(/\D/g, '')

    if (!afm || !/^\d{9}$/.test(afm)) {
      skipped++
      continue
    }

    const email = emailIdx !== -1
      ? (fields[emailIdx] ?? '').replace(/^"|"$/g, '').trim() || null
      : null

    const phone = phoneIdx !== -1
      ? (fields[phoneIdx] ?? '').replace(/^"|"$/g, '').trim() || null
      : null

    try {
      const existing = await prisma.gemiLookup.findUnique({ where: { afm } })

      if (existing) {
        await prisma.gemiLookup.update({
          where: { afm },
          data: {
            ...(email !== null ? { email } : {}),
            ...(phone !== null ? { phone } : {}),
            ...(batch !== null ? { importBatch: batch } : {}),
          },
        })
        updated++
      } else {
        await prisma.gemiLookup.create({
          data: {
            afm,
            email,
            phone,
            importBatch: batch,
          },
        })
        imported++
      }
    } catch (err: any) {
      errors.push(`Row ${i + 2} (AFM ${afm}): ${err?.message ?? 'Unknown error'}`)
      skipped++
    }
  }

  return NextResponse.json({ imported, updated, skipped, errors })
}
