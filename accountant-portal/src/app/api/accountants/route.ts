import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notIndividualWhere } from '@/lib/business-filters'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountants = await prisma.accountant.findMany({
    select: {
      id: true, officeName: true, contactPerson: true, email: true, phone: true,
      active: true, approved: true, logoUrl: true,
      _count: { select: { businesses: { where: notIndividualWhere }, users: true } },
    },
    orderBy: { officeName: 'asc' },
  })

  // Eligible matches per accountant (POTENTIAL only — i.e. not rejected)
  const matchCounts = await prisma.programMatch.groupBy({
    by: ['businessId'],
    _count: true,
    where: { status: 'POTENTIAL', business: notIndividualWhere },
  })
  const businessAccountants = await prisma.business.findMany({
    where: { id: { in: matchCounts.map(m => m.businessId) } },
    select: { id: true, accountantId: true },
  })
  const businessToAccountant = new Map(businessAccountants.map(b => [b.id, b.accountantId]))
  const matchesByAccountant: Record<string, number> = {}
  for (const m of matchCounts) {
    const accId = businessToAccountant.get(m.businessId)
    if (accId) matchesByAccountant[accId] = (matchesByAccountant[accId] || 0) + m._count
  }

  const accountantsWithMatches = accountants.map(a => ({
    ...a,
    eligibleMatches: matchesByAccountant[a.id] || 0,
  }))

  return NextResponse.json({ accountants: accountantsWithMatches })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()

  const accountant = await prisma.accountant.create({ data })
  return NextResponse.json(accountant, { status: 201 })
}
