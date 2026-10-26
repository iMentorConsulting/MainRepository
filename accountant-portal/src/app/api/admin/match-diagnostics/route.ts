import { NextRequest, NextResponse } from 'next/server'
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

  // Run the EXACT same Prisma where-clause /api/matches and /api/dashboard/
  // match-hero now share, to see whether the real query — not this route's
  // own hand-written reasons[] computation above — is what disagrees.
  const exclusionFilters = await getProgramExclusionFilters()
  const sharedBaseWhere: any = {
    status: { not: 'REJECTED' as const },
    rejectionReasonId: null,
    NOT: { criterionChecks: { some: { value: 'FAIL' } } },
    ...(accountantId ? { business: { accountantId } } : {}),
    programId,
  }
  const sharedWhere = withProgramExclusions(sharedBaseWhere, exclusionFilters)
  const liveCountViaSharedWhere = await prisma.programMatch.count({ where: sharedWhere })
  const liveMatchesViaSharedWhere = await prisma.programMatch.findMany({
    where: sharedWhere,
    select: { id: true, business: { select: { onomasia: true, afm: true } } },
  })

  return NextResponse.json({
    program: { id: program.id, title: program.title, excludeTags: program.excludeTags, requireTags: program.requireTags, excludedLegalForms: program.excludedLegalForms },
    totalRaw: rows.length,
    visibleCount: rows.filter(r => r.visible).length,
    liveCountViaSharedWhere,
    sharedWhereUsed: sharedWhere,
    liveMatchesViaSharedWhere: liveMatchesViaSharedWhere.map(m => ({ afm: m.business.afm, name: m.business.onomasia })),
    rows,
  })
}
