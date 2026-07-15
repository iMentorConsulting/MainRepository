import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaigns = await prisma.gemiCampaign.findMany({
    include: {
      program: { select: { id: true, title: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(campaigns)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  const { title, channel, subject, htmlContent, messageTemplate, programId, targetGemiIds } = data

  if (!title || !channel) {
    return NextResponse.json({ error: 'title and channel are required' }, { status: 400 })
  }

  const campaign = await prisma.gemiCampaign.create({
    data: {
      title,
      channel,
      subject: subject || null,
      htmlContent: htmlContent || null,
      messageTemplate: messageTemplate || null,
      programId: programId || null,
      status: 'DRAFT',
      createdBy: session.user.id,
    },
  })

  let recipientRows: { campaignId: string; gemiId: string; channel: string; recipient: string }[] = []

  if (targetGemiIds && Array.isArray(targetGemiIds) && targetGemiIds.length > 0) {
    const gemis = await prisma.gemiLookup.findMany({
      where: { id: { in: targetGemiIds } },
      select: { id: true, email: true, phone: true },
    })

    for (const gemi of gemis) {
      if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
        if (gemi.email) {
          recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'EMAIL', recipient: gemi.email })
        }
      }
      if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
        if (gemi.phone) {
          recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'VIBER', recipient: gemi.phone })
        }
      }
    }
  } else {
    const whereEmail =
      channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER'
        ? { email: { not: null }, unsubscribedAt: null }
        : null
    const whereViber =
      channel === 'VIBER' || channel === 'EMAIL_AND_VIBER'
        ? { phone: { not: null }, unsubscribedAt: null }
        : null

    if (whereEmail) {
      const gemis = await prisma.gemiLookup.findMany({
        where: whereEmail,
        select: { id: true, email: true },
      })
      for (const gemi of gemis) {
        if (gemi.email) {
          recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'EMAIL', recipient: gemi.email })
        }
      }
    }

    if (whereViber) {
      const gemis = await prisma.gemiLookup.findMany({
        where: whereViber,
        select: { id: true, phone: true },
      })
      for (const gemi of gemis) {
        if (gemi.phone) {
          recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'VIBER', recipient: gemi.phone })
        }
      }
    }
  }

  if (recipientRows.length > 0) {
    await prisma.gemiCampaignRecipient.createMany({ data: recipientRows })
  }

  const result = await prisma.gemiCampaign.findUnique({
    where: { id: campaign.id },
    include: {
      program: { select: { id: true, title: true } },
      _count: { select: { recipients: true } },
    },
  })

  return NextResponse.json(result, { status: 201 })
}
