import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCampaignStats, getCampaignUnsubscribers } from '@/lib/moosend'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const campaign = await prisma.gemiCampaign.findUnique({ where: { id } })
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (campaign.channel !== 'EMAIL' && campaign.channel !== 'EMAIL_AND_VIBER') {
    return NextResponse.json({ error: 'Stats sync is only available for email campaigns' }, { status: 400 })
  }
  if (!campaign.moosendCampaignId) {
    return NextResponse.json({ error: 'No moosendCampaignId on this campaign' }, { status: 400 })
  }

  try {
    const stats = await getCampaignStats(campaign.moosendCampaignId)

    // Moosend cannot track clicks on per-recipient merge-tag URLs, but we
    // record those clicks ourselves at the /ge/{token} redirect — use
    // whichever count is higher.
    const ownClicks = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: id, channel: 'EMAIL', clickedAt: { not: null } },
    })

    // Pull Moosend-side unsubscribers back into the ΓΕΜΗ pool so they are
    // permanently excluded from all future Logistis campaigns.
    let unsubscribedMarked = 0
    const unsubEmails = await getCampaignUnsubscribers(campaign.moosendCampaignId)
    if (unsubEmails.length > 0) {
      const { count } = await prisma.gemiLookup.updateMany({
        where: { email: { in: unsubEmails, mode: 'insensitive' }, unsubscribedAt: null },
        data: { unsubscribedAt: new Date() },
      })
      unsubscribedMarked = count
      if (count > 0) console.log(`[SyncStats] marked ${count} Moosend unsubscribers in GEMI pool:`, unsubEmails.join(','))
    }

    const updated = await prisma.gemiCampaign.update({
      where: { id },
      data: {
        totalDelivered: stats.delivered,
        totalOpened: stats.opened,
        totalClicked: Math.max(stats.clicked, ownClicks),
        totalBounced: stats.bounced,
        totalUnsubscribed: stats.unsubscribed,
        statsLastFetchedAt: new Date(),
      },
    })

    return NextResponse.json({
      totalDelivered: updated.totalDelivered,
      totalOpened: updated.totalOpened,
      totalClicked: updated.totalClicked,
      totalBounced: updated.totalBounced,
      totalUnsubscribed: updated.totalUnsubscribed,
      statsLastFetchedAt: updated.statsLastFetchedAt,
      unsubscribedMarked,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
