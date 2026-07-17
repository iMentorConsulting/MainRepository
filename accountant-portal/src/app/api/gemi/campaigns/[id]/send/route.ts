import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GEMI_DISCLAIMER } from '@/lib/moosend'
import { sendViberMessage } from '@/lib/chatwoot'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const MOOSEND_API_KEY = process.env.MOOSEND_API_KEY ?? ''
const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'info@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'info@i-mentor.gr'
const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'
const EXODIKASTIKOS_URL = process.env.EXODIKASTIKOS_URL ?? ''
const BASE_URL = 'https://api.moosend.com/v3'

// Variable names used in templates — {{variable}} in HTML gets converted to [variable] for Moosend merge tags
const MERGE_FIELDS = [
  'business_name', 'afm', 'accountant_name', 'accountant_office',
  'program_title', 'program_description', 'program_url', 'program_deadline',
  'extra_criteria', 'kad_description', 'match_reason',
  'ermis_link', 'unsubscribe_link', 'exodikastikos_link',
]

// Convert {{variable}} placeholders to Moosend [variable] merge tags
function toMoosendTemplate(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => `[${key}]`)
}

async function moosendPost(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}?apikey=${MOOSEND_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || (data.Code !== undefined && data.Code !== 0)) {
    throw new Error(`Moosend error at ${path}: ${data.Error ?? data.Message ?? JSON.stringify(data)}`)
  }
  return data
}

async function createListWithCustomFields(name: string): Promise<string> {
  const data = await moosendPost('/lists/create.json', { Name: name })
  const listId = typeof data.Context === 'string' ? data.Context : data.Context?.ID
  if (!listId) throw new Error('No list ID from Moosend')

  // Define all merge fields as custom fields on this list
  for (const field of MERGE_FIELDS) {
    await moosendPost(`/lists/${listId}/customfields/create.json`, {
      Name: field,
      CustomFieldType: 'Text',
      IsRequired: false,
    }).catch(() => {}) // ignore if field already exists
  }

  return listId
}

async function buildRecipientVariables(gemiId: string, programId: string): Promise<Record<string, string>> {
  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: gemiId },
      select: { onomasia: true, afm: true, activities: true, unsubscribeToken: true, claimedAccountantId: true },
    }),
    programId ? prisma.program.findUnique({
      where: { id: programId },
      select: { title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true },
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

  return {
    business_name: onomasia,
    afm,
    accountant_name: accountant?.contactPerson ?? 'i-MENTOR',
    accountant_office: accountant?.officeName ?? 'i-MENTOR',
    program_title: program?.title ?? '',
    program_description: program?.description ?? '',
    program_url: program?.websiteUrl ?? '',
    program_deadline: programDeadline,
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

  // Create Moosend list with custom fields for merge tags
  const listId = await createListWithCustomFields(`GEMI-${campaignId}-${Date.now()}`)

  // Add subscribers in batches of 500 with their personalized custom field values
  const BATCH = 500
  for (let i = 0; i < emailRecipients.length; i += BATCH) {
    const batch = emailRecipients.slice(i, i + BATCH)
    const subscribers = await Promise.all(
      batch.map(async (r) => {
        const vars = await buildRecipientVariables(r.gemiId, campaign.programId ?? '')
        const customFields = MERGE_FIELDS.map(f => `${f}=${vars[f] ?? ''}`)
        return { Email: r.recipient, CustomFields: customFields }
      })
    )
    await moosendPost(`/subscribers/${listId}/subscribe_many.json`, { Subscribers: subscribers })
  }

  // Build HTML with Moosend merge tags and disclaimer
  const htmlTemplate = toMoosendTemplate(campaign.htmlContent ?? '')
  const htmlWithDisclaimer = htmlTemplate +
    `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>`

  // Create and send campaign
  const campaignData = await moosendPost('/campaigns/create.json', {
    Name: campaign.title,
    Subject: toMoosendTemplate(campaign.subject ?? campaign.title),
    SenderEmail: SENDER_EMAIL,
    ReplyToEmail: REPLY_TO_EMAIL,
    MailingLists: [{ MailingListID: listId, SegmentID: null }],
    HTMLContent: htmlWithDisclaimer,
    Type: 'Regular',
  })
  const moosendCampaignId = typeof campaignData.Context === 'string' ? campaignData.Context : campaignData.Context?.ID
  if (!moosendCampaignId) throw new Error('No campaign ID from Moosend')

  await moosendPost(`/campaigns/${moosendCampaignId}/send.json`, {
    ScheduledDateTime: new Date().toISOString(),
    TimezoneID: 53,
  })

  const now = new Date()
  await prisma.gemiCampaign.update({
    where: { id: campaignId },
    data: { status: 'SENT', sentAt: now, moosendCampaignId, moosendListId: listId, totalSent: emailRecipients.length },
  })
  await prisma.gemiCampaignRecipient.updateMany({
    where: { id: { in: emailRecipients.map(r => r.id) } },
    data: { status: 'sent', sentAt: now },
  })

  return { sent: emailRecipients.length, errors: 0 }
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
