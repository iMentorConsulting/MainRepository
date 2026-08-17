import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncCampaignStats } from '@/lib/gemi-campaign-sync'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const subjectOverride: string | null = typeof body.subject === 'string' ? body.subject.trim() || null : null

  const campaign = await (prisma.gemiCampaign as any).findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.channel !== 'EMAIL' && campaign.channel !== 'EMAIL_AND_VIBER') {
    return NextResponse.json({ error: 'Only EMAIL campaigns can be resent' }, { status: 400 })
  }
  if (campaign.status !== 'SENT') {
    return NextResponse.json({ error: 'Campaign must be in SENT status' }, { status: 400 })
  }

  // ── Step 1: Fresh sync from Moosend ────────────────────────────────────────
  // Ensures openedAt / bouncedAt / unsubscribedAt are up-to-date before we
  // decide who is a non-opener. If sync fails we proceed with stale data and
  // log the error — better to send to slightly stale data than to abort.
  let synced = false
  let syncedRecipients = 0
  if (campaign.moosendCampaignId) {
    try {
      const syncResult = await syncCampaignStats(id, campaign.moosendCampaignId)
      synced = true
      syncedRecipients = syncResult.recipientsUpdated
    } catch (err) {
      console.error('[ResendNonOpeners] sync failed, proceeding with existing data:', err instanceof Error ? err.message : err)
    }
  }

  // ── Step 2: Load all sent EMAIL recipients ─────────────────────────────────
  const allSent = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId: id, channel: 'EMAIL', status: 'sent' },
    select: { id: true, gemiId: true, recipient: true, openedAt: true, clickedAt: true, bouncedAt: true, unsubscribedAt: true },
  })

  // ── Step 3: Classify & filter ──────────────────────────────────────────────
  // A "safe non-opener" must pass all four checks:
  //   (a) never opened or clicked (click implies open even if pixel blocked)
  //   (b) did not bounce on this campaign
  //   (c) did not unsubscribe via this campaign's email
  //   (d) not globally unsubscribed in the GEMI pool (checked via GemiLookup)
  let alreadyOpened = 0
  let bounced = 0
  let campaignUnsub = 0

  const candidates = allSent.filter(r => {
    if (r.openedAt || r.clickedAt) { alreadyOpened++; return false }
    if (r.bouncedAt) { bounced++; return false }
    if (r.unsubscribedAt) { campaignUnsub++; return false }
    return true
  })

  // Check (d): global unsubscribe pool
  let globalUnsub = 0
  let safeRecipients = candidates
  if (candidates.length > 0) {
    const globallyUnsubscribed = await prisma.gemiLookup.findMany({
      where: { id: { in: candidates.map(r => r.gemiId) }, unsubscribedAt: { not: null } },
      select: { id: true },
    })
    const globalUnsubIds = new Set(globallyUnsubscribed.map(b => b.id))
    safeRecipients = candidates.filter(r => !globalUnsubIds.has(r.gemiId))
    globalUnsub = candidates.length - safeRecipients.length
  }

  const excluded = { alreadyOpened, bounced, campaignUnsub, globalUnsub }

  if (safeRecipients.length === 0) {
    return NextResponse.json({ recipientCount: 0, excluded, synced, syncedRecipients })
  }

  // ── Step 4: Create the resend campaign ─────────────────────────────────────
  const newSubject = subjectOverride ?? campaign.subject ?? ''
  const newCampaign = await (prisma.gemiCampaign as any).create({
    data: {
      title: `${campaign.title} — Επαναποστολή`,
      channel: 'EMAIL',
      subject: newSubject,
      previewText: campaign.previewText,
      htmlContent: campaign.htmlContent,
      messageTemplate: campaign.messageTemplate,
      programId: campaign.programId,
      programId2: campaign.programId2,
      programId3: (campaign as any).programId3 ?? null,
      status: 'SENDING',
      sentAt: new Date(),
      createdBy: session.user.id,
    },
  })

  await prisma.gemiCampaignRecipient.createMany({
    data: safeRecipients.map(r => ({
      campaignId: newCampaign.id,
      gemiId: r.gemiId,
      recipient: r.recipient,
      channel: 'EMAIL',
      status: 'pending',
    })),
  })

  console.log(`[ResendNonOpeners] campaign ${id} → new campaign ${newCampaign.id} with ${safeRecipients.length} recipients (excluded: ${JSON.stringify(excluded)})`)

  return NextResponse.json({
    newCampaignId: newCampaign.id,
    recipientCount: safeRecipients.length,
    excluded,
    synced,
    syncedRecipients,
  })
}
