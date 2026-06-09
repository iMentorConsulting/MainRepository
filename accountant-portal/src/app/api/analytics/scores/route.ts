import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 1 point per business, +1 per business with contact, +1 per campaign recipient sent
// No ceiling — the more you do, the higher the score
function calcScore(totalBiz: number, contactBiz: number, campaignRecipients: number) {
  const vol  = totalBiz          // 1pt per business
  const dat  = contactBiz        // 1pt per business with contact info
  const camp = campaignRecipients // 1pt per campaign message sent to a client
  const total = vol + dat + camp
  return { total, vol, dat, camp }
}

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
      businesses: {
        select: { email: true, phone: true },
      },
      campaigns: {
        where: { status: 'SENT' },
        select: { _count: { select: { recipients: true } } },
      },
    },
    orderBy: { officeName: 'asc' },
  })

  const result = accountants.map(acc => {
    const totalBiz          = acc.businesses.length
    const contactBiz        = acc.businesses.filter(b => b.email || b.phone).length
    const campaignRecipients = acc.campaigns.reduce((s, c) => s + (c._count?.recipients ?? 0), 0)
    const score = calcScore(totalBiz, contactBiz, campaignRecipients)
    return {
      id: acc.id,
      officeName: acc.officeName,
      contactPerson: acc.contactPerson,
      active: acc.active,
      totalBusinesses: totalBiz,
      contactBiz,
      campaignRecipients,
      score,
    }
  })

  return NextResponse.json(result)
}
