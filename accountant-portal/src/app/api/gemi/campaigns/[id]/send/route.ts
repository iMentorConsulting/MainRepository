import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER } from '@/lib/moosend'
import { sendViberMessage } from '@/lib/chatwoot'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'

export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? '')
}

export async function buildRecipientVariables(gemiId: string, programId: string): Promise<Record<string, string>> {
  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: gemiId },
      select: {
        onomasia: true, afm: true, activities: true, unsubscribeToken: true,
        claimedAccountantId: true, postalAreaDescription: true, regdate: true,
        postalAddress: true, postalAddressNo: true, postalZipCode: true,
      },
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
    region: gemi.postalAreaDescription ?? '',
    address: [gemi.postalAddress, gemi.postalAddressNo, gemi.postalZipCode, gemi.postalAreaDescription].filter(Boolean).join(' '),
    founding_date: gemi.regdate
      ? new Date(gemi.regdate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '',
    kad_code: primaryKad?.firmActCode ?? '',
    kad_description: primaryKad?.firmActDescr ?? '',
    extra_criteria: extraCriteriaText,
    match_reason: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join(' | '),
    ermis_link: ermisLink,
    unsubscribe_link: unsubscribeLink,
    exodikastikos_link: exodikastikosLink,
  }
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
