import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProgramExclusionFilters, withProgramExclusions } from '@/lib/program-exclusions'
import { ensureBusinessTagsNotNull } from '@/lib/suggestions-seed'

export const dynamic = 'force-dynamic'

// Powers the dashboard's matches hero: one card per program with active
// matches, each showing its description, match count, and (on expand) the
// matched businesses. Scoped by the same accountant rules as /api/matches,
// using the exact same shared exclusion-filter logic as that route's own
// query (applied as a Prisma where-clause, not re-implemented in JS) — the
// two must never be able to silently diverge on what counts as a match.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const filterAccountantId = isAdmin ? request.nextUrl.searchParams.get('accountantId') || undefined : undefined
  const effectiveAccountantId = isAdmin ? filterAccountantId : (session.user.accountantId || undefined)

  // Awaited: a NULL tags column breaks the exclusion-filter query below (see
  // ensureBusinessTagsNotNull), so it must finish before that query runs.
  await ensureBusinessTagsNotNull().catch(() => {})

  const baseWhere = {
    status: { not: 'REJECTED' as const },
    // Mirror /api/matches's default "hideUnsuitable" filter — otherwise the
    // hero's count includes matches the table hides by default (an existing
    // rejection reason or a FAILed extra criterion), making the card's count
    // wildly overstate what actually shows up when the user follows through.
    rejectionReasonId: null,
    NOT: { criterionChecks: { some: { value: 'FAIL' } } },
    ...(effectiveAccountantId ? { business: { accountantId: effectiveAccountantId } } : {}),
  }

  // Scope exclusion rules to only the programs this accountant actually has
  // candidate matches for — pulling in every program in the system's rules
  // into one combined filter was confirmed to wrongly exclude rows for a
  // rule-free program once enough unrelated programs' rules piled in (see
  // program-exclusions.ts). A quick unscoped pass gets the real candidate
  // set; exclusion rules are then applied scoped and re-queried.
  const candidateProgramIds = (await prisma.programMatch.findMany({
    where: baseWhere,
    select: { programId: true },
    distinct: ['programId'],
  })).map(r => r.programId)
  const exclusionFilters = await getProgramExclusionFilters(candidateProgramIds)
  const where = withProgramExclusions(baseWhere, exclusionFilters)

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
      program: { select: { id: true, title: true, description: true, category: true, extraCriteriaIds: true, endDate: true } },
    },
  })

  // "Πρόσθετες Προϋποθέσεις" can come from either the free-text field or the
  // checklist of EligibilityCriterion entries — fall back to the checklist
  // labels when the free-text field is empty so both authoring styles show up.
  const allCriteriaIds = Array.from(new Set(matches.flatMap(m => m.program.extraCriteriaIds || [])))
  const criteriaList = allCriteriaIds.length > 0
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: allCriteriaIds } }, select: { id: true, label: true } })
    : []
  const criteriaLabelById = new Map(criteriaList.map(c => [c.id, c.label]))

  const byProgram = new Map<string, {
    programId: string
    programTitle: string
    programDescription: string | null
    programCategory: string
    extraCriteriaLabels: string[]
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
      // Short, scannable badges (e.g. "Πτυχίο ΑΕΙ/ΤΕΙ μετά το 2016") instead
      // of the program's full free-text "Άλλες Προϋποθέσεις" — that text is
      // dense, legal-style wording that doesn't fit a card preview; it's
      // shown in full on the program's own page instead.
      extraCriteriaLabels: (m.program.extraCriteriaIds || []).map(cid => criteriaLabelById.get(cid)).filter((l): l is string => Boolean(l)),
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
