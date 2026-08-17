import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const accountantId = searchParams.get('accountantId')
  const stage = searchParams.get('stage')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: any = {}

  if (session.user.role === 'ACCOUNTANT') {
    where.accountantId = session.user.accountantId
    // Accountants never see CANCELLED commissions — those are admin-only corrections
    where.status = { not: 'CANCELLED' }
  } else if (accountantId) {
    where.accountantId = accountantId
  }

  if (status) where.status = status
  if (stage) where.stage = stage

  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      where.createdAt.lte = toDate
    }
  }

  const commissions = await prisma.commission.findMany({
    where,
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
      paymentRequest: {
        include: {
          service: { select: { id: true, name: true } },
          program: { select: { id: true, title: true } },
        },
      },
      financePayment: { select: { serviceName: true, category: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(commissions)
}
