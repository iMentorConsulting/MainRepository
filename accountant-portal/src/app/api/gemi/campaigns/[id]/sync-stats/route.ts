import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncCampaignStats } from '@/lib/gemi-campaign-sync'

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
    const result = await syncCampaignStats(id, campaign.moosendCampaignId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
