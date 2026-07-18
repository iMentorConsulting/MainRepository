import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER } from '@/lib/moosend'
import { sendViberMessage } from '@/lib/chatwoot'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'
import { sendEmail } from '@/lib/email'

const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? '')
}

async function buildRecipientVariables(gemiId: string, programId: string): Promise<Record<string, string>> {
  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: gemiId },
      select: { onomasia: true, afm: true, activities: true, unsubscribeToken: true, claimedAccountantId: true },
    }),
    programId ? prisma.program.findUnique({
      where: { id: programId },
      select: { title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true, minInvestment: true, maxInvestment: true },
    }) : null,
    programId ? prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId, programId } },
      select: { matchReason: true },
    }) : null,
  ])
  if (!gemi) return {}

  const accountant = gemi.claimedAccountantId
    ? await prisma.accountant.findUnique({ where: { id: gemi.claimedAccountantId }, select: { contactPerson: true, officeName: true } })
    : null

  const activities = (Array.isArray(gemi.activities) ? gemi.activities : []) as any[]
  const primaryKad = activities.find((a: any) => a.firmActKind === 1) ?? activities[0]

  const extraCriteriaText = program?.extraCriteriaIds?.length
    ? (await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { label: true } }))
        .map(c => `• ${c.label}`).join(' | ')
    : ''

  const programDeadline = program?.endDate
    ? new Date(program.endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const ermisLink = programId
    ? await getOrCreateGemiErmisLink(gemiId, programId).catch(() => '')
    : ''

  const afm = gemi.afm ?? ''
  const onomasia = gemi.onomasia ?? afm
  const unsubscribeLink = gemi.unsubscribeToken ? `${APP_URL}/api/gemi/unsubscribe/${gemi.unsubscribeToken}` : ''
  const exodikastikosLink = ermisLink ? `${ermisLink}?type=themis` : '#'

  const formatAmount = (val: number | null | undefined) =>
    val != null ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val) : ''
  const min = program?.minInvestment ?? null
  const max = program?.maxInvestment ?? null
  const programAmount = min && max && min !== max
    ? `${formatAmount(min)} – ${formatAmount(max)}`
    : formatAmount(max ?? min)

  return {
    business_name: onomasia,
    afm,
    accountant_name: accountant?.contactPerson ?? 'i-MENTOR',
    accountant_office: accountant?.officeName ?? 'i-MENTOR',
    program_title: program?.title ?? '',
    program_description: program?.description ?? '',
    program_url: program?.websiteUrl ?? '',
    program_deadline: programDeadline,
    program_amount: programAmount,
    extra_criteria: extraCriteriaText,
    kad_description: primaryKad?.firmActDescr ?? '',
    match_reason: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join(' | '),
    ermis_link: ermisLink,
    unsubscribe_link: unsubscribeLink,
    exodikastikos_link: exodikastikosLink,
  }
}

async function sendEmailCampaign(campaignId: string) {
  const campaign = await prisma.gemiCampaign.findUniqueOrThrow({ where: { id: campaignId } })

  const emailRecipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId, channel: 'EMAIL', status: 'pending' },
    select: { id: true, gemiId: true, recipient: true },
  })
  if (emailRecipients.length === 0) return { sent: 0, errors: 0 }

  const htmlBase = campaign.htmlContent ?? ''
  const subjectBase = campaign.subject ?? campaign.title
  const disclaimer = `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`

  let sent = 0
  let errors = 0
  const now = new Date()

  // Send in batches of 10 concurrent to avoid overwhelming SMTP
  const BATCH = 10
  for (let i = 0; i < emailRecipients.length; i += BATCH) {
    const batch = emailRecipients.slice(i, i + BATCH)
    await Promise.all(batch.map(async (r) => {
      try {
        const vars = await buildRecipientVariables(r.gemiId, campaign.programId ?? '')
        const subject = substituteVars(subjectBase, vars)
        const html = substituteVars(htmlBase, vars) + disclaimer

        const ok = await sendEmail({ to: r.recipient, subject, html })
        if (ok) {
          await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'sent', sentAt: now } })
          sent++
        } else {
          await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'error', errorMessage: 'Email send failed' } })
          errors++
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        await prisma.gemiCampaignRecipient.update({ where: { id: r.id }, data: { status: 'error', errorMessage } })
        errors++
      }
    }))
  }

  await prisma.gemiCampaign.update({
    where: { id: campaignId },
    data: { status: 'SENT', sentAt: now, totalSent: sent },
  })
  return { sent, errors }
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
        const vars = await buildRecipientVariables(r.gemiId, campaign.programId ?? '')
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
