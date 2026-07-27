import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { categoryWhereClause, ALL_CATEGORIES, BusinessCategory } from '@/lib/business-categories'
import { regionWhereClause, GREEK_REGIONS } from '@/lib/greek-regions'
import { reconcileMatchStatuses } from '@/lib/matching'
import { normalizeLegalForm } from '@/lib/legal-forms'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['matchScore', 'createdAt', 'status', 'business.onomasia', 'business.afm', 'program.title', 'business.accountant.officeName'])

// ─── Program-exclusion cache ──────────────────────────────────────────────
// Building the (businessId, programId) exclusion pairs requires full-table
// business scans. These pairs only change when a program's excludeTags /
// requireTags / excludedLegalForms are edited — which is rare. Cache them for
// 90 seconds so a heavily-used matches page doesn't scan the Business table on
// every single request.
interface ExclusionCache {
  ts: number
  excludePairsFilter: any
  requirePairsFilter: any
  legalFormExcludePairsFilter: any
}
let _exclusionCache: ExclusionCache | null = null
const EXCLUSION_TTL = 90_000 // 90 seconds

export function invalidateExclusionCache() {
  _exclusionCache = null
}

async function getProgramExclusionFilters(): Promise<Pick<ExclusionCache, 'excludePairsFilter' | 'requirePairsFilter' | 'legalFormExcludePairsFilter'>> {
  const now = Date.now()
  if (_exclusionCache && (now - _exclusionCache.ts) < EXCLUSION_TTL) {
    return _exclusionCache
  }

  const programsWithTagRules = await prisma.program.findMany({
    where: { OR: [{ excludeTags: { isEmpty: false } }, { requireTags: { isEmpty: false } }] },
    select: { id: true, excludeTags: true, requireTags: true },
  })

  let excludePairsFilter: any = null
  let requirePairsFilter: any = null

  if (programsWithTagRules.length > 0) {
    const unionTags = Array.from(new Set(programsWithTagRules.flatMap(p => [...p.excludeTags, ...p.requireTags])))
    const taggedBusinesses = await prisma.business.findMany({
      where: { tags: { hasSome: unionTags } },
      select: { id: true, tags: true },
    })

    // excludePairs: matches that should never appear (business has an excluded tag for this program)
    const excludePairs: { businessId: string; programId: string }[] = []
    for (const program of programsWithTagRules) {
      if (program.excludeTags.length === 0) continue
      for (const business of taggedBusinesses) {
        if (business.tags.some(t => program.excludeTags.includes(t))) {
          excludePairs.push({ businessId: business.id, programId: program.id })
        }
      }
    }
    if (excludePairs.length > 0) excludePairsFilter = { NOT: { OR: excludePairs } }

    // requirePairs: for programs that require at least one tag, only show matches
    // where the business carries one of those tags.
    const programsWithRequireTags = programsWithTagRules.filter(p => p.requireTags.length > 0)
    if (programsWithRequireTags.length > 0) {
      const requireProgramIds = programsWithRequireTags.map(p => p.id)
      // Businesses that appear in taggedBusinesses are the ONLY ones that could be
      // eligible for require-tag programs — untagged businesses are always ineligible.
      const eligiblePairs: { businessId: string; programId: string }[] = []
      for (const program of programsWithRequireTags) {
        for (const business of taggedBusinesses) {
          if (business.tags.some(t => program.requireTags.includes(t))) {
            eligiblePairs.push({ businessId: business.id, programId: program.id })
          }
        }
      }
      requirePairsFilter = {
        OR: [
          { programId: { notIn: requireProgramIds } },
          ...(eligiblePairs.length > 0 ? [{ OR: eligiblePairs }] : []),
        ],
      }
    }
  }

  // Legal-form exclusions — only fetch businesses whose legalStatusDescr is
  // in any of the excluded sets (much smaller than all businesses)
  const programsWithExcludedLegalForms = await prisma.program.findMany({
    where: { excludedLegalForms: { isEmpty: false } },
    select: { id: true, excludedLegalForms: true },
  })
  let legalFormExcludePairsFilter: any = null
  if (programsWithExcludedLegalForms.length > 0) {
    const allExcludedForms = Array.from(new Set(programsWithExcludedLegalForms.flatMap(p => p.excludedLegalForms)))
    // Only businesses whose normalized form is in the excluded set
    const allBusinessesForLegalForm = await prisma.business.findMany({
      where: { legalStatusDescr: { not: null } },
      select: { id: true, legalStatusDescr: true },
    })
    const excludedLegalPairs: { businessId: string; programId: string }[] = []
    for (const program of programsWithExcludedLegalForms) {
      for (const business of allBusinessesForLegalForm) {
        if (program.excludedLegalForms.includes(normalizeLegalForm(business.legalStatusDescr))) {
          excludedLegalPairs.push({ businessId: business.id, programId: program.id })
        }
      }
    }
    if (excludedLegalPairs.length > 0) legalFormExcludePairsFilter = { NOT: { OR: excludedLegalPairs } }
  }

  const result = { excludePairsFilter, requirePairsFilter, legalFormExcludePairsFilter }
  _exclusionCache = { ts: now, ...result }
  return result
}

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

  // REJECTED covers two cases: a manual admin/accountant rejection AND the
  // auto-matcher's "no longer qualifies" flag (resetStaleMatches in
  // matching.ts). Neither belongs in the normal matches view, its total, or
  // the per-program facet counts below — without this, stale auto-rejected
  // rows (e.g. left over from a since-tightened ΚΑΔ rule) silently inflate
  // every count on this page while staying invisible in the actual table
  // (the dashboard's MatchesHero widget already excludes them the same way).
  const baseWhere: any = { status: { not: 'REJECTED' } }

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

  // "campaignSent" must be scoped per match (businessId + that match's own programId),
  // not per business overall — a business can have a sent campaign for one program and
  // none for another, and each match row should reflect only its own program.
  if (campaignSent === 'yes' || campaignSent === 'no') {
    const sentRecipients = await prisma.campaignRecipient.findMany({
      where: { sentAt: { not: null }, campaign: { programId: { not: null } } },
      select: { businessId: true, campaign: { select: { programId: true } } },
    })
    const sentPairs = Array.from(new Set(sentRecipients.map(r => `${r.businessId}::${r.campaign.programId}`)))
      .map(key => {
        const [businessId, programId] = key.split('::')
        return { businessId, programId }
      })

    if (campaignSent === 'yes') {
      baseWhere.OR = sentPairs.length > 0 ? sentPairs : [{ id: '__none__' }]
    } else {
      baseWhere.AND = [...(baseWhere.AND || []), { NOT: { OR: sentPairs.length > 0 ? sentPairs : [{ id: '__none__' }] } }]
    }
  }

  const baseWhereWithHidden = hideUnsuitable
    ? { ...baseWhere, rejectionReasonId: null, NOT: { criterionChecks: { some: { value: 'FAIL' } } } }
    : baseWhere

  // Use cached program-exclusion filters — avoids 3 full-table Business scans
  // on every request. Cache is invalidated when a program's tag/legal-form rules
  // change (see invalidateExclusionCache above).
  const { excludePairsFilter, requirePairsFilter, legalFormExcludePairsFilter } = await getProgramExclusionFilters()

  const withProgramExclusions = (w: any) => {
    let result = w
    if (excludePairsFilter) result = { ...result, AND: [...(result.AND || []), excludePairsFilter] }
    if (requirePairsFilter) result = { ...result, AND: [...(result.AND || []), requirePairsFilter] }
    if (legalFormExcludePairsFilter) result = { ...result, AND: [...(result.AND || []), legalFormExcludePairsFilter] }
    return result
  }

  // `where`/`whereWithHidden` scope the actual result set (includes the program filter);
  // `baseWhereWithHidden` (without the program filter) is reused to compute the program
  // facet counts below, so the program dropdown reflects only the other active filters.
  const where = withProgramExclusions(programIds.length > 0 ? { ...baseWhere, programId: { in: programIds } } : baseWhere)
  const whereWithHidden = withProgramExclusions(programIds.length > 0 ? { ...baseWhereWithHidden, programId: { in: programIds } } : baseWhereWithHidden)

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

  // Only matches with a saved Ερμής transcript get a chat icon in the UI —
  // showing it for every row when no conversation happened is just noise.
  const tokensWithChat = matches.length > 0
    ? await prisma.businessMatchToken.findMany({
        where: {
          chatLog: { not: Prisma.DbNull },
          OR: matches.map(m => ({ businessId: m.businessId, programId: m.programId })),
        },
        select: { businessId: true, programId: true },
      })
    : []
  const chatKeys = new Set(tokensWithChat.map(t => `${t.businessId}:${t.programId}`))
  for (const m of matches as any[]) {
    m.hasErmisChat = chatKeys.has(`${m.businessId}:${m.programId}`)
  }
  const unsuitableCount = totalAll - total

  // Self-heal: a FAILed extra criterion makes a match ineligible. Older
  // records may predate this rule, so reconcile their status on read.
  // Fire-and-forget — don't block the response on this housekeeping task.
  void reconcileMatchStatuses(matches)

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
    where: withProgramExclusions(baseWhereWithHidden),
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
