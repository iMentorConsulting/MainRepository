import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { categoryWhereClause, ALL_CATEGORIES, BusinessCategory } from '@/lib/business-categories'
import { regionWhereClause, GREEK_REGIONS } from '@/lib/greek-regions'
import { reconcileMatchStatuses } from '@/lib/matching'

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
  const tags = searchParams.get('tags')?.split(',').filter(Boolean) || []
  const excludeTags = searchParams.get('excludeTags')?.split(',').filter(Boolean) || []
  const hideUnsuitable = searchParams.get('hideUnsuitable') === 'true'
  const websiteFormOnly = searchParams.get('websiteFormOnly') === '1'
  const campaignSent = searchParams.get('campaignSent') || ''
  const search = searchParams.get('search') || ''
  const sortBy = searchParams.get('sortBy') || 'matchScore'
  const sortDir = (searchParams.get('sortDir') || 'desc') === 'asc' ? 'asc' : 'desc'
  const skip = (page - 1) * limit

  const baseWhere: any = {}

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
  if (websiteFormOnly && session.user.role === 'ADMIN') businessFilter.source = 'website-form'
  if (legalStatuses.length > 0) businessFilter.legalStatusDescr = { in: legalStatuses }
  if (categories.length > 0) businessFilter.AND = [...(businessFilter.AND || []), { OR: categories.map(categoryWhereClause) }]
  if (perifereies.length > 0) businessFilter.AND = [...(businessFilter.AND || []), { OR: perifereies.map(regionWhereClause) }]
  if (tags.length > 0) businessFilter.tags = { hasSome: tags }
  if (excludeTags.length > 0) {
    const excluded = await prisma.business.findMany({ where: { tags: { hasSome: excludeTags } }, select: { id: true } })
    businessFilter.id = { notIn: excluded.map(b => b.id) }
  }
  if (campaignSent === 'yes') businessFilter.campaignRecipients = { some: { sentAt: { not: null } } }
  else if (campaignSent === 'no') businessFilter.campaignRecipients = { none: { sentAt: { not: null } } }
  if (search) {
    businessFilter.OR = [
      { onomasia: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { viberPhone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { activities: { some: { firmActDescr: { contains: search, mode: 'insensitive' } } } },
    ]
  }
  if (Object.keys(businessFilter).length > 0) baseWhere.business = businessFilter

  const baseWhereWithHidden = hideUnsuitable
    ? { ...baseWhere, rejectionReasonId: null, NOT: { criterionChecks: { some: { value: 'FAIL' } } } }
    : baseWhere

  // `where`/`whereWithHidden` scope the actual result set (includes the program filter);
  // `baseWhereWithHidden` (without the program filter) is reused to compute the program
  // facet counts below, so the program dropdown reflects only the other active filters.
  const where = programIds.length > 0 ? { ...baseWhere, programId: { in: programIds } } : baseWhere
  const whereWithHidden = programIds.length > 0 ? { ...baseWhereWithHidden, programId: { in: programIds } } : baseWhereWithHidden

  const safeSort = SORTABLE.has(sortBy) ? sortBy : 'matchScore'
  let orderBy: any = { [safeSort]: sortDir }
  if (safeSort === 'business.onomasia') orderBy = { business: { onomasia: sortDir } }
  else if (safeSort === 'business.afm') orderBy = { business: { afm: sortDir } }
  else if (safeSort === 'program.title') orderBy = { program: { title: sortDir } }
  else if (safeSort === 'business.accountant.officeName') orderBy = { business: { accountant: { officeName: sortDir } } }

  const [matches, total, totalAll] = await Promise.all([
    prisma.programMatch.findMany({
      where: whereWithHidden,
      skip,
      take: limit,
      include: {
        business: {
          select: {
            id: true,
            afm: true,
            onomasia: true,
            accountantId: true,
            tags: true,
            activities: { where: { firmActKind: 1 }, select: { firmActCode: true }, take: 1 },
            accountant: { select: { id: true, officeName: true, contactPerson: true } },
            campaignRecipients: {
              where: { sentAt: { not: null } },
              orderBy: { sentAt: 'desc' },
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
    prisma.programMatch.count({ where: whereWithHidden }),
    prisma.programMatch.count({ where }),
  ])
  const unsuitableCount = totalAll - total

  // Self-heal: a FAILed extra criterion makes a match ineligible. Older
  // records may predate this rule, so reconcile their status on read.
  await reconcileMatchStatuses(matches)

  // Flag businesses that already have at least one ClientCase, so the UI can
  // show a check overlay on the "Ανάθεση στην I-MENTOR" button.
  const businessIds = Array.from(new Set(matches.map(m => m.business?.id).filter((id): id is string => !!id)))
  const caseGroups = businessIds.length > 0
    ? await prisma.clientCase.groupBy({ by: ['businessId'], where: { businessId: { in: businessIds } } })
    : []
  const businessIdsWithCases = new Set(caseGroups.map(g => g.businessId))
  for (const m of matches as any[]) {
    if (m.business) m.business.hasCase = businessIdsWithCases.has(m.business.id)
  }

  // For admin: also return facets for filters
  let accountants: any[] = []
  if (session.user.role === 'ADMIN') {
    accountants = await prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
  }

  // Program facet: only programs with at least one match under the other active
  // filters, with a live count, so the dropdown narrows as the user filters.
  const programCounts = await prisma.programMatch.groupBy({
    by: ['programId'],
    where: baseWhereWithHidden,
    _count: { _all: true },
  })
  const programTitles = await prisma.program.findMany({
    where: { id: { in: programCounts.map(p => p.programId) } },
    select: { id: true, title: true },
  })
  const titleById = new Map(programTitles.map(p => [p.id, p.title]))
  const programs = programCounts
    .map(p => ({ id: p.programId, title: titleById.get(p.programId) || '—', count: p._count._all }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const legalStatusFacet = await prisma.business.findMany({
    where: businessFilter.accountantId ? { accountantId: businessFilter.accountantId } : {},
    select: { legalStatusDescr: true },
    distinct: ['legalStatusDescr'],
  })
  const legalStatusOptions = legalStatusFacet.map(l => l.legalStatusDescr).filter((v): v is string => !!v).sort()

  const tagOptions = await prisma.tagOption.findMany({ select: { label: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })

  return NextResponse.json({ matches, total, unsuitableCount, page, limit, accountants, programs, legalStatuses: legalStatusOptions, categories: ALL_CATEGORIES, perifereies: GREEK_REGIONS, tags: tagOptions.map(t => t.label) })
}
