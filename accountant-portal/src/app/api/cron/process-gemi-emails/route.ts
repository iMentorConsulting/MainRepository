import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER, sendMoosendBulkPersonalized } from '@/lib/moosend'
import { buildRecipientVariables } from '@/app/api/gemi/campaigns/[id]/send/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 270 // seconds — Railway allows up to 5min for cron services

const BATCH_PER_RUN = 2000 // recipients per cron invocation

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const disclaimer = `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`

  const sendingCampaigns = await prisma.gemiCampaign.findMany({
    where: { status: 'SENDING', channel: { in: ['EMAIL', 'EMAIL_AND_VIBER'] } },
    select: { id: true, title: true, subject: true, previewText: true, htmlContent: true, programId: true },
  })

  if (sendingCampaigns.length === 0) {
    return NextResponse.json({ ok: true, message: 'No campaigns in SENDING state' })
  }

  const results: Record<string, { sent: number; errors: number; remaining: number; completed: boolean }> = {}

  for (const campaign of sendingCampaigns) {
    const htmlBase = campaign.htmlContent ?? ''
    const previewBase = campaign.previewText ?? ''
    const subjectBase = campaign.subject ?? campaign.title
    const now = new Date()

    const batch = await prisma.gemiCampaignRecipient.findMany({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'pending' },
      select: { id: true, gemiId: true, recipient: true },
      take: BATCH_PER_RUN,
      orderBy: { createdAt: 'asc' },
    })

    if (batch.length === 0) {
      await prisma.gemiCampaign.update({ where: { id: campaign.id }, data: { status: 'SENT' } })
      results[campaign.id] = { sent: 0, errors: 0, remaining: 0, completed: true }
      continue
    }

    // Build variables for all recipients concurrently (10 at a time)
    const CONCURRENT = 10
    const recipientData: Array<{ id: string; email: string; variables: Record<string, string> } | { id: string; error: string }> = []
    for (let i = 0; i < batch.length; i += CONCURRENT) {
      const chunk = batch.slice(i, i + CONCURRENT)
      const results2 = await Promise.all(chunk.map(async r => {
        try {
          const variables = await buildRecipientVariables(r.gemiId, campaign.programId ?? '')
          return { id: r.id, email: r.recipient, variables }
        } catch (err) {
          return { id: r.id, error: err instanceof Error ? err.message : String(err) }
        }
      }))
      recipientData.push(...results2)
    }

    // Separate failures
    const failed = recipientData.filter((r): r is { id: string; error: string } => 'error' in r)
    const valid = recipientData.filter((r): r is { id: string; email: string; variables: Record<string, string> } => 'email' in r)

    let errors = failed.length
    let sent = 0

    if (failed.length > 0) {
      await Promise.all(failed.map(r =>
        prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'error', errorMessage: r.error } })
      ))
    }

    if (valid.length > 0) {
      // Build the full HTML once (preview injected, disclaimer appended) — still using {{var}} placeholders;
      // sendMoosendBulkPersonalized will convert them to [subscription.var] merge tags.
      // Preview text is passed natively to Moosend (PreviewText field) — no HTML injection needed.
      const htmlFull = htmlBase + disclaimer

      try {
        const sendResult = await sendMoosendBulkPersonalized({
          recipients: valid.map(r => ({ email: r.email, variables: r.variables })),
          subject: subjectBase,
          previewText: previewBase || undefined,
          html: htmlFull,
          campaignName: campaign.title,
        })
        if (sendResult) {
          await prisma.gemiCampaign.update({
            where: { id: campaign.id },
            data: { moosendCampaignId: sendResult.moosendCampaignId, moosendListId: sendResult.moosendListId },
          })
        }
        await prisma.gemiCampaignRecipient.updateMany({
          where: { id: { in: valid.map(r => r.id) } },
          data: { status: 'sent', sentAt: now },
        })
        sent = valid.length
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`[GemiEmail] bulk send failed for campaign ${campaign.id}:`, errorMessage)
        await prisma.gemiCampaignRecipient.updateMany({
          where: { id: { in: valid.map(r => r.id) } },
          data: { status: 'error', errorMessage },
        })
        errors += valid.length
      }
    }

    const remaining = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'pending' },
    })
    const totalSentSoFar = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'sent' },
    })
    const completed = remaining === 0

    await prisma.gemiCampaign.update({
      where: { id: campaign.id },
      data: { totalSent: totalSentSoFar, ...(completed ? { status: 'SENT' } : {}) },
    })

    results[campaign.id] = { sent, errors, remaining, completed }
  }

  return NextResponse.json({ ok: true, results })
}
