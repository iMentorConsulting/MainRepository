import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderTemplate, renderCampaignEmailHtml } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessIds, channel, subject, messageTemplate, programId } = await request.json()
  if (!channel || !messageTemplate?.trim() || !Array.isArray(businessIds) || businessIds.length === 0) {
    return NextResponse.json({ error: 'businessIds, channel and messageTemplate are required' }, { status: 400 })
  }

  const [businesses, matchRows, program] = await Promise.all([
    prisma.business.findMany({
      where: { id: { in: businessIds } },
      include: {
        accountant: true,
        activities: { where: { firmActKind: 1 }, take: 1 },
      },
    }),
    programId
      ? prisma.programMatch.findMany({
          where: { programId, businessId: { in: businessIds } },
          select: { businessId: true, matchReason: true },
        })
      : Promise.resolve([]),
    programId
      ? prisma.program.findUnique({ where: { id: programId }, select: { title: true } })
      : Promise.resolve(null),
  ])

  const matchByBusiness = new Map(matchRows.map(m => [m.businessId, m.matchReason]))

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })

  let sent = 0
  let failed = 0

  for (const business of businesses) {
    const variables: Record<string, string> = {
      business_name: business.onomasia || business.afm,
      afm: business.afm,
      accountant_name: business.accountant?.contactPerson || '',
      accountant_office: business.accountant?.officeName || '',
      kad_description: business.activities[0]?.firmActCode || '',
      program_title: program?.title || '',
      match_reason: (matchByBusiness.get(business.id) || []).map((r: string) => `• ${r}`).join('\n'),
      unsubscribe_link: `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/api/unsubscribe/${business.unsubscribeToken}`,
    }

    const renderedSubject = renderTemplate(subject || 'Ενημέρωση από το λογιστικό σας γραφείο', variables)

    let success = false

    try {
      if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
        if (business.email) {
          const boldedMessage = renderTemplate(messageTemplate, variables, {
            boldKeys: ['business_name', 'afm', 'accountant_name', 'accountant_office', 'program_title', 'kad_description'],
          })
          // Strip empty *...* pairs
          const cleanBody = boldedMessage.replace(/\*([^*\n]*)\*/g, (_m: string, inner: string) => inner.trim() ? `<strong>${inner}</strong>` : '')
          const emailOk = await sendEmail({
            to: business.email,
            subject: renderedSubject,
            html: renderCampaignEmailHtml({
              title: renderedSubject,
              bodyText: cleanBody,
              recipientName: business.onomasia || business.afm,
              imentorLogoUrl: appSetting?.imentorLogoUrl || '',
              accountantOfficeName: business.accountant?.officeName || '',
              accountantLogoUrl: business.accountant?.logoUrl || '',
              unsubscribeUrl: variables.unsubscribe_link,
            }),
          })
          if (emailOk) success = true
        }
      }

      if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
        const phone = business.viberPhone || business.phone
        if (phone) {
          const rawMsg = renderTemplate(messageTemplate, variables)
          const cleanViber = rawMsg.replace(/\*([^*\n]*)\*/g, (_m: string, inner: string) => inner.trim() || '')
          const viberOk = await sendViberMessage({ to: phone, text: cleanViber, senderName: business.onomasia || business.afm })
          if (viberOk) success = true
        }
      }
    } catch (err: any) {
      console.error(`[QuickSend] Error for ${business.afm}:`, err?.message || err)
    }

    if (success) sent++
    else failed++
  }

  return NextResponse.json({ sent, failed, total: businesses.length })
}
