import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const tag = String(formData.get('tag') || '').trim()
  if (!file) return NextResponse.json({ error: 'Χωρίς αρχείο' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let rows: any[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(sheet)
  } catch {
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Support plain list of AFMs (no header) or a header row with afm column
    const first = lines[0]?.toLowerCase().replace(/\s/g, '')
    if (first === 'afm' || first === 'αφμ') {
      rows = lines.slice(1).map(line => ({ afm: line.split(',')[0] }))
    } else {
      rows = lines.map(line => ({ afm: line.split(',')[0] }))
    }
  }

  // Collect unique 9-digit AFMs, with optional per-row tag from a TAG column
  const afmTags = new Map<string, string>()
  for (const row of rows) {
    const raw = row.afm ?? row.ΑΦΜ ?? row.AFM ?? row.Afm ?? Object.values(row)[0]
    const afm = String(raw ?? '').trim().replace(/\D/g, '')
    if (afm.length !== 9) continue
    const rowTag = String(row.tag ?? row.Tag ?? row.TAG ?? row.tags ?? '').trim()
    afmTags.set(afm, rowTag || tag)
  }

  if (afmTags.size === 0) {
    return NextResponse.json({ error: 'Δεν βρέθηκαν έγκυρα ΑΦΜ στο αρχείο' }, { status: 400 })
  }

  if (!tag && Array.from(afmTags.values()).some(t => !t)) {
    return NextResponse.json({ error: 'Λείπει το tag — συμπληρώστε το πεδίο Tag ή προσθέστε στήλη TAG στο αρχείο' }, { status: 400 })
  }

  const afms = new Set(afmTags.keys())
  const businesses = await prisma.business.findMany({
    where: { afm: { in: Array.from(afms) } },
    select: { id: true, afm: true, tags: true },
  })

  let updated = 0
  for (const business of businesses) {
    const businessTag = afmTags.get(business.afm)
    if (!businessTag || business.tags.includes(businessTag)) continue
    await prisma.business.update({
      where: { id: business.id },
      data: { tags: { push: businessTag } },
    })
    updated++
  }

  const foundAfms = new Set(businesses.map(b => b.afm))
  const notFound = Array.from(afms).filter(afm => !foundAfms.has(afm))

  await createAuditLog({
    userId: session.user.id,
    action: 'BULK_TAG',
    entity: 'Business',
    entityId: businesses.map(b => b.id).join(','),
    details: `Bulk tagged ${updated} businesses (${afms.size} AFM submitted, ${notFound.length} not found)`,
  })

  return NextResponse.json({
    submitted: afms.size,
    matched: businesses.length,
    updated,
    notFound,
  })
}
