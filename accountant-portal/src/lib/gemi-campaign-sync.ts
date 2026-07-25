import { prisma } from '@/lib/prisma'
import { getCampaignStats, getCampaignSubscriberEngagement, getCampaignUnsubscribers } from '@/lib/moosend'

export interface SyncResult {
  recipientsUpdated: number
  unsubscribedMarked: number
  totalOpened: number
  totalDelivered: number
  totalClicked: number
  totalBounced: number
  totalUnsubscribed: number
  statsLastFetchedAt: Date | null
}

export async function syncCampaignStats(campaignId: string, moosendCampaignId: string): Promise<SyncResult> {
  const [stats, engagement] = await Promise.all([
    getCampaignStats(moosendCampaignId),
    getCampaignSubscriberEngagement(moosendCampaignId),
  ])

  const ownClicks = await prisma.gemiCampaignRecipient.count({
    where: { campaignId, channel: 'EMAIL', clickedAt: { not: null } },
  })

  // Pull Moosend-side unsubscribers into the GEMI pool so they are
  // permanently excluded from all future Logistis campaigns.
  let unsubscribedMarked = 0
  const unsubEmails = await getCampaignUnsubscribers(moosendCampaignId)
  if (unsubEmails.length > 0) {
    const { count } = await prisma.gemiLookup.updateMany({
      where: { email: { in: unsubEmails, mode: 'insensitive' }, unsubscribedAt: null },
      data: { unsubscribedAt: new Date() },
    })
    unsubscribedMarked = count
    if (count > 0) console.log(`[SyncStats] marked ${count} Moosend unsubscribers in GEMI pool:`, unsubEmails.join(','))
  }

  // Update per-recipient engagement.
  let recipientsUpdated = 0
  if (engagement.size > 0) {
    const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
      where: { campaignId, channel: 'EMAIL' },
      select: { id: true, recipient: true, clickedAt: true, clickCount: true },
    })
    for (const rec of emailRecipients) {
      const eng = engagement.get(rec.recipient.toLowerCase())
      if (!eng) continue
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
    where: { id: campaignId },
    data: {
      totalDelivered: stats.delivered,
      totalOpened: stats.opened,
      totalClicked: Math.max(stats.clicked, ownClicks),
      totalBounced: stats.bounced,
      totalUnsubscribed: stats.unsubscribed,
      statsLastFetchedAt: new Date(),
    },
  })

  return {
    recipientsUpdated,
    unsubscribedMarked,
    totalOpened: updated.totalOpened,
    totalDelivered: updated.totalDelivered,
    totalClicked: updated.totalClicked,
    totalBounced: updated.totalBounced,
    totalUnsubscribed: updated.totalUnsubscribed,
    statsLastFetchedAt: updated.statsLastFetchedAt,
  }
}
