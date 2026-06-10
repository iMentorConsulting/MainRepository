import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { runMatchingForBusiness, autoNotifyBusinessMatches } from '@/lib/matching'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 200)
  const search = searchParams.get('search') || ''
  const skip = (page - 1) * limit

  const accountantIds = (searchParams.get('accountantIds') || '').split(',').filter(Boolean)
  const legalStatuses = (searchParams.get('legalStatuses') || '').split(',').filter(Boolean)
  const excludeLegalStatuses = (searchParams.get('excludeLegalStatuses') || '').split(',').filter(Boolean)
  const regions = (searchParams.get('regions') || '').split(',').filter(Boolean)
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

  const where: any = {}

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  } else if (session.user.role === 'ADMIN' && accountantIds.length > 0) {
    where.accountantId = { in: accountantIds }
  }

  if (legalStatuses.length > 0) where.legalStatusDescr = { in: legalStatuses }
  else if (excludeLegalStatuses.length > 0) where.legalStatusDescr = { notIn: excludeLegalStatuses }
  if (regions.length > 0) where.postalAreaDescription = { in: regions }

  if (search) {
    where.OR = [
      { afm: { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
      { commercialTitle: { contains: search, mode: 'insensitive' } },
    ]
  }

  const sortableFields = ['createdAt', 'onomasia', 'afm', 'postalAreaDescription', 'postalZipCode', 'legalStatusDescr']
  const orderBy = sortableFields.includes(sortBy) ? { [sortBy]: sortDir } : { createdAt: 'desc' as const }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip,
      take: limit,
      include: {
        accountant: { select: { id: true, officeName: true } },
        activities: { take: 5 },
        _count: { select: { programMatches: true } },
      },
      orderBy,
    }),
    prisma.business.count({ where }),
  ])

  return NextResponse.json({ businesses, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await request.json()
  const { activities, ...businessData } = data

  // Set accountantId for ACCOUNTANT role
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    businessData.accountantId = session.user.accountantId
  }

  try {
    const business = await prisma.business.create({
      data: {
        ...businessData,
        activities: activities ? {
          create: activities.map((a: any) => ({
            firmActCode: a.firmActCode,
            firmActDescr: a.firmActDescr,
            firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
            firmActKindDescr: a.firmActKindDescr,
          }))
        } : undefined
      },
      include: { activities: true }
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entity: 'Business',
      entityId: business.id,
      details: `Created business ${business.afm}`
    })

    const isAccountant = session.user.role === 'ACCOUNTANT'
    runMatchingForBusiness(business.id)
      .then(() => isAccountant ? autoNotifyBusinessMatches(business.id) : Promise.resolve())
      .catch(err => console.error('[Matching] Auto-match/notify for new business failed:', err?.message))

    return NextResponse.json(business, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'ΑΦΜ ήδη υπάρχει στο σύστημα' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Σφάλμα δημιουργίας' }, { status: 500 })
  }
}
