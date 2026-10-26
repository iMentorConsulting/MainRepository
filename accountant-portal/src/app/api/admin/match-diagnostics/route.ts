import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLegalForm } from '@/lib/legal-forms'
import { getProgramExclusionFilters, withProgramExclusions } from '@/lib/program-exclusions'

export const dynamic = 'force-dynamic'

// Read-only diagnostic: for a given program (+ optional accountant), lists
// every raw ProgramMatch row and exactly why it is or isn't visible in the
// normal matches view — so a "N real matches but only 1 shown" report can be
// root-caused without direct DB access. Not linked from any page; admin-only.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const programId = searchParams.get('programId')
  const accountantId = searchParams.get('accountantId') || undefined
  if (!programId) return NextResponse.json({ error: 'programId is required' }, { status: 400 })

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, title: true, excludeTags: true, requireTags: true, excludedLegalForms: true },
  })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  const matches = await prisma.programMatch.findMany({
    where: {
      programId,
      ...(accountantId ? { business: { accountantId } } : {}),
    },
    select: {
      id: true,
      status: true,
      rejectionReasonId: true,
      rejectionReason: { select: { label: true } },
      business: {
        select: { id: true, onomasia: true, afm: true, tags: true, legalStatusDescr: true, accountantId: true },
      },
      criterionChecks: { select: { value: true, criterion: { select: { label: true } } } },
    },
  })

  const rows = matches.map(m => {
    const reasons: string[] = []
    if (m.status === 'REJECTED') reasons.push('status = REJECTED')
    if (m.rejectionReasonId) reasons.push(`rejectionReasonId set (${m.rejectionReason?.label || m.rejectionReasonId})`)
    const failedCriteria = m.criterionChecks.filter(c => c.value === 'FAIL').map(c => c.criterion.label)
    if (failedCriteria.length > 0) reasons.push(`FAILed criterion: ${failedCriteria.join(', ')}`)
    if (program.excludeTags.length > 0 && program.excludeTags.some(t => m.business.tags.includes(t))) {
      reasons.push(`has excluded tag: ${program.excludeTags.filter(t => m.business.tags.includes(t)).join(', ')}`)
    }
    if (program.requireTags.length > 0 && !program.requireTags.some(t => m.business.tags.includes(t))) {
      reasons.push(`missing a required tag (needs one of: ${program.requireTags.join(', ')}; has: ${m.business.tags.join(', ') || '(none)'})`)
    }
    const normalized = normalizeLegalForm(m.business.legalStatusDescr)
    if (program.excludedLegalForms.length > 0 && program.excludedLegalForms.includes(normalized)) {
      reasons.push(`excluded legal form: ${normalized} (raw: ${m.business.legalStatusDescr || '(empty)'})`)
    }
    return {
      businessId: m.business.id,
      businessName: m.business.onomasia,
      afm: m.business.afm,
      accountantId: m.business.accountantId,
      status: m.status,
      visible: reasons.length === 0,
      reasons,
      businessTags: m.business.tags,
      legalStatusDescr: m.business.legalStatusDescr,
    }
  })

  const sharedBaseWhere: any = {
    status: { not: 'REJECTED' as const },
    rejectionReasonId: null,
    NOT: { criterionChecks: { some: { value: 'FAIL' } } },
    ...(accountantId ? { business: { accountantId } } : {}),
    programId,
  }

  // UNSCOPED (the old, confirmed-buggy construction — pulls every program's
  // rules into one filter) vs SCOPED (the fix — only this one program's
  // rules), run side by side so a "still broken after deploy" report can be
  // told apart from "the fix genuinely doesn't help" without guessing.
  const unscopedFilters = await getProgramExclusionFilters()
  const unscopedWhere = withProgramExclusions(sharedBaseWhere, unscopedFilters)
  const scopedFilters = await getProgramExclusionFilters([programId])
  const scopedWhere = withProgramExclusions(sharedBaseWhere, scopedFilters)

  const [unscopedCount, scopedCount, scopedMatches] = await Promise.all([
    prisma.programMatch.count({ where: unscopedWhere }),
    prisma.programMatch.count({ where: scopedWhere }),
    prisma.programMatch.findMany({ where: scopedWhere, select: { id: true, business: { select: { onomasia: true, afm: true } } } }),
  ])

  // Prisma's JS layer can show `tags: []` for a column whose *actual* DB
  // value is NULL. In Postgres, `tags && ARRAY[...]` on a NULL array yields
  // NULL (not false), and `NOT NULL` is still NULL — which a WHERE clause
  // treats as "exclude", not "include". scopedCount staying 1 even with the
  // exclusion filter reduced to a single trivial condition points exactly
  // at this: check the real column value directly, bypassing Prisma's JS
  // normalization, and run the equivalent condition as raw SQL for comparison.
  const accountantClause = accountantId ? Prisma.sql`AND b."accountantId" = ${accountantId}` : Prisma.empty
  const tagsNullCheck = await prisma.$queryRaw<{ afm: string; tags_is_null: boolean; tags_raw: string[] | null; overlap_result: boolean | null }[]>`
    SELECT b.afm,
           b.tags IS NULL AS tags_is_null,
           b.tags AS tags_raw,
           (b.tags && ${program.excludeTags}::text[]) AS overlap_result
    FROM "ProgramMatch" pm
    JOIN "Business" b ON b.id = pm."businessId"
    WHERE pm."programId" = ${programId}
      ${accountantClause}
    LIMIT 10
  `.catch((e: any) => ({ error: String(e?.message || e) }))

  const rawExclusionCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "ProgramMatch" pm
    JOIN "Business" b ON b.id = pm."businessId"
    WHERE pm."programId" = ${programId}
      ${accountantClause}
      AND NOT (b.tags && ${program.excludeTags}::text[])
  `.catch((e: any) => [{ count: BigInt(-1) }])
  const rawExclusionCountIsTrueAndFalse = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "ProgramMatch" pm
    JOIN "Business" b ON b.id = pm."businessId"
    WHERE pm."programId" = ${programId}
      ${accountantClause}
      AND (b.tags && ${program.excludeTags}::text[]) IS NOT TRUE
  `.catch((e: any) => [{ count: BigInt(-1) }])

  return NextResponse.json({
    program: { id: program.id, title: program.title, excludeTags: program.excludeTags, requireTags: program.requireTags, excludedLegalForms: program.excludedLegalForms },
    totalRaw: rows.length,
    visibleCount: rows.filter(r => r.visible).length,
    unscopedCount,
    scopedCount,
    scopedWhereUsed: scopedWhere,
    scopedMatches: scopedMatches.map(m => ({ afm: m.business.afm, name: m.business.onomasia })),
    tagsNullCheck,
    // SQL's three-valued logic: rawExclusionCount uses `NOT (tags && excludeTags)`
    // (NULL propagates through NOT, so a NULL tags column silently drops the row —
    // exactly matching Prisma's NOT:{business:{tags:{hasSome:...}}} translation);
    // rawExclusionCountIsTrueAndFalse uses `IS NOT TRUE` instead, which treats a
    // NULL result as "didn't overlap" rather than "unknown, so excluded". If the
    // first is 1 and the second is 53, that confirms a NULL tags column is the bug.
    rawExclusionCount: Number((rawExclusionCount as any)[0]?.count ?? -1),
    rawExclusionCountIsTrueAndFalse: Number((rawExclusionCountIsTrueAndFalse as any)[0]?.count ?? -1),
    rows,
  })
}
