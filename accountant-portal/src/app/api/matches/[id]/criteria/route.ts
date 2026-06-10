import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.programMatch.findUnique({
    where: { id: params.id },
    select: { business: { select: { accountantId: true } }, rejectionReason: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && existing.business.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { criterionId, value } = await request.json()
  if (!criterionId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (value === null) {
    await prisma.matchCriterionCheck.deleteMany({
      where: { matchId: params.id, criterionId },
    })
  } else if (['PASS', 'FAIL'].includes(value)) {
    await prisma.matchCriterionCheck.upsert({
      where: { matchId_criterionId: { matchId: params.id, criterionId } },
      update: { value },
      create: { matchId: params.id, criterionId, value },
    })
  } else {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // A FAILed criterion means the business doesn't meet a hard requirement —
  // automatically mark the match as rejected with that criterion as the reason.
  const failedCheck = await prisma.matchCriterionCheck.findFirst({
    where: { matchId: params.id, value: 'FAIL' },
    include: { criterion: true },
    orderBy: { updatedAt: 'asc' },
  })

  const allCriteria = await prisma.eligibilityCriterion.findMany({ select: { label: true } })
  const criterionLabels = new Set(allCriteria.map(c => c.label))
  const currentReasonIsCriterionDerived = !!existing.rejectionReason && criterionLabels.has(existing.rejectionReason.label)

  if (failedCheck) {
    let reason = await prisma.rejectionReason.findFirst({ where: { label: failedCheck.criterion.label } })
    if (!reason) {
      reason = await prisma.rejectionReason.create({ data: { label: failedCheck.criterion.label, programIds: [] } })
    }
    await prisma.programMatch.update({
      where: { id: params.id },
      data: { rejectionReasonId: reason.id, status: 'REJECTED' },
    })
  } else if (currentReasonIsCriterionDerived) {
    await prisma.programMatch.update({
      where: { id: params.id },
      data: { rejectionReasonId: null, status: 'POTENTIAL' },
    })
  }

  const match = await prisma.programMatch.findUnique({
    where: { id: params.id },
    include: { criterionChecks: { include: { criterion: true } }, rejectionReason: true },
  })
  return NextResponse.json(match)
}
