import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  GEMI_DISCLAIMER,
  createMoosendList,
  addSubscribersToList,
  createAndSendCampaign,
} from '@/lib/moosend'
import { sendViberMessage } from '@/lib/chatwoot'

const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'noreply@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'noreply@i-mentor.gr'

async function sendEmail(campaignId: string) {
  const campaign = await prisma.gemiCampaign.findUniqueOrThrow({
    where: { id: campaignId },
  })

  const htmlWithDisclaimer =
    (campaign.htmlContent ?? '') +
    `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`

  const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId, channel: 'email', status: 'pending' },
  })

  const listId = await createMoosendList(campaign.title)

  await addSubscribersToList(
    listId,
    emailRecipients.map((r) => ({ Email: r.recipient })),
  )

  const moosendCampaignId = await createAndSendCampaign({
    name: campaign.title,
    subject: campaign.subject ?? campaign.title,
    senderEmail: SENDER_EMAIL,
    replyToEmail: REPLY_TO_EMAIL,
    htmlContent: htmlWithDisclaimer,
    listId,
  })

  const now = new Date()

  await prisma.gemiCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENT',
      sentAt: now,
      moosendCampaignId,
      moosendListId: listId,
      totalSent: emailRecipients.length,
    },
  })

  await prisma.gemiCampaignRecipient.updateMany({
    where: { id: { in: emailRecipients.map((r) => r.id) } },
    data: { status: 'sent', sentAt: now },
  })

  return { sent: emailRecipients.length, errors: 0 }
}

async function sendViber(campaignId: string) {
  const campaign = await prisma.gemiCampaign.findUniqueOrThrow({
    where: { id: campaignId },
  })

  const message = (campaign.messageTemplate ?? '') + '\n\n' + GEMI_DISCLAIMER

  const phoneRecipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId, channel: 'phone', status: 'pending' },
  })

  let sent = 0
  let errors = 0
  const now = new Date()

  await Promise.all(
    phoneRecipients.map(async (r) => {
      try {
        const { conversationId } = await sendViberMessage(r.recipient, message)
        await prisma.gemiCampaignRecipient.update({
          where: { id: r.id },
          data: { status: 'sent', sentAt: now, chatwootConversationId: conversationId },
        })
        sent++
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        await prisma.gemiCampaignRecipient.update({
          where: { id: r.id },
          data: { status: 'error', errorMessage },
        })
        errors++
      }
    }),
  )

  await prisma.gemiCampaign.update({
    where: { id: campaignId },
    data: { status: 'SENT', sentAt: now, totalSent: sent },
  })

  return { sent, errors }
}

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
  if (campaign.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Campaign is not in DRAFT status' }, { status: 400 })
  }

  try {
    if (campaign.channel === 'EMAIL') {
      const result = await sendEmail(id)
      return NextResponse.json(result)
    }

    if (campaign.channel === 'VIBER') {
      const result = await sendViber(id)
      return NextResponse.json(result)
    }

    if (campaign.channel === 'EMAIL_AND_VIBER') {
      const [emailResult, viberResult] = await Promise.all([sendEmail(id), sendViber(id)])

      // Merge campaign-level update (both set status=SENT; combine totals)
      await prisma.gemiCampaign.update({
        where: { id },
        data: { totalSent: emailResult.sent + viberResult.sent },
      })

      return NextResponse.json({
        sent: emailResult.sent + viberResult.sent,
        errors: emailResult.errors + viberResult.errors,
      })
    }

    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
