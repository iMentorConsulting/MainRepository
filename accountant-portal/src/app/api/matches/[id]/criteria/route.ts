import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.programMatch.findUnique({ where: { id: params.id }, select: { business: { select: { accountantId: true } } } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && existing.business.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { criterionId, value } = await request.json()
  if (!criterionId || !['PASS', 'FAIL'].includes(value)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const check = await prisma.matchCriterionCheck.upsert({
    where: { matchId_criterionId: { matchId: params.id, criterionId } },
    update: { value },
    create: { matchId: params.id, criterionId, value },
  })

  return NextResponse.json(check)
}
