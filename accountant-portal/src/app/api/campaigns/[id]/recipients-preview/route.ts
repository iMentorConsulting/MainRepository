import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let businesses = await prisma.business.findMany({
    select: {
      id: true,
      onomasia: true,
      afm: true,
      email: true,
      viberPhone: true,
      excludedFromCampaigns: true,
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

  if (campaign.programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId: campaign.programId },
      select: { businessId: true },
    })
    const matchedIds = new Set(matches.map(m => m.businessId))
    businesses = businesses.filter(b => matchedIds.has(b.id))
  }

  const recipients = businesses
    .map(b => ({
      id: b.id,
      name: b.onomasia || b.afm,
      contact: campaign.channel === 'EMAIL' ? b.email : b.viberPhone,
      excludedFromCampaigns: b.excludedFromCampaigns,
    }))
    .filter(b => !!b.contact)

  return NextResponse.json({ recipients })
}
