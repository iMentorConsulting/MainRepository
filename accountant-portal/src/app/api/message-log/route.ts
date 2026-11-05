import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const KIND_LABELS: Record<string, string> = {
  CAMPAIGN: 'Καμπάνια',
  QUICK_SEND: 'Γρήγορη Αποστολή',
  ELIGIBILITY: 'Email/Viber Επιλεξιμότητας',
  PROGRAM_EMAIL: 'Email Προγράμματος',
  MICROCREDITS: 'Ανάλυση Μικροπιστώσεων',
}

// "Όλες οι Αποστολές" on the Campaigns page — merges two separate send
// records into one chronological feed: formal Campaign sends (via
// CampaignRecipient, one row per business per campaign) and every other
// individual/ad-hoc send (MessageLog — Quick Send, the combined eligibility
// email/Viber, the single-program prospect email). An accountant sees only
// sends touching their own clients; admin sees everything, optionally
// scoped to one office via accountantId.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100)
  const kindFilter = searchParams.get('kind') || ''
  const search = searchParams.get('search') || ''

  let accountantId: string | null = null
  if (session.user.role === 'ACCOUNTANT') {
    accountantId = session.user.accountantId ?? null
  } else if (session.user.role === 'ADMIN') {
    accountantId = searchParams.get('accountantId') || null
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const logWhere: any = {}
  if (accountantId) logWhere.accountantId = accountantId
  if (search) {
    logWhere.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search, mode: 'insensitive' } },
    ]
  }

  const recipientWhere: any = {}
  if (accountantId) recipientWhere.business = { accountantId }
  if (search) {
    recipientWhere.business = {
      ...(recipientWhere.business || {}),
      OR: [
        { onomasia: { contains: search, mode: 'insensitive' } },
        { afm: { contains: search, mode: 'insensitive' } },
      ],
    }
  }

  // Pull a generous window from each source, merge, sort, then paginate the
  // combined list — simplest correct approach without a DB-level UNION.
  const fetchLimit = page * limit + limit

  let logs: Awaited<ReturnType<typeof prisma.messageLog.findMany>> = []
  let recipients: any[] = []
  try {
    ;[logs, recipients] = await Promise.all([
      kindFilter && kindFilter !== 'CAMPAIGN'
        ? prisma.messageLog.findMany({ where: { ...logWhere, kind: kindFilter }, orderBy: { createdAt: 'desc' }, take: fetchLimit })
        : kindFilter === 'CAMPAIGN' ? [] : prisma.messageLog.findMany({ where: logWhere, orderBy: { createdAt: 'desc' }, take: fetchLimit }),
      kindFilter && kindFilter !== 'CAMPAIGN'
        ? []
        : prisma.campaignRecipient.findMany({
            where: { ...recipientWhere, sentAt: { not: null } },
            select: {
              id: true, channel: true, recipient: true, status: true, sentAt: true, errorMessage: true,
              campaign: { select: { title: true, subject: true, accountantId: true, accountant: { select: { officeName: true } }, createdBy: true } },
              business: { select: { id: true, onomasia: true, afm: true, accountantId: true, accountant: { select: { officeName: true } } } },
            },
            orderBy: { sentAt: 'desc' },
            take: fetchLimit,
          }),
    ])
  } catch (err: any) {
    // The MessageLog table may not exist yet if this deploy's migration
    // hasn't been applied to the production DB — degrade to an empty list
    // instead of a 500 that breaks the whole Campaigns page.
    console.error('[MessageLog] query failed:', err?.message)
    return NextResponse.json({ items: [], page, limit, hasMore: false })
  }

  const merged = [
    ...logs.map(l => ({
      id: `log_${l.id}`,
      kind: l.kind,
      kindLabel: KIND_LABELS[l.kind] || l.kind,
      channel: l.channel,
      businessId: l.businessId,
      businessName: l.businessName,
      afm: l.afm,
      accountantName: l.accountantName,
      subject: l.subject,
      recipient: l.recipient,
      success: l.success,
      errorMessage: l.errorMessage,
      sentByName: l.sentByName,
      createdAt: l.createdAt,
    })),
    ...recipients.map(r => ({
      id: `rec_${r.id}`,
      kind: 'CAMPAIGN' as const,
      kindLabel: KIND_LABELS.CAMPAIGN,
      channel: r.channel,
      businessId: r.business?.id ?? null,
      businessName: r.business?.onomasia ?? null,
      afm: r.business?.afm ?? null,
      accountantName: r.campaign.accountant?.officeName ?? r.business?.accountant?.officeName ?? null,
      subject: r.campaign.subject ?? r.campaign.title,
      recipient: r.recipient,
      success: r.status !== 'failed',
      errorMessage: r.errorMessage,
      sentByName: null,
      createdAt: r.sentAt as Date,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const skip = (page - 1) * limit
  const pageItems = merged.slice(skip, skip + limit)

  return NextResponse.json({
    items: pageItems,
    page,
    limit,
    hasMore: merged.length > skip + limit,
  })
}
