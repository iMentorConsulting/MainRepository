import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEligibilityMessages } from '@/lib/eligibility-message'

export const dynamic = 'force-dynamic'

const BATCH_SIZE = 25

// POST /api/admin/eligibility-email-backfill
// Catches up the "Βρέθηκαν διαθέσιμα προγράμματα" eligibility email for
// Business rows that never got it — e.g. a website-form signup created
// directly (bulk import, manual add) rather than through the Moosend
// signup webhook, which is the only place that currently sends it live.
// Accepts the exact same filters as /api/admin/businesses-log so an admin
// can select e.g. source=website-form + a date range there and reuse it
// here. Processes BATCH_SIZE rows per call — call repeatedly (the
// businesses-log page does this in a loop) until remaining is 0.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const sources: string[] = Array.isArray(body.sources) ? body.sources : []
  const accountantIds: string[] = Array.isArray(body.accountantIds) ? body.accountantIds : []
  const dateFrom: string | null = body.dateFrom || null
  const dateTo: string | null = body.dateTo || null
  const search: string = (body.search || '').trim()
  // 'direct' (default): always sent as a plain I-MENTOR message.
  // 'accountant': mentions the business's accountant by office name, when it
  // has one — a business with no assigned accountant still gets the direct
  // wording regardless of this setting, since there's nothing to mention.
  const mode: 'direct' | 'accountant' = body.mode === 'accountant' ? 'accountant' : 'direct'
  const channels: Set<string> = new Set(Array.isArray(body.channels) && body.channels.length > 0 ? body.channels : ['email'])

  const where: any = {
    eligibilityEmailSentAt: null,
    OR: [{ email: { not: null } }, { phone: { not: null } }, { viberPhone: { not: null } }],
  }
  if (sources.length) where.source = { in: sources }
  if (accountantIds.length) where.accountantId = { in: accountantIds }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999))
  }
  if (search) {
    // This route's own OR (email/phone/viberPhone presence) and the search
    // OR would otherwise collide — AND them together explicitly.
    where.AND = [
      { OR: where.OR },
      {
        OR: [
          { afm: { contains: search, mode: 'insensitive' } },
          { onomasia: { contains: search, mode: 'insensitive' } },
        ],
      },
    ]
    delete where.OR
  }

  const totalRemaining = await prisma.business.count({ where })
  const batch = await prisma.business.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, afm: true, email: true, phone: true, viberPhone: true, accountantId: true },
  })

  const outcome = await sendEligibilityMessages(batch, { mode, channels: channels as Set<'email' | 'viber'> })

  return NextResponse.json({
    ...outcome,
    remaining: Math.max(0, totalRemaining - batch.length),
  })
}
