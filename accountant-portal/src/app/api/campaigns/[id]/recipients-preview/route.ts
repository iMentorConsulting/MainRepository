import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && campaign.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let businesses = await prisma.business.findMany({
    select: {
      id: true,
      onomasia: true,
      afm: true,
      email: true,
      phone: true,
      viberPhone: true,
      excludedFromCampaigns: true,
      accountantId: true,
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

  if (campaign.programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId: campaign.programId },
      select: { businessId: true, status: true },
    })
    const matchedIds = new Set(matches.filter(m => m.status !== 'REJECTED').map(m => m.businessId))
    businesses = businesses.filter(b => matchedIds.has(b.id))
  }

  // The campaign template is chosen at creation time as either an
  // "with accountant" or "direct" variant — the resulting messageTemplate
  // text carries {{accountant_name}}/{{accountant_office}} placeholders
  // only in the "with accountant" variant, so we detect it from the text.
  const usesAccountantTemplate = /\{\{accountant_(name|office)\}\}/.test(campaign.messageTemplate)

  const recipients = businesses
    .map(b => ({
      id: b.id,
      name: b.onomasia || b.afm,
      contact: campaign.channel === 'EMAIL' ? b.email : (b.viberPhone || b.phone),
      excludedFromCampaigns: b.excludedFromCampaigns,
      missingAccountant: usesAccountantTemplate && !b.accountantId,
    }))
    .filter(b => !!b.contact)

  return NextResponse.json({ recipients })
}
