import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCampaignStats, getCampaignUnsubscribers, getCampaignSubscriberEngagement } from '@/lib/moosend'

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
    // Fetch aggregate stats and per-subscriber engagement from Moosend in parallel.
    const [stats, engagement] = await Promise.all([
      getCampaignStats(campaign.moosendCampaignId),
      getCampaignSubscriberEngagement(campaign.moosendCampaignId),
    ])

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

    // Update per-recipient engagement on GemiCampaignRecipient rows.
    // We match by email (recipient field) — Moosend engagement data is keyed by email.
    let recipientsUpdated = 0
    if (engagement.size > 0) {
      const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
        where: { campaignId: id, channel: 'EMAIL' },
        select: { id: true, recipient: true, clickedAt: true, clickCount: true },
      })

      for (const rec of emailRecipients) {
        const eng = engagement.get(rec.recipient.toLowerCase())
        if (!eng) continue

        // For clicks: prefer our own tracking (clickedAt already set by /ge/{token} redirect)
        // but use Moosend's click count if it's higher. If Moosend detected clicks but we
        // didn't track them ourselves, also set clickedAt from Moosend.
        const mergedClickCount = Math.max(rec.clickCount, eng.clickCount)
        const mergedClickedAt = rec.clickedAt ?? (eng.clickCount > 0 ? (eng.clickedAt ?? new Date()) : null)

        await prisma.gemiCampaignRecipient.update({
          where: { id: rec.id },
          data: {
            openedAt: eng.openCount > 0 ? (eng.openedAt ?? new Date()) : undefined,
            openCount: eng.openCount,
            clickedAt: mergedClickedAt ?? undefined,
            clickCount: mergedClickCount,
            bouncedAt: eng.bounced ? (eng.bouncedAt ?? new Date()) : undefined,
            unsubscribedAt: eng.unsubscribed ? (eng.unsubscribedAt ?? new Date()) : undefined,
          },
        })
        recipientsUpdated++
      }
      console.log(`[SyncStats] updated per-recipient engagement for ${recipientsUpdated}/${emailRecipients.length} EMAIL recipients`)
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
      recipientsUpdated,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
