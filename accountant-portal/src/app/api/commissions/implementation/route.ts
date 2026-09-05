import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateCommission } from '@/lib/commission'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { businessId, accountantId, programId, grossAmount, commissionPolicyId, notes } = body

  if (!businessId || !accountantId || !grossAmount) {
    return NextResponse.json(
      { error: 'businessId, accountantId, and grossAmount are required' },
      { status: 400 }
    )
  }

  // Validate business and accountant exist
  const [business, accountant] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.accountant.findUnique({ where: { id: accountantId } }),
  ])

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  if (!accountant) return NextResponse.json({ error: 'Accountant not found' }, { status: 404 })

  const grossCents = Math.round(grossAmount)

  let commissionAmount = 0
  let commissionRate: number | null = null

  if (commissionPolicyId) {
    const policy = await prisma.commissionPolicy.findUnique({ where: { id: commissionPolicyId } })
    if (!policy) return NextResponse.json({ error: 'Commission policy not found' }, { status: 404 })

    if (!policy.appliesToImplementation) {
      return NextResponse.json(
        { error: 'This policy does not apply to the IMPLEMENTATION stage' },
        { status: 400 }
      )
    }

    const override = await prisma.accountantCommissionOverride.findUnique({
      where: {
        accountantId_commissionPolicyId: { accountantId, commissionPolicyId },
      },
    })

    const calc = calculateCommission(grossCents, policy, override)
    commissionAmount = calc.commissionAmount
    commissionRate = calc.commissionRate
  }

  const commission = await prisma.commission.create({
    data: {
      accountantId,
      businessId,
      commissionPolicyId: commissionPolicyId || null,
      stage: 'IMPLEMENTATION',
      grossAmount: grossCents,
      commissionRate,
      commissionAmount,
      status: 'PENDING',
      notes: notes || null,
    },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
    },
  })

  return NextResponse.json(commission, { status: 201 })
}
