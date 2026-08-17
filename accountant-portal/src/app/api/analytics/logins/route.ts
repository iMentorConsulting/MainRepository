import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountants = await prisma.accountant.findMany({
    select: {
      id: true,
      officeName: true,
      contactPerson: true,
      active: true,
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          loginLogs: {
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { createdAt: true },
          },
        },
      },
    },
    orderBy: { officeName: 'asc' },
  })

  const result = accountants.map(acc => {
    const user = acc.users[0] ?? null
    const logs = user?.loginLogs ?? []
    // count logins per day for last 30 days
    const dailyMap: Record<string, number> = {}
    for (const log of logs) {
      const day = log.createdAt.toISOString().slice(0, 10)
      dailyMap[day] = (dailyMap[day] || 0) + 1
    }
    return {
      id: acc.id,
      officeName: acc.officeName,
      contactPerson: acc.contactPerson,
      active: acc.active,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      lastLoginAt: user?.lastLoginAt ?? null,
      totalLogins30d: logs.length,
      dailyLogins: dailyMap,
    }
  })

  return NextResponse.json(result)
}
