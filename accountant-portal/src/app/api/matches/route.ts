import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { categoryWhereClause, ALL_CATEGORIES, BusinessCategory } from '@/lib/business-categories'
import { regionWhereClause, GREEK_REGIONS } from '@/lib/greek-regions'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['matchScore', 'createdAt', 'status', 'business.onomasia', 'business.afm', 'program.title', 'business.accountant.officeName'])

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 200)
  const accountantIds = searchParams.get('accountantIds')?.split(',').filter(Boolean) || []
  const programIds = searchParams.get('programIds')?.split(',').filter(Boolean) || []
  const legalStatuses = searchParams.get('legalStatuses')?.split(',').filter(Boolean) || []
  const categories = (searchParams.get('categories')?.split(',').filter(Boolean) || []) as BusinessCategory[]
  const perifereies = searchParams.get('perifereies')?.split(',').filter(Boolean) || []
  const campaignSent = searchParams.get('campaignSent') || ''
  const search = searchParams.get('search') || ''
  const sortBy = searchParams.get('sortBy') || 'matchScore'
  const sortDir = (searchParams.get('sortDir') || 'desc') === 'asc' ? 'asc' : 'desc'
  const skip = (page - 1) * limit

  const where: any = {}
  if (programIds.length > 0) where.programId = { in: programIds }

  const businessFilter: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    // Always enforce the session accountant — ignore any client-supplied accountantIds
    businessFilter.accountantId = session.user.accountantId
  } else if (session.user.role === 'ADMIN' && accountantIds.length > 0) {
    const realIds = accountantIds.filter(id => id !== '__none__')
    const wantsNone = accountantIds.includes('__none__')
    if (wantsNone && realIds.length > 0) {
      businessFilter.AND = [...(businessFilter.AND || []), { OR: [{ accountantId: null }, { accountantId: { in: realIds } }] }]
    } else if (wantsNone) {
      businessFilter.accountantId = null
    } else {
      businessFilter.accountantId = { in: realIds }
    }
  }
  if (legalStatuses.length > 0) businessFilter.legalStatusDescr = { in: legalStatuses }
  if (categories.length > 0) businessFilter.AND = [...(businessFilter.AND || []), { OR: categories.map(categoryWhereClause) }]
  if (perifereies.length > 0) businessFilter.AND = [...(businessFilter.AND || []), { OR: perifereies.map(regionWhereClause) }]
  if (campaignSent === 'yes') businessFilter.campaignRecipients = { some: { sentAt: { not: null } } }
  else if (campaignSent === 'no') businessFilter.campaignRecipients = { none: { sentAt: { not: null } } }
  if (search) {
    businessFilter.OR = [
      { onomasia: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (Object.keys(businessFilter).length > 0) where.business = businessFilter

  const safeSort = SORTABLE.has(sortBy) ? sortBy : 'matchScore'
  let orderBy: any = { [safeSort]: sortDir }
  if (safeSort === 'business.onomasia') orderBy = { business: { onomasia: sortDir } }
  else if (safeSort === 'business.afm') orderBy = { business: { afm: sortDir } }
  else if (safeSort === 'program.title') orderBy = { program: { title: sortDir } }
  else if (safeSort === 'business.accountant.officeName') orderBy = { business: { accountant: { officeName: sortDir } } }

  const [matches, total] = await Promise.all([
    prisma.programMatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        business: {
          select: {
            id: true,
            afm: true,
            onomasia: true,
            tags: true,
            activities: { where: { firmActKind: 1 }, select: { firmActCode: true }, take: 1 },
            accountant: { select: { id: true, officeName: true, contactPerson: true } },
            campaignRecipients: {
              where: { sentAt: { not: null } },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { sentAt: true, campaign: { select: { programId: true, title: true } } },
            },
          },
        },
        program: { select: { id: true, title: true, category: true, extraCriteriaIds: true } },
        criterionChecks: { include: { criterion: true } },
        rejectionReason: true,
      },
      orderBy,
    }),
    prisma.programMatch.count({ where }),
  ])

  // For admin: also return facets for filters
  let accountants: any[] = []
  let programs: any[] = []
  if (session.user.role === 'ADMIN') {
    const [accs, progs] = await Promise.all([
      prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } }),
      prisma.program.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    ])
    accountants = accs
    programs = progs
  }

  const legalStatusFacet = await prisma.business.findMany({
    where: businessFilter.accountantId ? { accountantId: businessFilter.accountantId } : {},
    select: { legalStatusDescr: true },
    distinct: ['legalStatusDescr'],
  })
  const legalStatusOptions = legalStatusFacet.map(l => l.legalStatusDescr).filter((v): v is string => !!v).sort()

  return NextResponse.json({ matches, total, page, limit, accountants, programs, legalStatuses: legalStatusOptions, categories: ALL_CATEGORIES, perifereies: GREEK_REGIONS })
}
