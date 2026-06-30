import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateCommission } from '@/lib/commission'

// GET /api/finance-payments?status=PENDING — admin review list for the Finance payment batch.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const status = request.nextUrl.searchParams.get('status') || 'PENDING'
  const where: any = status === 'ALL' ? {} : { status }

  const payments = await prisma.financePayment.findMany({
    where,
    include: {
      business: {
        select: {
          id: true, afm: true, onomasia: true, email: true, phone: true,
          accountantId: true,
          accountant: { select: { id: true, officeName: true } },
        },
      },
      commission: { select: { id: true, commissionAmount: true, commissionRate: true, status: true } },
    },
    orderBy: { paymentDate: 'desc' },
  })

  // For each matched business with an accountant, check there's a case assignment
  // to I-MENTOR, and compute a commission preview from the applicable policy.
  const enriched = await Promise.all(payments.map(async p => {
    let hasCase = false
    let preview: { commissionAmount: number; commissionRate: number | null; breakdown: string; policyId: string | null } | null = null

    if (p.business?.id) {
      hasCase = !!(await prisma.clientCase.findFirst({ where: { businessId: p.business.id }, select: { id: true } }))
    }

    if (p.business?.accountantId && p.status === 'PENDING') {
      const stage = p.category.includes('ΥΛΟΠΟΙΗΣΗ') ? 'IMPLEMENTATION' : 'APPLICATION'
      const policy = await findApplicablePolicy(p.serviceName, stage)
      if (policy) {
        const override = await prisma.accountantCommissionOverride.findUnique({
          where: { accountantId_commissionPolicyId: { accountantId: p.business.accountantId, commissionPolicyId: policy.id } },
        })
        const calc = calculateCommission(p.amount, policy, override)
        preview = { ...calc, policyId: policy.id }
      }
    }

    return { ...p, hasCase, commissionPreview: preview }
  }))

  return NextResponse.json({ payments: enriched })
}

export async function findApplicablePolicy(serviceName: string, stage: 'APPLICATION' | 'IMPLEMENTATION') {
  const stageFilter = stage === 'APPLICATION' ? { appliesToApplication: true } : { appliesToImplementation: true }
  const byService = await prisma.commissionPolicy.findFirst({
    where: { active: true, ...stageFilter, service: { name: { equals: serviceName, mode: 'insensitive' } } },
  })
  if (byService) return byService
  return prisma.commissionPolicy.findFirst({ where: { active: true, ...stageFilter, serviceId: null } })
}
