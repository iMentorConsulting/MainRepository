import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = session.user.role === 'ACCOUNTANT'
    ? { campaign: { accountantId: session.user.accountantId || undefined } }
    : {}

  const [total, sent, failed, opened, clicked, byChannel, byCampaign] = await Promise.all([
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.count({ where: { ...where, status: 'sent' } }),
    prisma.campaignRecipient.count({ where: { ...where, status: 'failed' } }),
    prisma.campaignRecipient.count({ where: { ...where, openedAt: { not: null } } }),
    prisma.campaignRecipient.count({ where: { ...where, clickedAt: { not: null } } }),
    prisma.campaignRecipient.groupBy({
      by: ['channel'],
      where,
      _count: { _all: true },
    }),
    prisma.campaignRecipient.groupBy({
      by: ['campaignId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { campaignId: 'desc' } },
      take: 10,
    }),
  ])

  const campaignIds = byCampaign.map(c => c.campaignId)
  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, title: true, channel: true, status: true, sentAt: true },
  })
  const campaignById = new Map(campaigns.map(c => [c.id, c]))

  const topCampaigns = byCampaign.map(c => ({
    campaign: campaignById.get(c.campaignId) || null,
    recipients: c._count._all,
  })).filter(c => c.campaign)

  return NextResponse.json({
    total,
    sent,
    failed,
    opened,
    clicked,
    byChannel: byChannel.map(c => ({ channel: c.channel, count: c._count._all })),
    topCampaigns,
  })
}
