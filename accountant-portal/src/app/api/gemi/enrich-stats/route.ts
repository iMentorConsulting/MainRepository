import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Diagnostic: breakdown of GEMI enrichment status, grouped by aadeError value.
// Helps identify why records aren't enriching (quota, terminal errors, timeouts, etc.)
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [totalCount, enrichedCount, errorGroups] = await Promise.all([
    prisma.gemiLookup.count(),
    prisma.gemiLookup.count({ where: { aadeEnriched: true } }),
    prisma.gemiLookup.groupBy({
      by: ['aadeError'],
      where: { aadeEnriched: false },
      _count: { _all: true },
      orderBy: { _count: { aadeError: 'desc' } },
    }),
  ])

  const unenriched = totalCount - enrichedCount
  const breakdown = errorGroups.map(g => ({
    error: g.aadeError ?? '(pending — no error yet)',
    count: g._count._all,
  }))

  return NextResponse.json({ totalCount, enrichedCount, unenriched, breakdown })
}
