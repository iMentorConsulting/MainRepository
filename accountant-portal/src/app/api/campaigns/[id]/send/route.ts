import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCampaignSend } from '@/lib/campaign-send'

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
  let maxRecipients: number | null = null
  try {
    const body = await request.json()
    if (Array.isArray(body?.businessIds)) selectedBusinessIds = body.businessIds
    if (body?.maxRecipients && Number.isInteger(body.maxRecipients) && body.maxRecipients > 0) {
      maxRecipients = body.maxRecipients
    }
  } catch {
    // no body provided — send to all eligible recipients
  }

  // Build a targeted where clause to avoid loading all businesses into memory
  const businessWhere: Record<string, unknown> = { excludedFromCampaigns: false }
  if (selectedBusinessIds) {
    businessWhere.id = { in: selectedBusinessIds }
  } else if (campaign.accountantId) {
    businessWhere.accountantId = campaign.accountantId
  }

  let businesses = await prisma.business.findMany({
    where: businessWhere,
    include: {
      accountant: true,
      activities: { where: { firmActKind: 1 }, take: 1 },
    },
  })

  let matchReasonByBusiness = new Map<string, string[]>()
  if (campaign.programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId: campaign.programId, status: { not: 'REJECTED' } },
      select: { businessId: true, matchReason: true }
    })
    matchReasonByBusiness = new Map(matches.map(m => [m.businessId, m.matchReason]))
    // Only filter by matches when no explicit list was provided (send-to-all mode).
    // When the caller explicitly selected businesses (wizard), they've already
    // verified eligibility — the match filter can drop them if matches are stale.
    if (!selectedBusinessIds) {
      businesses = businesses.filter(b => matchReasonByBusiness.has(b.id))
    }
  }

  if (businesses.length === 0) {
    return NextResponse.json({ error: 'Δεν υπάρχουν επιλέξιμοι παραλήπτες για αυτή την καμπάνια' }, { status: 400 })
  }

  if (maxRecipients && businesses.length > maxRecipients) {
    businesses = businesses.slice(0, maxRecipients)
  }

  processCampaignSend(campaign, businesses, matchReasonByBusiness, session.user.id)
    .catch(err => console.error(`[Campaign ${campaign.id}] Background send failed:`, err?.message || err))

  return NextResponse.json({ started: true, total: businesses.length, capped: maxRecipients !== null && maxRecipients < (selectedBusinessIds?.length ?? businesses.length) })
}
