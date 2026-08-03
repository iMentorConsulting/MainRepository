import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncCampaignStats } from '@/lib/gemi-campaign-sync'
import { findMoosendCampaignIdsByNamePrefix } from '@/lib/moosend'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Optional body: { additionalMoosendIds: string } — comma-separated extra Moosend campaign IDs
  let additionalMoosendIds: string[] = []
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.additionalMoosendIds) {
      additionalMoosendIds = String(body.additionalMoosendIds).split(',').map((s: string) => s.trim()).filter(Boolean)
    }
  } catch { /* no body */ }

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
    // Auto-discover all Moosend campaign parts (μέρος 2, μέρος 3, …) by name prefix
    const discoveredIds = await findMoosendCampaignIdsByNamePrefix(campaign.title)
    const storedIdSet = new Set(campaign.moosendCampaignId.split(',').filter(Boolean))
    console.log(`[SyncStats] stored IDs: ${Array.from(storedIdSet).join(', ')} | discovered: ${discoveredIds.join(', ')} | manual: ${additionalMoosendIds.join(', ')}`)
    for (const did of discoveredIds) storedIdSet.add(did)
    for (const mid of additionalMoosendIds) storedIdSet.add(mid)
    const allIds = Array.from(storedIdSet).join(',')

    // Persist newly discovered IDs so future syncs are faster
    if (allIds !== campaign.moosendCampaignId) {
      await prisma.gemiCampaign.update({ where: { id }, data: { moosendCampaignId: allIds } })
      console.log(`[SyncStats] updated stored Moosend IDs for "${campaign.title}": ${allIds}`)
    }

    const result = await syncCampaignStats(id, allIds)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
