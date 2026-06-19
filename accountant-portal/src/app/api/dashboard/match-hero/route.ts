import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Powers the dashboard's matches hero: one card per program with active
// matches, each showing its description, match count, and (on expand) the
// matched businesses. Scoped by the same accountant rules as /api/matches.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const filterAccountantId = isAdmin ? request.nextUrl.searchParams.get('accountantId') || undefined : undefined
  const effectiveAccountantId = isAdmin ? filterAccountantId : (session.user.accountantId || undefined)

  const where = effectiveAccountantId ? { business: { accountantId: effectiveAccountantId } } : {}

  const matches = await prisma.programMatch.findMany({
    where,
    orderBy: { matchScore: 'desc' },
    select: {
      id: true,
      matchScore: true,
      status: true,
      business: {
        select: {
          id: true,
          onomasia: true,
          afm: true,
          activities: { where: { firmActKind: 1 }, select: { firmActDescr: true }, take: 1 },
        },
      },
      program: { select: { id: true, title: true, description: true, category: true, otherRequirements: true, endDate: true } },
    },
  })

  const byProgram = new Map<string, {
    programId: string
    programTitle: string
    programDescription: string | null
    programCategory: string
    otherRequirements: string | null
    endDate: string | null
    matchCount: number
    businesses: Array<{ id: string; name: string; afm: string; activityDescr: string | null }>
  }>()

  for (const m of matches) {
    const entry = byProgram.get(m.program.id) || {
      programId: m.program.id,
      programTitle: m.program.title,
      programDescription: m.program.description,
      programCategory: m.program.category,
      otherRequirements: m.program.otherRequirements,
      endDate: m.program.endDate ? m.program.endDate.toISOString() : null,
      matchCount: 0,
      businesses: [],
    }
    entry.matchCount += 1
    entry.businesses.push({
      id: m.business.id,
      name: m.business.onomasia || m.business.afm,
      afm: m.business.afm,
      activityDescr: m.business.activities[0]?.firmActDescr || null,
    })
    byProgram.set(m.program.id, entry)
  }

  const programs = Array.from(byProgram.values()).sort((a, b) => b.matchCount - a.matchCount)

  return NextResponse.json({ programs })
}
