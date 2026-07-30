import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { runMatchingForBusiness, autoNotifyBusinessMatches } from '@/lib/matching'
import { categoryWhereClause, BusinessCategory } from '@/lib/business-categories'
import { regionWhereClause } from '@/lib/greek-regions'
import { notIndividualWhere, FARMER_SPECIAL_REGIME_CODE, inactiveBusinessWhere } from '@/lib/business-filters'
import { ensureFirmActCodesNormalized } from '@/lib/suggestions-seed'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  ensureFirmActCodesNormalized().catch(err => console.error('[Businesses] ΚΑΔ normalization failed:', err?.message))

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 200)
  const search = searchParams.get('search') || ''
  const skip = (page - 1) * limit

  const accountantIds = (searchParams.get('accountantIds') || '').split(',').filter(Boolean)
  const legalStatuses = (searchParams.get('legalStatuses') || '').split(',').filter(Boolean)
  const excludeLegalStatuses = (searchParams.get('excludeLegalStatuses') || '').split(',').filter(Boolean)
  const excludeIndividualLike = searchParams.get('excludeIndividualLike') !== '0'
  const inactiveOnly = searchParams.get('inactiveOnly') === '1'
  const websiteFormOnly = searchParams.get('websiteFormOnly') === '1'
  const regions = (searchParams.get('regions') || '').split(',').filter(Boolean)
  const categories = (searchParams.get('categories') || '').split(',').filter(Boolean) as BusinessCategory[]
  const perifereies = (searchParams.get('perifereies') || '').split(',').filter(Boolean)
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

  const where: any = {}

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  } else if (session.user.role === 'ADMIN' && accountantIds.length > 0) {
    const realIds = accountantIds.filter(id => id !== '__none__')
    const wantsNone = accountantIds.includes('__none__')
    if (wantsNone && realIds.length > 0) {
      where.AND = [...(where.AND || []), { OR: [{ accountantId: null }, { accountantId: { in: realIds } }] }]
    } else if (wantsNone) {
      where.accountantId = null
    } else {
      where.accountantId = { in: realIds }
    }
  }

  if (websiteFormOnly && session.user.role === 'ADMIN') where.source = 'website-form'

  if (legalStatuses.length > 0) where.legalStatusDescr = { in: legalStatuses }
  else if (excludeLegalStatuses.length > 0) where.legalStatusDescr = { notIn: excludeLegalStatuses }
  if (inactiveOnly) {
    where.AND = [...(where.AND || []), inactiveBusinessWhere]
  } else if (excludeIndividualLike) {
    // When the accountant explicitly filters by ΑΓΡΟΤΙΚΑ, don't also exclude
    // ΑΓΡΟΤΙΚΑ businesses via the default individual-like filter.
    if (categories.includes('ΑΓΡΟΤΙΚΑ')) {
      where.AND = [
        ...(where.AND || []),
        {
          AND: [
            { NOT: { legalStatusDescr: { contains: 'ΙΔΙΩΤΗΣ', mode: 'insensitive' } } },
            { activities: { some: { firmActKind: 1, NOT: { firmActCode: { startsWith: FARMER_SPECIAL_REGIME_CODE } } } } },
          ],
        },
      ]
    } else {
      where.AND = [...(where.AND || []), notIndividualWhere]
    }
  }
  if (regions.length > 0) where.postalAreaDescription = { in: regions }
  if (categories.length > 0) where.AND = [...(where.AND || []), { OR: categories.map(categoryWhereClause) }]
  if (perifereies.length > 0) where.AND = [...(where.AND || []), { OR: perifereies.map(regionWhereClause) }]

  if (search) {
    where.OR = [
      { afm: { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
      { commercialTitle: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { viberPhone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { activities: { some: { firmActDescr: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const sortableFields = ['createdAt', 'onomasia', 'afm', 'postalAreaDescription', 'postalZipCode', 'legalStatusDescr']
  let orderBy: any = sortableFields.includes(sortBy) ? { [sortBy]: sortDir } : { createdAt: 'desc' as const }
  if (sortBy === 'accountant.officeName') orderBy = { accountant: { officeName: sortDir } }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip,
      take: limit,
      include: {
        accountant: { select: { id: true, officeName: true } },
        activities: { take: 5 },
        _count: { select: { programMatches: { where: { status: { not: 'REJECTED' } } } } },
      },
      orderBy,
    }),
    prisma.business.count({ where }),
  ])

  const caseGroups = businesses.length > 0
    ? await prisma.clientCase.groupBy({ by: ['businessId'], where: { businessId: { in: businesses.map(b => b.id) } } })
    : []
  const businessIdsWithCases = new Set(caseGroups.map(g => g.businessId))
  const businessesWithFlags = businesses.map(b => ({ ...b, hasCase: businessIdsWithCases.has(b.id) }))

  return NextResponse.json({ businesses: businessesWithFlags, total, page, limit })
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

    // Auto-claim matching GemiLookup record
    if (business.afm) {
      prisma.gemiLookup.findUnique({ where: { afm: business.afm } })
        .then(gemi => {
          if (gemi && !gemi.claimedBusinessId) {
            const accountantId = businessData.accountantId ?? null
            return prisma.gemiLookup.update({
              where: { id: gemi.id },
              data: { claimedBusinessId: business.id, claimedAccountantId: accountantId, claimedAt: new Date() },
            })
          }
        })
        .catch(err => console.error('[GemiClaim] Auto-claim failed:', err?.message))
    }

    return NextResponse.json(business, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      // The AFM may already exist as an unclaimed GEMI-originated business
      // (source='gemi', accountantId=null) created automatically by the Ερμής
      // chat flow. In that case, claim it for the current accountant instead of
      // returning an error.
      const afm = businessData.afm
      if (afm) {
        const existing = await prisma.business.findUnique({
          where: { afm },
          include: { activities: true },
        })
        if (existing) {
          const accountantId = session.user.role === 'ACCOUNTANT' ? (session.user.accountantId ?? null) : (businessData.accountantId ?? null)

          // If already assigned to the same accountant, just return it (hidden by list filters)
          if (existing.accountantId && existing.accountantId === accountantId) {
            return NextResponse.json(existing, { status: 201 })
          }

          // If unassigned, claim it for the current accountant
          if (!existing.accountantId) {
            const claimed = await prisma.business.update({
              where: { afm },
              data: {
                accountantId: accountantId || undefined,
                email: existing.email ?? businessData.email ?? undefined,
                phone: existing.phone ?? businessData.phone ?? undefined,
                viberPhone: existing.viberPhone ?? businessData.viberPhone ?? undefined,
              },
              include: { activities: true },
            })
            await createAuditLog({
              userId: session.user.id,
              action: 'UPDATE',
              entity: 'Business',
              entityId: claimed.id,
              details: `Claimed unassigned GEMI business ${claimed.afm} during manual creation`,
            })
            runMatchingForBusiness(claimed.id)
              .then(() => session.user.role === 'ACCOUNTANT' ? autoNotifyBusinessMatches(claimed.id) : Promise.resolve())
              .catch(err => console.error('[Matching] Auto-match for claimed business failed:', err?.message))
            return NextResponse.json(claimed, { status: 201 })
          }
        }
      }
      return NextResponse.json({ error: 'ΑΦΜ ήδη υπάρχει στο σύστημα' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Σφάλμα δημιουργίας' }, { status: 500 })
  }
}
