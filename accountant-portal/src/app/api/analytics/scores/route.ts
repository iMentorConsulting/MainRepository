import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function calcScore(totalBiz: number, matchedBiz: number, campaignsSent: number, contactBiz: number) {
  const matchRate   = totalBiz > 0 ? matchedBiz  / totalBiz : 0
  const contactRate = totalBiz > 0 ? contactBiz  / totalBiz : 0
  const vol  = Math.min(30, Math.round((Math.min(totalBiz, 200)     / 200) * 30))
  const mat  = Math.round(matchRate   * 25)
  const camp = Math.min(25, Math.round((Math.min(campaignsSent, 10) / 10)  * 25))
  const dat  = Math.round(contactRate * 20)
  return { total: vol + mat + camp + dat, vol, mat, camp, dat, matchPct: Math.round(matchRate * 100), contactPct: Math.round(contactRate * 100) }
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
        select: { email: true, phone: true, programMatches: { select: { id: true }, take: 1 } },
      },
      campaigns: {
        where: { status: 'SENT' },
        select: { id: true },
      },
    },
    orderBy: { officeName: 'asc' },
  })

  const result = accountants.map(acc => {
    const totalBiz     = acc.businesses.length
    const matchedBiz   = acc.businesses.filter(b => b.programMatches.length > 0).length
    const contactBiz   = acc.businesses.filter(b => b.email || b.phone).length
    const campaignsSent = acc.campaigns.length
    const score = calcScore(totalBiz, matchedBiz, campaignsSent, contactBiz)
    return {
      id: acc.id,
      officeName: acc.officeName,
      contactPerson: acc.contactPerson,
      active: acc.active,
      totalBusinesses: totalBiz,
      campaignsSent,
      score,
    }
  })

  return NextResponse.json(result)
}
