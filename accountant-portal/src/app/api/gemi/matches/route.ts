import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const programId = searchParams.get('programId') || undefined
  const status = searchParams.get('status') || undefined
  const emailEngagement = searchParams.get('emailEngagement') || ''
  const enriched = searchParams.get('enriched') || ''
  const notified = searchParams.get('notified') || ''
  const importBatch = searchParams.get('importBatch') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, parseInt(searchParams.get('limit') || '50', 10))
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (programId) where.programId = programId
  if (status) where.status = status

  const gemiWhere: Record<string, unknown> = {}
  if (emailEngagement === 'sent') {
    gemiWhere.campaignRecipients = { some: { sentAt: { not: null } } }
  } else if (emailEngagement === 'opened') {
    gemiWhere.campaignRecipients = { some: { openedAt: { not: null } } }
  } else if (emailEngagement === 'not_opened') {
    gemiWhere.campaignRecipients = { some: { sentAt: { not: null }, openedAt: null } }
  } else if (emailEngagement === 'clicked') {
    gemiWhere.campaignRecipients = { some: { clickedAt: { not: null } } }
  } else if (emailEngagement === 'bounced') {
    gemiWhere.campaignRecipients = { some: { bouncedAt: { not: null } } }
  } else if (emailEngagement === 'unsubscribed') {
    gemiWhere.unsubscribedAt = { not: null }
  }
  if (enriched !== '') gemiWhere.aadeEnriched = enriched === 'true'
  if (notified === 'true' || notified === 'false') {
    const campaignFilter = programId
      ? {
          sentAt: { not: null },
          campaign: {
            OR: [
              { programId },
              { programId2: programId },
              { programId3: programId },
            ],
          },
        }
      : { sentAt: { not: null } }
    gemiWhere.campaignRecipients = notified === 'true'
      ? { some: campaignFilter }
      : { none: campaignFilter }
  }
  if (importBatch) gemiWhere.importBatch = importBatch
  if (Object.keys(gemiWhere).length > 0) where.gemi = gemiWhere

  const [matches, total] = await Promise.all([
    prisma.gemiProgramMatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        gemi: {
          select: { id: true, afm: true, onomasia: true, email: true, phone: true, claimedAt: true, postalAreaDescription: true, claimedBusinessId: true },
        },
        program: {
          select: { id: true, title: true },
        },
      },
    }),
    prisma.gemiProgramMatch.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)
  return NextResponse.json({
    matches,
    total,
    page,
    pages: totalPages,
    meta: { total, page, pageSize: limit, totalPages },
  })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const { status } = body

  const updated = await prisma.gemiProgramMatch.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  })

  return NextResponse.json(updated)
}
