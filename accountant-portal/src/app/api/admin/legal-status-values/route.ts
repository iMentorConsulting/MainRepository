import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// One-off diagnostic: lists every distinct legalStatusDescr value actually
// stored on Business, with counts, so the canonical legal-form taxonomy can
// be built from real production data instead of guessed from AADE docs.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const groups = await prisma.business.groupBy({
    by: ['legalStatusDescr'],
    _count: { _all: true },
    orderBy: { _count: { legalStatusDescr: 'desc' } },
  })

  const values = groups
    .map(g => ({ legalStatusDescr: g.legalStatusDescr, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ total: values.reduce((s, v) => s + v.count, 0), distinctCount: values.length, values })
}
