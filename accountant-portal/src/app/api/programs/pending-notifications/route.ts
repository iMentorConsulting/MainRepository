import { NextResponse } from 'next/server'
import { MatchStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Summary for the small "unsent notifications" table at the top of the
// programs list — avoids admins having to open every program just to find
// out which ones still have unnotified matches sitting in them.
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const grouped = await prisma.programMatch.groupBy({
    by: ['programId'],
    where: { notified: false, status: { not: MatchStatus.REJECTED } },
    _count: { _all: true },
  })
  if (grouped.length === 0) return NextResponse.json({ programs: [] })

  const programs = await prisma.program.findMany({
    where: { id: { in: grouped.map(g => g.programId) } },
    select: { id: true, title: true, archived: true },
  })
  const programById = new Map(programs.map(p => [p.id, p]))

  const result = grouped
    .filter(g => programById.has(g.programId))
    .map(g => {
      const p = programById.get(g.programId)!
      return { id: p.id, title: p.title, archived: p.archived, pending: g._count._all }
    })
    .sort((a, b) => b.pending - a.pending)

  return NextResponse.json({ programs: result })
}
