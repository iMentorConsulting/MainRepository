import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      program: true,
      accountant: true,
    }
  })

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find eligible businesses
  let businesses = await prisma.business.findMany({
    include: {
      accountant: true,
      activities: { where: { firmActKind: 1 }, take: 1 },
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

  // If campaign has program, filter by matched businesses
  if (campaign.programId) {
    const matchedIds = await prisma.programMatch.findMany({
      where: { programId: campaign.programId },
      select: { businessId: true }
    })
    const matchedSet = new Set(matchedIds.map(m => m.businessId))
    businesses = businesses.filter(b => matchedSet.has(b.id))
  }

  let sent = 0
  let failed = 0

  for (const business of businesses) {
    const recipient = campaign.channel === 'EMAIL' ? business.email : business.viberPhone
    if (!recipient) {
      failed++
      continue
    }

    const variables: Record<string, string> = {
      business_name: business.onomasia || business.afm,
      afm: business.afm,
      accountant_name: business.accountant?.contactPerson || '',
      accountant_office: business.accountant?.officeName || '',
      program_title: campaign.program?.title || '',
      kad_description: business.activities[0]?.firmActCode || '',
      unsubscribe_link: `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/api/unsubscribe/${business.unsubscribeToken}`,
    }

    const message = renderTemplate(campaign.messageTemplate, variables)
    let success = false

    try {
      if (campaign.channel === 'EMAIL') {
        success = await sendEmail({
          to: recipient,
          subject: campaign.title,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">${message.replace(/\n/g, '<br>')}</div>`,
        })
      } else {
        success = await sendViberMessage({ to: recipient, text: message })
      }
    } catch {}

    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        businessId: business.id,
        channel: campaign.channel,
        recipient,
        status: success ? 'sent' : 'failed',
        sentAt: success ? new Date() : null,
      }
    })

    if (success) sent++
    else failed++
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENT', sentAt: new Date() }
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'SEND_CAMPAIGN',
    entity: 'Campaign',
    entityId: campaign.id,
    details: `Sent to ${sent} recipients, ${failed} failed`,
  })

  return NextResponse.json({ sent, failed, total: businesses.length })
}
