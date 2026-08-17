import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEligibilityQuestions, parseEligibilityStorage, ProgramQualitativeCriteria, CustomQuestion } from '@/lib/eligibility-questions'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const program = await prisma.program.findUnique({ where: { id: params.id } })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const criteriaList = program.extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
    : []

  const { overrides, custom } = parseEligibilityStorage(program.eligibilityQuestions)
  const criteria: ProgramQualitativeCriteria = {
    otherRequirements: program.otherRequirements,
    extraCriteriaLabels: criteriaList,
    minInvestment: program.minInvestment,
    maxInvestment: program.maxInvestment,
  }
  const questions = buildEligibilityQuestions(criteria, overrides, custom)
  // Unfiltered list (ignores skip flags) so the admin UI can still show the
  // original wording of skipped requirements for review/restore.
  const allQuestions = buildEligibilityQuestions(criteria, {}, custom)

  return NextResponse.json({ questions, overrides, custom, allQuestions })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { overrides, custom } = await request.json()
  if (typeof overrides !== 'object' || overrides === null) {
    return NextResponse.json({ error: 'overrides is required' }, { status: 400 })
  }
  if (custom !== undefined && !Array.isArray(custom)) {
    return NextResponse.json({ error: 'custom must be an array' }, { status: 400 })
  }

  const program = await prisma.program.update({
    where: { id: params.id },
    data: { eligibilityQuestions: { overrides, custom: (custom || []) as CustomQuestion[] } as any },
  })

  return NextResponse.json({ ok: true, eligibilityQuestions: program.eligibilityQuestions })
}
