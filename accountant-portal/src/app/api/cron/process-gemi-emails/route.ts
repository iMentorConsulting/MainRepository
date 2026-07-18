import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER, sendMoosendEmail } from '@/lib/moosend'
import { buildRecipientVariables, substituteVars } from '@/app/api/gemi/campaigns/[id]/send/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 55 // seconds — just under Railway's 60s cron timeout

const BATCH_PER_RUN = 300 // emails per cron invocation

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const disclaimer = `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`

  // Find all campaigns currently in SENDING state
  const sendingCampaigns = await prisma.gemiCampaign.findMany({
    where: { status: 'SENDING', channel: { in: ['EMAIL', 'EMAIL_AND_VIBER'] } },
    select: { id: true, htmlContent: true, subject: true, title: true, programId: true },
  })

  if (sendingCampaigns.length === 0) {
    return NextResponse.json({ ok: true, message: 'No campaigns in SENDING state' })
  }

  const results: Record<string, { sent: number; errors: number; remaining: number; completed: boolean }> = {}

  for (const campaign of sendingCampaigns) {
    const htmlBase = campaign.htmlContent ?? ''
    const subjectBase = campaign.subject ?? campaign.title

    // Take the next batch of pending recipients
    const batch = await prisma.gemiCampaignRecipient.findMany({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'pending' },
      select: { id: true, gemiId: true, recipient: true },
      take: BATCH_PER_RUN,
      orderBy: { createdAt: 'asc' },
    })

    let sent = 0
    let errors = 0
    const now = new Date()

    // Process 10 concurrently within the batch
    const CONCURRENT = 10
    for (let i = 0; i < batch.length; i += CONCURRENT) {
      const chunk = batch.slice(i, i + CONCURRENT)
      await Promise.all(chunk.map(async (r) => {
        try {
          const vars = await buildRecipientVariables(r.gemiId, campaign.programId ?? '')
          const subject = substituteVars(subjectBase, vars)
          const html = substituteVars(htmlBase, vars) + disclaimer
          await sendMoosendEmail({ to: r.recipient, subject, html })
          await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'sent', sentAt: now } })
          sent++
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'error', errorMessage } })
          errors++
        }
      }))
    }

    // Check if any pending remain
    const remaining = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'pending' },
    })

    const totalSentSoFar = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: campaign.id, channel: 'EMAIL', status: 'sent' },
    })

    const completed = remaining === 0

    await prisma.gemiCampaign.update({
      where: { id: campaign.id },
      data: {
        totalSent: totalSentSoFar,
        ...(completed ? { status: 'SENT' } : {}),
      },
    })

    results[campaign.id] = { sent, errors, remaining, completed }
  }

  return NextResponse.json({ ok: true, results })
}
