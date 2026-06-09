import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderCampaignEmailHtml } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { channel, subject, message } = await request.json()
  if (!channel || !message?.trim()) {
    return NextResponse.json({ error: 'channel and message are required' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { accountant: true },
  })
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })

  let emailOk = false
  let viberOk = false

  if ((channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') && business.email) {
    const cleanBody = message.replace(/\*([^*\n]*)\*/g, (_, inner: string) => inner.trim() ? `<strong>${inner}</strong>` : '')
    emailOk = await sendEmail({
      to: business.email,
      subject: subject || 'Ενημέρωση από το λογιστικό σας γραφείο',
      html: renderCampaignEmailHtml({
        title: subject || 'Ενημέρωση',
        bodyText: cleanBody,
        recipientName: business.onomasia || business.afm,
        imentorLogoUrl: appSetting?.imentorLogoUrl || '',
        accountantOfficeName: business.accountant?.officeName || '',
        accountantLogoUrl: business.accountant?.logoUrl || '',
      }),
    })
  }

  if ((channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') && (business.viberPhone || business.phone)) {
    const phone = business.viberPhone || business.phone || ''
    const cleanViber = message.replace(/\*([^*\n]*)\*/g, (_, inner: string) => inner.trim() || '')
    viberOk = await sendViberMessage({ to: phone, text: cleanViber, senderName: business.onomasia || business.afm })
  }

  const success = emailOk || viberOk
  return NextResponse.json({ success, emailOk, viberOk })
}
