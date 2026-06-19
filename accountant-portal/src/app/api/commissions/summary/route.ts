import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (session.user.role === 'ADMIN') {
    // Admin summary
    const [pending, approved, paid, cancelled, byAccountant] = await Promise.all([
      prisma.commission.aggregate({
        where: { status: 'PENDING' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { status: 'APPROVED' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { status: 'PAID' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { status: 'CANCELLED' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.groupBy({
        by: ['accountantId'],
        where: { status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
        _sum: { commissionAmount: true },
        _count: true,
        orderBy: { _sum: { commissionAmount: 'desc' } },
        take: 10,
      }),
    ])

    // Enrich byAccountant with accountant details
    const accountantIds = byAccountant.map(r => r.accountantId)
    const accountants = await prisma.accountant.findMany({
      where: { id: { in: accountantIds } },
      select: { id: true, officeName: true, contactPerson: true },
    })
    const accountantMap = Object.fromEntries(accountants.map(a => [a.id, a]))

    return NextResponse.json({
      pending: { count: pending._count, amount: pending._sum.commissionAmount ?? 0 },
      approved: { count: approved._count, amount: approved._sum.commissionAmount ?? 0 },
      paid: { count: paid._count, amount: paid._sum.commissionAmount ?? 0 },
      cancelled: { count: cancelled._count, amount: cancelled._sum.commissionAmount ?? 0 },
      topAccountants: byAccountant.map(r => ({
        accountant: accountantMap[r.accountantId],
        count: r._count,
        totalAmount: r._sum.commissionAmount ?? 0,
      })),
    })
  } else {
    // Accountant summary — own commissions + monthly breakdown (last 12 months)
    const accountantId = session.user.accountantId!

    const [pending, approved, paid, cancelled, allCommissions] = await Promise.all([
      prisma.commission.aggregate({
        where: { accountantId, status: 'PENDING' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { accountantId, status: 'APPROVED' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { accountantId, status: 'PAID' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { accountantId, status: 'CANCELLED' },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.commission.findMany({
        where: {
          accountantId,
          status: { in: ['APPROVED', 'PAID'] },
          createdAt: {
            gte: new Date(new Date().setMonth(new Date().getMonth() - 11)),
          },
        },
        select: { createdAt: true, commissionAmount: true },
      }),
    ])

    // Build monthly breakdown
    const monthlyMap: Record<string, number> = {}
    for (const c of allCommissions) {
      const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = (monthlyMap[key] ?? 0) + c.commissionAmount
    }

    // Build 12-month array
    const monthly = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly.push({ month: key, amount: monthlyMap[key] ?? 0 })
    }

    return NextResponse.json({
      pending: { count: pending._count, amount: pending._sum.commissionAmount ?? 0 },
      approved: { count: approved._count, amount: approved._sum.commissionAmount ?? 0 },
      paid: { count: paid._count, amount: paid._sum.commissionAmount ?? 0 },
      cancelled: { count: cancelled._count, amount: cancelled._sum.commissionAmount ?? 0 },
      monthly,
    })
  }
}
