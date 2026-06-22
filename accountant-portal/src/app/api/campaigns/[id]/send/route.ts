import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate, renderCampaignEmailHtml } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { createAuditLog } from '@/lib/audit'
import { getOrCreateErmisLink } from '@/lib/ermis'

async function processCampaignSend(
  campaign: any,
  businesses: any[],
  matchReasonByBusiness: Map<string, string[]>,
  userId: string
) {
  let sent = 0
  let failed = 0

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const imentorLogoUrl = appSetting?.imentorLogoUrl || ''

  const extraCriteriaIds: string[] = campaign.program?.extraCriteriaIds || []
  const extraCriteriaList = extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: extraCriteriaIds } }, select: { label: true } })
    : []
  const extraCriteriaText = extraCriteriaList.map(c => c.label).join('\n')
  const programDeadlineText = campaign.program?.endDate
    ? new Date(campaign.program.endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const useEmail = campaign.channel === 'EMAIL' || campaign.channel === 'EMAIL_AND_VIBER'
  const useViber = campaign.channel === 'VIBER' || campaign.channel === 'EMAIL_AND_VIBER'

  for (const business of businesses) {
    const emailRecipient = business.email
    const viberRecipient = business.viberPhone || business.phone

    if (useEmail && !emailRecipient && !useViber) {
      failed++
      await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, businessId: business.id, channel: campaign.channel, recipient: '', status: 'failed', errorMessage: 'Δεν υπάρχει email' } })
      continue
    }
    if (useViber && !viberRecipient && !useEmail) {
      failed++
      await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, businessId: business.id, channel: campaign.channel, recipient: '', status: 'failed', errorMessage: 'Δεν υπάρχει αριθμός τηλεφώνου' } })
      continue
    }
    if (!emailRecipient && !viberRecipient) {
      failed++
      await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, businessId: business.id, channel: campaign.channel, recipient: '', status: 'failed', errorMessage: 'Δεν υπάρχει email ούτε τηλέφωνο' } })
      continue
    }

    const matchReasons = matchReasonByBusiness.get(business.id) || []
    const bullet = '•'
    const ermisLink = campaign.programId ? await getOrCreateErmisLink(business.id, campaign.programId) : ''
    const variables: Record<string, string> = {
      business_name: business.onomasia || business.afm,
      afm: business.afm,
      accountant_name: business.accountant?.contactPerson || '',
      accountant_office: business.accountant?.officeName || '',
      program_title: campaign.program?.title || '',
      program_description: campaign.program?.description || '',
      program_url: campaign.program?.websiteUrl || '',
      program_deadline: programDeadlineText,
      extra_criteria: extraCriteriaText,
      kad_description: business.activities[0]?.firmActCode || '',
      match_reason: matchReasons.map(r => `${bullet} ${r}`).join('\n'),
      unsubscribe_link: `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/api/unsubscribe/${business.unsubscribeToken}`,
      ermis_link: ermisLink,
    }

    const rawMessage = renderTemplate(campaign.messageTemplate, variables)
    // Viber natively renders *text* as bold; collapse any **double** to single *
    const message = rawMessage
      .replace(/\*\*([^*]*)\*\*/g, (_, inner) => inner.trim() ? `*${inner.trim()}*` : '')
    let emailSubject = renderTemplate(campaign.subject || campaign.title, variables)
    if (!variables.accountant_office) emailSubject = emailSubject.replace(/^\s*&\s*/, '')
    let success = false
    const errors: string[] = []

    try {
      if (useEmail && emailRecipient) {
        const emailVariables: Record<string, string> = {
          ...variables,
          match_reason: matchReasons.map(r => `${bullet} <strong>${r}</strong>`).join('\n'),
        }
        const boldedMessage = renderTemplate(campaign.messageTemplate, emailVariables, {
          boldKeys: ['business_name', 'afm', 'accountant_name', 'accountant_office', 'program_title', 'kad_description'],
        })
        const bodyWithoutUnsubscribe = boldedMessage
          .split('\n')
          .filter(line => !line.includes(variables.unsubscribe_link))
          .join('\n')
          .trim()

        const emailOk = await sendEmail({
          to: emailRecipient,
          subject: emailSubject,
          html: renderCampaignEmailHtml({
            title: emailSubject,
            bodyText: bodyWithoutUnsubscribe,
            recipientName: business.onomasia || business.afm,
            imentorLogoUrl,
            accountantOfficeName: business.accountant?.officeName || '',
            accountantLogoUrl: business.accountant?.logoUrl || '',
            unsubscribeUrl: variables.unsubscribe_link,
          }),
        })
        if (emailOk) success = true
        else errors.push('Email: αποτυχία αποστολής')
      }

      if (useViber && viberRecipient) {
        const viberResult = await sendViberMessage({ to: viberRecipient, text: message, senderName: business.onomasia || business.afm })
        if (viberResult.ok) success = true
        else errors.push(`Viber: ${viberResult.reason}`)
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      errors.push(`exception: ${msg}`)
      console.error(`[Campaign ${campaign.id}] Send error for ${business.afm}:`, msg)
    }

    const primaryRecipient = emailRecipient || viberRecipient || ''
    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        businessId: business.id,
        channel: campaign.channel,
        recipient: primaryRecipient,
        status: success ? 'sent' : 'failed',
        sentAt: success ? new Date() : null,
        errorMessage: errors.length > 0 ? errors.join(' | ') : null,
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
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      program: true,
      accountant: true,
    }
  })

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ACCOUNTANT can only send their own campaigns
  if (session.user.role === 'ACCOUNTANT' && campaign.accountantId !== (session.user as any).accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let selectedBusinessIds: string[] | null = null
  try {
    const body = await request.json()
    if (Array.isArray(body?.businessIds)) selectedBusinessIds = body.businessIds
  } catch {
    // no body provided — send to all eligible recipients
  }

  let businesses = await prisma.business.findMany({
    include: {
      accountant: true,
      activities: { where: { firmActKind: 1 }, take: 1 },
    },
    ...(campaign.accountantId ? { where: { accountantId: campaign.accountantId } } : {}),
  })

  businesses = businesses.filter(b => !b.excludedFromCampaigns)

  if (selectedBusinessIds) {
    const selectedSet = new Set(selectedBusinessIds)
    businesses = businesses.filter(b => selectedSet.has(b.id))
  }

  let matchReasonByBusiness = new Map<string, string[]>()
  if (campaign.programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId: campaign.programId, status: { not: 'REJECTED' } },
      select: { businessId: true, matchReason: true }
    })
    matchReasonByBusiness = new Map(matches.map(m => [m.businessId, m.matchReason]))
    businesses = businesses.filter(b => matchReasonByBusiness.has(b.id))
  }

  if (businesses.length === 0) {
    return NextResponse.json({ error: 'Δεν υπάρχουν επιλέξιμοι παραλήπτες για αυτή την καμπάνια' }, { status: 400 })
  }

  processCampaignSend(campaign, businesses, matchReasonByBusiness, session.user.id)
    .catch(err => console.error(`[Campaign ${campaign.id}] Background send failed:`, err?.message || err))

  return NextResponse.json({ started: true, total: businesses.length })
}
