import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { categoryWhereClause, ALL_CATEGORIES, BusinessCategory } from '@/lib/business-categories'
import { regionWhereClause, GREEK_REGIONS } from '@/lib/greek-regions'
import { reconcileMatchStatuses } from '@/lib/matching'
import { ensureGemiTagsBackfilled, ensureTagAliasesResolved, ensureBusinessTagsNotNull } from '@/lib/suggestions-seed'
import { getProgramExclusionFilters, withProgramExclusions as applyProgramExclusions } from '@/lib/program-exclusions'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['matchScore', 'createdAt', 'status', 'business.onomasia', 'business.afm', 'program.title', 'business.accountant.officeName'])

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fire-and-forget maintenance: backfill ΓΕΜΗ tags and resolve tag aliases.
  // Both are self-detecting no-ops once all records are up to date.
  ensureGemiTagsBackfilled().catch(() => {})
  ensureTagAliasesResolved().catch(() => {})
  // Awaited, not fire-and-forget: a NULL tags column breaks this very
  // request's own exclusion-filter query (see ensureBusinessTagsNotNull),
  // so it must finish before the where-clause below runs, not just "on some
  // future request".
  await ensureBusinessTagsNotNull().catch(() => {})

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
      // A business with neither email nor phone can never actually receive a
      // notification (see the same email-or-phone check in
      // /api/programs/[id]/notify) — without this, those rows sit in "Δεν
      // έχει σταλεί ενημέρωση" forever, looking like a pending action when
      // there's really just no way to reach them. Excluded here rather than
      // auto-marked as notified, since that would be a false audit trail.
      baseWhere.business = {
        ...(baseWhere.business || {}),
        NOT: {
          AND: [
            { OR: [{ email: null }, { email: '' }] },
            { OR: [{ phone: null }, { phone: '' }] },
          ],
        },
      }
    }
  }

  const baseWhereWithHidden = hideUnsuitable
    ? { ...baseWhere, rejectionReasonId: null, NOT: { criterionChecks: { some: { value: 'FAIL' } } } }
    : baseWhere

  // Scope the exclusion-rule lookup to only the program(s) actually in play
  // for the result set — pulling in every OTHER program's excludeTags/
  // requireTags/excludedLegalForms rules into one combined OR/NOT tree
  // (keyed by that row's own programId) was confirmed in production to
  // wrongly exclude rows belonging to a program with NO rules of its own,
  // once enough unrelated programs' rules piled into the same filter (a
  // program with empty excludedLegalForms lost 52 of 53 otherwise-visible
  // matches once >90 OTHER programs' legal-form exclusions were ORed in
  // alongside it). Scoping sidesteps that regardless of its exact cause.
  const resultScopeProgramIds = programIds.length > 0
    ? programIds
    : (await prisma.programMatch.findMany({ where: baseWhereWithHidden, select: { programId: true }, distinct: ['programId'] })).map(r => r.programId)
  const resultExclusionFilters = await getProgramExclusionFilters(resultScopeProgramIds)
  const withProgramExclusions = (w: any) => applyProgramExclusions(w, resultExclusionFilters)

  // `where`/`whereWithHidden` scope the actual result set (includes the program filter);
  // `baseWhereWithHidden` (without the program filter) is reused to compute the program
  // facet counts below, so the program dropdown reflects only the other active filters.
  const where = withProgramExclusions(programIds.length > 0 ? { ...baseWhere, programId: { in: programIds } } : baseWhere)
  const whereWithHidden = withProgramExclusions(programIds.length > 0 ? { ...baseWhereWithHidden, programId: { in: programIds } } : baseWhereWithHidden)

  // The program facet (dropdown counts below) spans every program regardless
  // of the current program filter, so it needs the full, unscoped rule set —
  // but each affected program is recounted individually below with the
  // where-clause scoped to just that one program, for the same reason.
  const { affectedProgramIds } = await getProgramExclusionFilters()

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

  // Program facet: counts are based on baseWhereWithHidden (other active filters).
  // Most programs have no exclude/require-tag or legal-form rules, so they're
  // counted with one cheap groupBy scan. Programs that DO have such rules are
  // re-counted individually with those rules applied — skipping this for all
  // programs (as before) made the facet badge show raw, pre-exclusion counts
  // (e.g. "(53)") while the actual filtered table — applying those same rules
  // via `where`/`whereWithHidden` — correctly showed far fewer matches.
  const [bulkProgramCounts, affectedProgramCounts] = await Promise.all([
    prisma.programMatch.groupBy({
      by: ['programId'],
      where: { ...baseWhereWithHidden, programId: { notIn: affectedProgramIds } },
      _count: { _all: true },
    }),
    Promise.all(affectedProgramIds.map(async id => {
      // Scoped to just this one program — reusing resultExclusionFilters
      // (built for the currently selected program(s), if any) would silently
      // apply no rules at all for every OTHER affected program being
      // recounted here.
      const filtersForId = await getProgramExclusionFilters([id])
      return {
        programId: id,
        count: await prisma.programMatch.count({ where: applyProgramExclusions({ ...baseWhereWithHidden, programId: id }, filtersForId) }),
      }
    })),
  ])
  const programCounts = [
    ...bulkProgramCounts.map(p => ({ programId: p.programId, count: p._count._all })),
    ...affectedProgramCounts.filter(p => p.count > 0),
  ]
  const programTitles = await prisma.program.findMany({
    where: { id: { in: programCounts.map(p => p.programId) } },
    select: { id: true, title: true },
  })
  const titleById = new Map(programTitles.map(p => [p.id, p.title]))
  const programs = programCounts
    .map(p => ({ id: p.programId, title: titleById.get(p.programId) || '—', count: p.count }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const legalStatusFacet = await prisma.business.findMany({
    where: businessFilter.accountantId ? { accountantId: businessFilter.accountantId } : {},
    select: { legalStatusDescr: true },
    distinct: ['legalStatusDescr'],
  })
  const legalStatusOptions = legalStatusFacet.map(l => l.legalStatusDescr).filter((v): v is string => !!v).sort()

  const [tagOptions, freeTextTagRows] = await Promise.all([
    prisma.tagOption.findMany({ select: { label: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM "Business" WHERE array_length(tags, 1) > 0 ORDER BY tag`,
  ])
  const structuredLabels = tagOptions.map(t => t.label)
  const freeTextLabels = freeTextTagRows.map(r => r.tag).filter(t => !structuredLabels.includes(t))
  const allTags = [...structuredLabels, ...freeTextLabels]

  return NextResponse.json({ matches, total, unsuitableCount, page, limit, accountants, programs, legalStatuses: legalStatusOptions, categories: ALL_CATEGORIES, perifereies: GREEK_REGIONS, tags: allTags })
}
