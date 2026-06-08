import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate, renderCampaignEmailHtml } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { createAuditLog } from '@/lib/audit'

async function processCampaignSend(
  campaign: any,
  businesses: any[],
  matchReasonByBusiness: Map<string, string[]>,
  userId: string
) {
  let sent = 0
  let failed = 0

  for (const business of businesses) {
    const recipient = campaign.channel === 'EMAIL' ? business.email : (business.viberPhone || business.phone)
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
      match_reason: (matchReasonByBusiness.get(business.id) || []).map(r => `• ${r}`).join('\n'),
      unsubscribe_link: `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/api/unsubscribe/${business.unsubscribeToken}`,
    }

    const message = renderTemplate(campaign.messageTemplate, variables)
    let success = false

    try {
      if (campaign.channel === 'EMAIL') {
        // The footer already renders the unsubscribe link, so drop any
        // trailing line from the template that duplicates it in the body.
        const bodyWithoutUnsubscribe = message
          .split('\n')
          .filter(line => !line.includes(variables.unsubscribe_link))
          .join('\n')
          .trim()

        success = await sendEmail({
          to: recipient,
          subject: campaign.title,
          html: renderCampaignEmailHtml({
            title: campaign.title,
            bodyText: bodyWithoutUnsubscribe,
            recipientName: business.onomasia || business.afm,
            imentorLogoUrl: process.env.IMENTOR_LOGO_URL || '',
            accountantOfficeName: business.accountant?.officeName || '',
            accountantLogoUrl: business.accountant?.logoUrl || '',
            unsubscribeUrl: variables.unsubscribe_link,
          }),
        })
      } else {
        success = await sendViberMessage({ to: recipient, text: message, senderName: business.onomasia || business.afm })
      }
    } catch (err: any) {
      console.error(`[Campaign ${campaign.id}] Send error to ${recipient}:`, err?.message || err)
    }

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
    userId,
    action: 'SEND_CAMPAIGN',
    entity: 'Campaign',
    entityId: campaign.id,
    details: `Sent to ${sent} recipients, ${failed} failed`,
  })

  console.log(`[Campaign ${campaign.id}] Finished: ${sent} sent, ${failed} failed, ${businesses.length} total`)
}

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

  // Optional explicit recipient selection (from the recipients-preview UI)
  let selectedBusinessIds: string[] | null = null
  try {
    const body = await request.json()
    if (Array.isArray(body?.businessIds)) selectedBusinessIds = body.businessIds
  } catch {
    // no body provided — send to all eligible recipients
  }

  // Find eligible businesses
  let businesses = await prisma.business.findMany({
    include: {
      accountant: true,
      activities: { where: { firmActKind: 1 }, take: 1 },
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

  // Always exclude businesses marked as excluded from campaigns
  businesses = businesses.filter(b => !b.excludedFromCampaigns)

  // If a specific recipient list was provided, restrict to it
  if (selectedBusinessIds) {
    const selectedSet = new Set(selectedBusinessIds)
    businesses = businesses.filter(b => selectedSet.has(b.id))
  }

  // If campaign has program, filter by matched businesses and collect match reasons
  let matchReasonByBusiness = new Map<string, string[]>()
  if (campaign.programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId: campaign.programId },
      select: { businessId: true, matchReason: true }
    })
    matchReasonByBusiness = new Map(matches.map(m => [m.businessId, m.matchReason]))
    businesses = businesses.filter(b => matchReasonByBusiness.has(b.id))
  }

  // Run the send in the background — emails/Viber messages can take a long
  // time per recipient, and awaiting the whole batch here causes the HTTP
  // request to hang (and the UI to spin) past the platform's timeout.
  processCampaignSend(campaign, businesses, matchReasonByBusiness, session.user.id)
    .catch(err => console.error(`[Campaign ${campaign.id}] Background send failed:`, err?.message || err))

  return NextResponse.json({ started: true, total: businesses.length })
}
