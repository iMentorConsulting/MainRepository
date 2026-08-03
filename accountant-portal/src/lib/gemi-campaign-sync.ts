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
  debug: {
    moosendIds: string[]
    engagementPerPart: { id: string; openers: number }[]
    totalEngagementEmails: number
    recipientsInDb: number
    recipientsMatched: number
    recipientsNotInEngagement: string[]
  }
}

export async function syncCampaignStats(campaignId: string, moosendCampaignId: string): Promise<SyncResult> {
  const ids = moosendCampaignId.split(',').filter(Boolean)

  const [allStats, allEngagement, allUnsubEmails] = await Promise.all([
    Promise.all(ids.map(id => getCampaignStats(id))),
    Promise.all(ids.map(id => getCampaignSubscriberEngagement(id))),
    Promise.all(ids.map(id => getCampaignUnsubscribers(id))),
  ])

  const stats = allStats.reduce(
    (acc, s) => ({
      delivered: acc.delivered + (s.delivered || 0),
      opened: acc.opened + (s.opened || 0),
      clicked: acc.clicked + (s.clicked || 0),
      bounced: acc.bounced + (s.bounced || 0),
      unsubscribed: acc.unsubscribed + (s.unsubscribed || 0),
    }),
    { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
  )

  // Track per-part opener counts for debug
  const engagementPerPart = ids.map((id, i) => ({ id, openers: allEngagement[i].size }))
  console.log(`[SyncStats] engagement per Moosend part:`, engagementPerPart.map(p => `${p.id}:${p.openers}`).join(', '))

  // Merge per-recipient engagement maps from all parts (last write wins per email)
  const engagement = new Map<string, any>()
  for (const engMap of allEngagement) {
    for (const [email, eng] of Array.from(engMap.entries())) {
      const existing = engagement.get(email)
      if (!existing) {
        engagement.set(email, eng)
      } else {
        engagement.set(email, {
          openCount: Math.max(existing.openCount, eng.openCount),
          openedAt: existing.openedAt ?? eng.openedAt,
          clickCount: Math.max(existing.clickCount, eng.clickCount),
          clickedAt: existing.clickedAt ?? eng.clickedAt,
          bounced: existing.bounced || eng.bounced,
          bouncedAt: existing.bouncedAt ?? eng.bouncedAt,
          unsubscribed: existing.unsubscribed || eng.unsubscribed,
          unsubscribedAt: existing.unsubscribedAt ?? eng.unsubscribedAt,
        })
      }
    }
  }
  console.log(`[SyncStats] total unique emails in merged engagement map: ${engagement.size}`)

  const unsubEmails = Array.from(new Set(allUnsubEmails.flat()))

  const ownClicks = await prisma.gemiCampaignRecipient.count({
    where: { campaignId, channel: 'EMAIL', clickedAt: { not: null } },
  })

  // Pull Moosend-side unsubscribers into the GEMI pool so they are
  // permanently excluded from all future Logistis campaigns.
  let unsubscribedMarked = 0
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
  let recipientsInDb = 0
  let recipientsMatched = 0
  const recipientsNotInEngagement: string[] = []

  if (engagement.size > 0) {
    const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
      where: { campaignId, channel: 'EMAIL' },
      select: { id: true, recipient: true, clickedAt: true, clickCount: true },
    })
    recipientsInDb = emailRecipients.length
    for (const rec of emailRecipients) {
      const eng = engagement.get(rec.recipient.toLowerCase())
      if (!eng) {
        if (recipientsNotInEngagement.length < 20) recipientsNotInEngagement.push(rec.recipient)
        continue
      }
      recipientsMatched++
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
    console.log(`[SyncStats] updated per-recipient engagement for ${recipientsUpdated}/${emailRecipients.length} EMAIL recipients (matched: ${recipientsMatched}, unmatched: ${recipientsNotInEngagement.length})`)
  } else {
    const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
      where: { campaignId, channel: 'EMAIL' },
      select: { id: true },
    })
    recipientsInDb = emailRecipients.length
    console.log(`[SyncStats] engagement map is empty — skipping per-recipient update (${recipientsInDb} recipients in DB)`)
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
    debug: {
      moosendIds: ids,
      engagementPerPart,
      totalEngagementEmails: engagement.size,
      recipientsInDb,
      recipientsMatched,
      recipientsNotInEngagement,
    },
  }
}
