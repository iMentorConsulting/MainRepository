import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER } from '@/lib/moosend'
import { sendViberMessage } from '@/lib/chatwoot'
import { buildRecipientVariables } from '@/lib/gemi-campaign-vars'

async function sendViberCampaign(campaignId: string) {
  const campaign = await prisma.gemiCampaign.findUniqueOrThrow({ where: { id: campaignId } })
  const messageTemplate = (campaign.messageTemplate ?? '') + '\n\n' + GEMI_DISCLAIMER

  const phoneRecipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId, channel: 'VIBER', status: 'pending' },
  })

  let sent = 0
  let errors = 0
  const now = new Date()

  await Promise.all(
    phoneRecipients.map(async (r) => {
      try {
        const vars = await buildRecipientVariables(r.gemiId, campaign.programId ?? '', campaign.programId2 ?? '', (campaign as any).programId3 ?? '')
        const message = messageTemplate.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? '')
        const { conversationId } = await sendViberMessage(r.recipient, message)
        await prisma.gemiCampaignRecipient.update({
          where: { id: r.id },
          data: { status: 'sent', sentAt: now, chatwootConversationId: conversationId },
        })
        sent++
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'error', errorMessage } })
        errors++
      }
    }),
  )

  await prisma.gemiCampaign.update({ where: { id: campaignId }, data: { status: 'SENT', sentAt: now, totalSent: sent } })
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
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'DRAFT') return NextResponse.json({ error: 'Campaign is not in DRAFT status' }, { status: 400 })

  try {
    // EMAIL: enqueue for background processing via cron — returns immediately
    if (campaign.channel === 'EMAIL' || campaign.channel === 'EMAIL_AND_VIBER') {
      await prisma.gemiCampaign.update({
        where: { id },
        data: { status: 'SENDING', sentAt: new Date() },
      })

      // Viber part sends inline (fast, per-message API)
      if (campaign.channel === 'EMAIL_AND_VIBER') {
        const viberResult = await sendViberCampaign(id)
        return NextResponse.json({
          queued: true,
          viber: viberResult,
          message: `Το email τέθηκε σε ουρά αποστολής. Τα ${viberResult.sent} Viber μηνύματα εστάλησαν.`,
        })
      }

      const pending = await prisma.gemiCampaignRecipient.count({ where: { campaignId: id, channel: 'EMAIL', status: 'pending' } })
      return NextResponse.json({
        queued: true,
        pending,
        message: `${pending} email τέθηκαν σε ουρά. Η αποστολή θα ολοκληρωθεί αυτόματα σε λίγα λεπτά.`,
      })
    }

    if (campaign.channel === 'VIBER') {
      const result = await sendViberCampaign(id)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
