import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountantId = session.user.role === 'ACCOUNTANT'
    ? (session.user as any).accountantId ?? null
    : null

  const bizWhere = accountantId ? { accountantId } : {}
  const campWhere = accountantId ? { accountantId } : {}

  // All businesses (for growth + scoring)
  const businesses = await prisma.business.findMany({
    where: bizWhere,
    select: { createdAt: true, email: true, phone: true },
    orderBy: { createdAt: 'asc' },
  })

  // Growth: group by month, cumulative
  const monthMap: Record<string, number> = {}
  for (const b of businesses) {
    const key = b.createdAt.toISOString().slice(0, 7)
    monthMap[key] = (monthMap[key] || 0) + 1
  }
  let running = 0
  const growth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, added]) => {
      running += added
      return { month, added, total: running }
    })

  // Scoring: 1pt/business, 1pt/business-with-contact, 1pt/campaign-recipient
  const totalBusinesses = businesses.length
  const contactBiz = businesses.filter(b => b.email || b.phone).length

  const campaigns = await prisma.campaign.findMany({
    where: { ...campWhere, status: 'SENT' },
    include: {
      program: { select: { title: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const allCampaigns = await prisma.campaign.findMany({
    where: campWhere,
    include: { program: { select: { title: true } }, _count: { select: { recipients: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const campaignRecipients = campaigns.reduce((s, c) => s + (c._count?.recipients ?? 0), 0)
  const volScore  = totalBusinesses
  const datScore  = contactBiz
  const campScore = campaignRecipients
  const totalScore = volScore + datScore + campScore

  return NextResponse.json({
    growth,
    score: {
      total: totalScore,
      breakdown: {
        volume:    { score: volScore,  value: totalBusinesses,    label: 'Επιχειρήσεις (×1)' },
        data:      { score: datScore,  value: contactBiz,         label: 'Με στοιχεία επικοινωνίας (×1)' },
        campaigns: { score: campScore, value: campaignRecipients, label: 'Μηνύματα καμπάνιας (×1)' },
      },
    },
    campaigns: allCampaigns.map(c => ({
      id: c.id,
      title: c.title,
      status: c.status,
      channel: c.channel,
      program: c.program?.title ?? null,
      recipients: c._count.recipients,
      sentAt: c.sentAt,
      createdAt: c.createdAt,
    })),
  })
}
