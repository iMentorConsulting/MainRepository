import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLegalForm } from '@/lib/legal-forms'

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

  const where = {
    status: { not: 'REJECTED' as const },
    ...(effectiveAccountantId ? { business: { accountantId: effectiveAccountantId } } : {}),
  }

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
          tags: true,
          legalStatusDescr: true,
          activities: { where: { firmActKind: 1 }, select: { firmActDescr: true }, take: 1 },
        },
      },
      program: { select: { id: true, title: true, description: true, category: true, otherRequirements: true, extraCriteriaIds: true, excludeTags: true, requireTags: true, legalStatusRules: true, endDate: true } },
    },
  })

  // Enforce each program's own tag-based exclusion/require lists and legal-form
  // restriction live, since old ProgramMatch rows created before these fields
  // were set (or already reviewed/notified, which matching cleanup leaves
  // untouched) would otherwise still surface here.
  const visibleMatches = matches.filter(m => {
    if ((m.program.excludeTags || []).some(t => m.business.tags.includes(t))) return false
    const requireTags = m.program.requireTags || []
    if (requireTags.length > 0 && !requireTags.some(t => m.business.tags.includes(t))) return false
    const legalStatusRules = m.program.legalStatusRules || []
    if (legalStatusRules.length > 0 && !legalStatusRules.includes(normalizeLegalForm(m.business.legalStatusDescr))) return false
    return true
  })

  // "Πρόσθετες Προϋποθέσεις" can come from either the free-text field or the
  // checklist of EligibilityCriterion entries — fall back to the checklist
  // labels when the free-text field is empty so both authoring styles show up.
  const allCriteriaIds = Array.from(new Set(visibleMatches.flatMap(m => m.program.extraCriteriaIds || [])))
  const criteriaList = allCriteriaIds.length > 0
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: allCriteriaIds } }, select: { id: true, label: true } })
    : []
  const criteriaLabelById = new Map(criteriaList.map(c => [c.id, c.label]))

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

  for (const m of visibleMatches) {
    const entry = byProgram.get(m.program.id) || {
      programId: m.program.id,
      programTitle: m.program.title,
      programDescription: m.program.description,
      programCategory: m.program.category,
      otherRequirements: m.program.otherRequirements
        || (m.program.extraCriteriaIds || []).map(cid => criteriaLabelById.get(cid)).filter(Boolean).join(' · ')
        || null,
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
