import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notIndividualWhere } from '@/lib/business-filters'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') || '12')

  const since = new Date()
  since.setMonth(since.getMonth() - months)

  // All accountants with their businesses
  const accountants = await prisma.accountant.findMany({
    select: {
      id: true,
      officeName: true,
      contactPerson: true,
      email: true,
      active: true,
      businesses: {
        where: notIndividualWhere,
        select: { id: true, createdAt: true, updatedAt: true, afm: true, onomasia: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { officeName: 'asc' },
  })

  // Per-accountant summary + monthly breakdown
  const result = accountants.map(acc => {
    const businesses = acc.businesses
    const lastAdded = businesses[0]?.createdAt ?? null
    const lastEdited = businesses.reduce<Date | null>((max, b) => {
      const u = new Date(b.updatedAt)
      return !max || u > max ? u : max
    }, null)

    // Monthly additions (within window)
    const monthly: Record<string, number> = {}
    for (const b of businesses) {
      const d = new Date(b.createdAt)
      if (d >= since) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthly[key] = (monthly[key] || 0) + 1
      }
    }

    // Recent activity (added or edited in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentlyAdded = businesses.filter(b => new Date(b.createdAt) >= thirtyDaysAgo).length
    const recentlyEdited = businesses.filter(b =>
      new Date(b.updatedAt) >= thirtyDaysAgo && new Date(b.createdAt) < thirtyDaysAgo
    ).length

    return {
      id: acc.id,
      officeName: acc.officeName,
      contactPerson: acc.contactPerson,
      email: acc.email,
      active: acc.active,
      totalBusinesses: businesses.length,
      lastAdded,
      lastEdited,
      recentlyAdded,
      recentlyEdited,
      monthly,
    }
  })

  // Build sorted month labels for the window
  const labels: string[] = []
  const cursor = new Date(since)
  cursor.setDate(1)
  const now = new Date()
  while (cursor <= now) {
    labels.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return NextResponse.json({ accountants: result, labels })
}
