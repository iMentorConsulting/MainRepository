import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function primaryKad(activities: unknown): { code: string; descr: string } {
  if (!Array.isArray(activities) || activities.length === 0) return { code: '', descr: '' }
  const primary = (activities as any[]).find(a => a.firmActKind === 'ΚΥΡΙΑ') ?? activities[0]
  return { code: primary?.firmActCode ?? '', descr: primary?.firmActDescr ?? '' }
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const BATCH = 1000
  let cursor: string | undefined
  const rows: string[] = []

  const header = [
    'id', 'afm', 'onomasia', 'email', 'phone', 'mobilePhone',
    'postalAddress', 'postalZipCode', 'postalAreaDescription',
    'legalStatus', 'regdate', 'stopDate',
    'primaryKadCode', 'primaryKadDescr',
    'category', 'importBatch', 'tags',
    'aadeEnriched', 'matchingDone',
    'unsubscribedAt', 'createdAt',
  ]
  rows.push(header.join(','))

  while (true) {
    const batch = await prisma.gemiLookup.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true, afm: true, onomasia: true, email: true, phone: true, mobilePhone: true,
        postalAddress: true, postalZipCode: true, postalAreaDescription: true,
        legalStatusDescr: true, regdate: true, stopDate: true,
        activities: true, category: true, importBatch: true, tags: true,
        aadeEnriched: true, matchingDone: true,
        unsubscribedAt: true, createdAt: true,
      },
    })

    for (const r of batch) {
      const { code, descr } = primaryKad(r.activities)
      rows.push([
        r.id, r.afm, r.onomasia, r.email, r.phone, r.mobilePhone,
        r.postalAddress, r.postalZipCode, r.postalAreaDescription,
        r.legalStatusDescr, r.regdate, r.stopDate,
        code, descr,
        r.category, r.importBatch, (r.tags ?? []).join(';'),
        r.aadeEnriched, r.matchingDone,
        r.unsubscribedAt?.toISOString() ?? '', r.createdAt.toISOString(),
      ].map(escCsv).join(','))
    }

    if (batch.length < BATCH) break
    cursor = batch[batch.length - 1].id
  }

  const csv = rows.join('\n')
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gemi-businesses-${date}.csv"`,
    },
  })
}
