import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { zipStatusForProgram } from '@/lib/new-business-programs'

export const dynamic = 'force-dynamic'

// Active programs that also accept υπό ίδρυση businesses, for the "email for a
// new-business program" picker on a business page. ALL regions are listed (the
// client may invest away from the registered seat); each carries an indication
// of whether the business's ΤΚ is eligible. Programs the business already has
// a (non-rejected) match for are left out — those use the normal match buttons.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'CONSULTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    select: { id: true, postalZipCode: true, programMatches: { where: { status: { not: 'REJECTED' } }, select: { programId: true } } },
  })
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const matched = new Set(business.programMatches.map(m => m.programId))
  const programs = await prisma.program.findMany({
    where: { active: true, archived: false, acceptsNewBusiness: true },
    select: { id: true, title: true, category: true, regionRules: true, zipCodeRules: true },
    orderBy: { title: 'asc' },
  })

  const rank = { eligible: 0, 'no-restriction': 1, unknown: 2, 'not-eligible': 3 } as const
  const list = programs
    .filter(p => !matched.has(p.id))
    .map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      zipStatus: zipStatusForProgram(p, business.postalZipCode),
      regionRules: p.regionRules,
    }))
    .sort((a, b) => rank[a.zipStatus] - rank[b.zipStatus] || a.title.localeCompare(b.title, 'el'))

  return NextResponse.json({ zip: business.postalZipCode, programs: list })
}
