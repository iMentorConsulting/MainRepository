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
  const { title, channel, subject, previewText, htmlContent, messageTemplate, programId, programId2, programId3, requireBothPrograms, targetGemiIds, region, category, importBatch, hasReceivedCampaign, tags, excludeTags } = data

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
      programId3: programId3 || null,
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
    // Use relation filters (EXISTS subqueries) instead of id IN (...) to avoid
    // PostgreSQL's 32767 bind-variable limit when the match list is large.
    const baseWhere: Record<string, unknown> = { unsubscribedAt: null }
    if (programId) {
      const mustMatch: string[] = [programId]
      if (requireBothPrograms && programId2) mustMatch.push(programId2)
      if (requireBothPrograms && programId3) mustMatch.push(programId3)
      const programFilters = mustMatch.map((pid: string) => ({
        programMatches: { some: { programId: pid, status: { not: 'REJECTED' } } },
      }))
      if (programFilters.length === 1) {
        baseWhere.programMatches = programFilters[0].programMatches
      } else {
        baseWhere.AND = programFilters
      }
    }
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
