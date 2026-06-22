import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEligibilityQuestions, ProgramEligibilityCriteria } from '@/lib/eligibility-questions'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const program = await prisma.program.findUnique({ where: { id: params.id } })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const overrides = (program.eligibilityQuestions as Record<string, string> | null) || {}
  const questions = buildEligibilityQuestions(program as unknown as ProgramEligibilityCriteria, overrides)

  return NextResponse.json({ questions, overrides })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { overrides } = await request.json()
  if (typeof overrides !== 'object' || overrides === null) {
    return NextResponse.json({ error: 'overrides is required' }, { status: 400 })
  }

  const program = await prisma.program.update({
    where: { id: params.id },
    data: { eligibilityQuestions: overrides },
  })

  return NextResponse.json({ ok: true, eligibilityQuestions: program.eligibilityQuestions })
}
