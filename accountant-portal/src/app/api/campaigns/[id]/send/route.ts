import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate } from '@/lib/email'
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
      match_reason: (matchReasonByBusiness.get(business.id) || []).map(r => `• ${r}`).join('\n'),
      unsubscribe_link: `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/api/unsubscribe/${business.unsubscribeToken}`,
    }

    const message = renderTemplate(campaign.messageTemplate, variables)
    let success = false

    try {
      if (campaign.channel === 'EMAIL') {
        const imentorLogo = process.env.IMENTOR_LOGO_URL || ''
        const accountantLogo = business.accountant?.logoUrl || ''
        const logoRow = (imentorLogo || accountantLogo)
          ? `<tr><td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
               <table width="100%"><tr>
                 <td>${imentorLogo ? `<img src="${imentorLogo}" alt="I-MENTOR" height="36" style="display:block;" />` : '<span style="font-weight:700;color:#4f46e5;font-size:16px;">I-MENTOR</span>'}</td>
                 <td align="right">${accountantLogo ? `<img src="${accountantLogo}" alt="${business.accountant?.officeName || ''}" height="36" style="display:block;margin-left:auto;" />` : (business.accountant?.officeName ? `<span style="font-weight:600;color:#475569;font-size:14px;">${business.accountant.officeName}</span>` : '')}</td>
               </tr></table>
             </td></tr>`
          : ''
        success = await sendEmail({
          to: recipient,
          subject: campaign.title,
          html: `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            ${logoRow}
            <tr><td style="padding:24px;color:#1e293b;font-size:14px;line-height:1.6;">${message.replace(/\n/g, '<br>')}</td></tr>
          </table>`,
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

  // Find eligible businesses
  let businesses = await prisma.business.findMany({
    include: {
      accountant: true,
      activities: { where: { firmActKind: 1 }, take: 1 },
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

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
