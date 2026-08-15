import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER, sendMoosendBulkPersonalized } from '@/lib/moosend'
import { buildRecipientVariables } from '@/lib/gemi-campaign-vars'
import { sendEmail } from '@/lib/email'

// Admin-only endpoint to manually process a single SENDING email campaign,
// bypassing the Railway cron schedule. Useful when cron is not firing.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const campaign = await (prisma.gemiCampaign as any).findUnique({
    where: { id },
    select: { id: true, title: true, subject: true, previewText: true, htmlContent: true, programId: true, programId2: true, programId3: true, moosendCampaignId: true, status: true, channel: true },
  })

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'SENDING') {
    return NextResponse.json({ error: `Campaign is in ${campaign.status} status, not SENDING` }, { status: 400 })
  }
  if (campaign.channel !== 'EMAIL' && campaign.channel !== 'EMAIL_AND_VIBER') {
    return NextResponse.json({ error: 'Only EMAIL campaigns are processed here' }, { status: 400 })
  }

  const BATCH_SIZE = 500
  const disclaimer = `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`
  const htmlBase = campaign.htmlContent ?? ''
  const previewBase = campaign.previewText ?? ''
  const subjectBase = campaign.subject ?? campaign.title
  const now = new Date()

  const alreadyProcessed = await prisma.gemiCampaignRecipient.count({
    where: { campaignId: id, channel: 'EMAIL', status: { in: ['sent', 'error'] } },
  })
  const partNumber = Math.floor(alreadyProcessed / BATCH_SIZE) + 1
  const moosendName = partNumber > 1 ? `${campaign.title} — μέρος ${partNumber}` : campaign.title

  const batch = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId: id, channel: 'EMAIL', status: 'pending' },
    select: { id: true, gemiId: true, recipient: true },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  })

  if (batch.length === 0) {
    const totalSentSoFar = await prisma.gemiCampaignRecipient.count({
      where: { campaignId: id, channel: 'EMAIL', status: 'sent' },
    })
    await prisma.gemiCampaign.update({
      where: { id },
      data: { status: 'SENT', totalSent: totalSentSoFar },
    })
    return NextResponse.json({ sent: 0, errors: 0, remaining: 0, completed: true, message: 'No pending recipients — campaign marked SENT' })
  }

  // Build variables for all recipients concurrently (5 at a time)
  const CONCURRENT = 5
  const recipientData: Array<{ id: string; email: string; variables: Record<string, string> } | { id: string; error: string }> = []
  for (let i = 0; i < batch.length; i += CONCURRENT) {
    const chunk = batch.slice(i, i + CONCURRENT)
    const results = await Promise.all(chunk.map(async r => {
      try {
        const variables = await buildRecipientVariables(r.gemiId, campaign.programId ?? '', campaign.programId2 ?? '', (campaign as any).programId3 ?? '')
        return { id: r.id, email: r.recipient, variables }
      } catch (err) {
        return { id: r.id, error: err instanceof Error ? err.message : String(err) }
      }
    }))
    recipientData.push(...results)
  }

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
    const htmlFull = htmlBase + disclaimer
    try {
      const sendResult = await sendMoosendBulkPersonalized({
        recipients: valid.map(r => ({ email: r.email, variables: r.variables })),
        subject: subjectBase,
        previewText: previewBase || undefined,
        html: htmlFull,
        campaignName: moosendName,
      })
      if (sendResult) {
        const existingIds = new Set((campaign.moosendCampaignId || '').split(',').filter(Boolean))
        existingIds.add(sendResult.moosendCampaignId)
        await prisma.gemiCampaign.update({
          where: { id },
          data: { moosendCampaignId: Array.from(existingIds).join(','), moosendListId: sendResult.moosendListId },
        })
      }
      await prisma.gemiCampaignRecipient.updateMany({
        where: { id: { in: valid.map(r => r.id) } },
        data: { status: 'sent', sentAt: now },
      })
      sent = valid.length

      ;(async () => {
        const sampleVars = { ...valid[0].variables }
        const placeholders: Record<string, string> = {
          business_name: '[ΕΠΩΝΥΜΙΑ]', afm: '[ΑΦΜ]', address: '[ΔΙΕΥΘΥΝΣΗ]',
          region: '[ΠΕΡΙΟΧΗ]', founding_date: '[ΗΜ. ΙΔΡΥΣΗΣ]', kad_code: '[ΚΑΔ]',
          kad_description: '[ΠΕΡΙΓΡΑΦΗ ΚΑΔ]', match_reason: '[ΛΟΓΟΙ]',
          program_match_reason: '[ΛΟΓΟΙ Α]', program2_match_reason: '[ΛΟΓΟΙ Β]',
          other_programs: '[ΑΛΛΑ]', other_programs_count: '#', matched_programs_count: '#',
          accountant_name: '[ΛΟΓΙΣΤΗΣ]', accountant_office: '[ΓΡΑΦΕΙΟ]',
          ermis_link: '#', ermis_link_2: '#', exodikastikos_link: '#', unsubscribe_link: '#',
        }
        for (const [k, v] of Object.entries(placeholders)) { if (k in sampleVars) sampleVars[k] = v }
        const { substituteVars } = await import('@/lib/gemi-campaign-vars')
        const archiveSubject = `[ΑΡΧΕΙΟ] ${substituteVars(subjectBase, sampleVars)} — ${valid.length} παραλήπτες`
        const archiveHtml = substituteVars(htmlFull, sampleVars) +
          `<div style="margin-top:28px;border-top:1px solid #ddd;padding-top:8px;font-size:8px;color:#aaa;word-break:break-all;">` +
          `Καμπάνια: ${moosendName} · ${valid.length} παραλήπτες: ${valid.map(r => r.email).join(',')}</div>`
        await sendEmail({ to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr', subject: archiveSubject, html: archiveHtml })
      })().catch(err => console.error('[ForceProcess] archive copy failed:', err instanceof Error ? err.message : err))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[ForceProcess] bulk send failed for campaign ${id}:`, errorMessage)
      await prisma.gemiCampaignRecipient.updateMany({
        where: { id: { in: valid.map(r => r.id) } },
        data: { status: 'error', errorMessage },
      })
      errors += valid.length
    }
  }

  const remaining = await prisma.gemiCampaignRecipient.count({
    where: { campaignId: id, channel: 'EMAIL', status: 'pending' },
  })
  const totalSentSoFar = await prisma.gemiCampaignRecipient.count({
    where: { campaignId: id, channel: 'EMAIL', status: 'sent' },
  })
  const completed = remaining === 0

  await prisma.gemiCampaign.update({
    where: { id },
    data: { totalSent: totalSentSoFar, ...(completed ? { status: 'SENT' } : {}) },
  })

  console.log(`[ForceProcess] campaign ${id}: sent=${sent}, errors=${errors}, remaining=${remaining}, completed=${completed}`)

  return NextResponse.json({ sent, errors, remaining, completed })
}
