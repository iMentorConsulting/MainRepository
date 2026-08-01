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
  const { title, channel, subject, previewText, htmlContent, messageTemplate, programId, programId2, requireBothPrograms, targetGemiIds, region, category, importBatch, hasReceivedCampaign, tags, excludeTags } = data

  if (!title || !channel) {
    return NextResponse.json({ error: 'title and channel are required' }, { status: 400 })
  }

  const campaign = await prisma.gemiCampaign.create({
    data: {
      title,
      channel,
      subject: subject || null,
      previewText: previewText || null,
      htmlContent: htmlContent || null,
      messageTemplate: messageTemplate || null,
      programId: programId || null,
      programId2: programId2 || null,
      status: 'DRAFT',
      createdBy: session.user.id,
    },
  })

  let recipientRows: { campaignId: string; gemiId: string; channel: string; recipient: string }[] = []

  if (targetGemiIds && Array.isArray(targetGemiIds) && targetGemiIds.length > 0) {
    // unsubscribedAt filter applies to hand-picked recipients too — an
    // unsubscribed business must never receive another campaign.
    const gemis = await prisma.gemiLookup.findMany({
      where: { id: { in: targetGemiIds }, unsubscribedAt: null },
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
    // If programId provided, restrict to GemiLookups with a non-rejected match for that program
    let programMatchedIds: string[] | null = null
    if (programId) {
      const matches = await prisma.gemiProgramMatch.findMany({
        where: { programId, status: { not: 'REJECTED' } },
        select: { gemiId: true },
      })
      programMatchedIds = matches.map(m => m.gemiId)

      // Dual-offer targeting: keep only businesses that ALSO match program B
      if (requireBothPrograms && programId2) {
        const matches2 = await prisma.gemiProgramMatch.findMany({
          where: { programId: programId2, status: { not: 'REJECTED' }, gemiId: { in: programMatchedIds } },
          select: { gemiId: true },
        })
        const ids2 = new Set(matches2.map(m => m.gemiId))
        programMatchedIds = programMatchedIds.filter(id => ids2.has(id))
      }
    }

    const baseWhere: Record<string, unknown> = { unsubscribedAt: null }
    if (programMatchedIds) baseWhere.id = { in: programMatchedIds }
    if (importBatch) baseWhere.importBatch = importBatch
    if (region) baseWhere.postalAreaDescription = region
    if (category) baseWhere.category = category
    if (Array.isArray(tags) && tags.length > 0) baseWhere.tags = { hasSome: tags }
    if (Array.isArray(excludeTags) && excludeTags.length > 0) baseWhere.NOT = { tags: { hasSome: excludeTags } }
    if (hasReceivedCampaign === 'true') baseWhere.campaignRecipients = { some: { status: 'sent' } }
    if (hasReceivedCampaign === 'false') baseWhere.campaignRecipients = { none: { status: 'sent' } }

    if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
      const gemis = await prisma.gemiLookup.findMany({
        where: { ...baseWhere, email: { not: null } },
        select: { id: true, email: true },
      })
      for (const gemi of gemis) {
        if (gemi.email) recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'EMAIL', recipient: gemi.email })
      }
    }

    if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
      const gemis = await prisma.gemiLookup.findMany({
        where: { ...baseWhere, phone: { not: null } },
        select: { id: true, phone: true },
      })
      for (const gemi of gemis) {
        if (gemi.phone) recipientRows.push({ campaignId: campaign.id, gemiId: gemi.id, channel: 'VIBER', recipient: gemi.phone })
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
