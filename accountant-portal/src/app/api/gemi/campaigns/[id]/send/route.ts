import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER } from '@/lib/moosend'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/chatwoot'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'noreply@i-mentor.gr'
const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'
const EXODIKASTIKOS_URL = process.env.EXODIKASTIKOS_URL ?? ''

function substituteVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

async function buildVariables(opts: {
  gemiId: string
  programId: string
  campaign: { programId: string | null }
}): Promise<Record<string, string>> {
  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: opts.gemiId },
      select: {
        onomasia: true, afm: true, activities: true,
        postalAreaDescription: true, unsubscribeToken: true,
        claimedAccountantId: true,
      },
    }),
    opts.programId ? prisma.program.findUnique({
      where: { id: opts.programId },
      select: { title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true },
    }) : null,
    opts.programId ? prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId: opts.gemiId, programId: opts.programId } },
      select: { matchReason: true },
    }) : null,
  ])

  if (!gemi) return {}

  const accountant = gemi.claimedAccountantId
    ? await prisma.accountant.findUnique({
        where: { id: gemi.claimedAccountantId },
        select: { contactPerson: true, officeName: true },
      })
    : null

  const activities = (Array.isArray(gemi.activities) ? gemi.activities : []) as any[]
  const primaryKad = activities.find((a: any) => a.firmActKind === 1) ?? activities[0]
  const kadDescription = primaryKad?.firmActDescr ?? ''

  const extraCriteriaText = program?.extraCriteriaIds?.length
    ? (await prisma.eligibilityCriterion.findMany({
        where: { id: { in: program.extraCriteriaIds } },
        select: { label: true },
      })).map(c => `• ${c.label}`).join('\n')
    : ''

  const programDeadline = program?.endDate
    ? new Date(program.endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const ermisLink = program && opts.programId
    ? await getOrCreateGemiErmisLink(opts.gemiId, opts.programId).catch(() => '')
    : ''

  const unsubscribeLink = gemi.unsubscribeToken
    ? `${APP_URL}/api/gemi/unsubscribe/${gemi.unsubscribeToken}`
    : ''

  const afm = gemi.afm ?? ''
  const onomasia = gemi.onomasia ?? afm
  const exodikastikosLink = EXODIKASTIKOS_URL
    ? `${EXODIKASTIKOS_URL}?afm=${encodeURIComponent(afm)}&name=${encodeURIComponent(onomasia)}`
    : '#'

  return {
    business_name: onomasia,
    afm,
    accountant_name: accountant?.contactPerson ?? '',
    accountant_office: accountant?.officeName ?? '',
    program_title: program?.title ?? '',
    program_description: program?.description ?? '',
    program_url: program?.websiteUrl ?? '',
    program_deadline: programDeadline,
    extra_criteria: extraCriteriaText,
    kad_description: kadDescription,
    match_reason: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join('\n'),
    ermis_link: ermisLink,
    unsubscribe_link: unsubscribeLink,
    exodikastikos_link: exodikastikosLink,
  }
}

async function sendEmailCampaign(campaignId: string) {
  const campaign = await prisma.gemiCampaign.findUniqueOrThrow({ where: { id: campaignId } })

  const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId, channel: 'EMAIL', status: 'pending' },
  })

  const htmlTemplate = (campaign.htmlContent ?? '') +
    `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`
  const subjectTemplate = campaign.subject ?? campaign.title

  let sent = 0
  const now = new Date()

  for (const r of emailRecipients) {
    try {
      const vars = await buildVariables({
        gemiId: r.gemiId,
        programId: campaign.programId ?? '',
        campaign,
      })
      const html = substituteVariables(htmlTemplate, vars)
      const subject = substituteVariables(subjectTemplate, vars)

      const ok = await sendEmail({ to: r.recipient, subject, html })
      await prisma.gemiCampaignRecipient.update({
        where: { id: r.id },
        data: { status: ok ? 'sent' : 'error', sentAt: ok ? now : null, errorMessage: ok ? null : 'Email delivery failed' },
      })
      if (ok) sent++
    } catch (err: any) {
      await prisma.gemiCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'error', errorMessage: err?.message ?? 'Unknown error' },
      })
    }
  }

  await prisma.gemiCampaign.update({
    where: { id: campaignId },
    data: { status: 'SENT', sentAt: now, totalSent: sent },
  })

  return { sent, errors: emailRecipients.length - sent }
}

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
        const vars = await buildVariables({ gemiId: r.gemiId, programId: campaign.programId ?? '', campaign })
        const message = substituteVariables(messageTemplate, vars)
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
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'DRAFT') return NextResponse.json({ error: 'Campaign is not in DRAFT status' }, { status: 400 })

  try {
    if (campaign.channel === 'EMAIL') {
      const result = await sendEmailCampaign(id)
      return NextResponse.json(result)
    }
    if (campaign.channel === 'VIBER') {
      const result = await sendViberCampaign(id)
      return NextResponse.json(result)
    }
    if (campaign.channel === 'EMAIL_AND_VIBER') {
      const [emailResult, viberResult] = await Promise.all([sendEmailCampaign(id), sendViberCampaign(id)])
      await prisma.gemiCampaign.update({ where: { id }, data: { totalSent: emailResult.sent + viberResult.sent } })
      return NextResponse.json({ sent: emailResult.sent + viberResult.sent, errors: emailResult.errors + viberResult.errors })
    }
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
