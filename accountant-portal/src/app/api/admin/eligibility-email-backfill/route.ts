import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkEligibilityForAfm } from '@/lib/eligibility-check-core'
import { buildEligibilitySubject, buildEligibilityEmailHtml } from '@/lib/eligibility-email'
import { sendEmail } from '@/lib/email'
import { mapWithConcurrency } from '@/lib/concurrency'

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

  const where: any = { eligibilityEmailSentAt: null, email: { not: null } }
  if (sources.length) where.source = { in: sources }
  if (accountantIds.length) where.accountantId = { in: accountantIds }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999))
  }
  if (search) {
    where.OR = [
      { afm: { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
    ]
  }

  const totalRemaining = await prisma.business.count({ where })
  const batch = await prisma.business.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, afm: true, email: true, phone: true },
  })

  let sent = 0
  let ineligible = 0
  let failed = 0

  await mapWithConcurrency(batch, 5, async (b) => {
    try {
      const result = await checkEligibilityForAfm(b.afm, b.email, b.phone)
      if (!result.notFound && !result.inactive && result.programs.length > 0 && b.email) {
        await sendEmail({
          to: b.email,
          subject: buildEligibilitySubject(result.businessName, result.programs.length),
          html: buildEligibilityEmailHtml({ businessName: result.businessName, programs: result.programs, businessDetails: result.businessDetails }),
        })
        sent++
      } else {
        ineligible++
      }
      await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } })
    } catch (err: any) {
      failed++
      console.error(`[EligibilityBackfill] ΑΦΜ ${b.afm} failed:`, err?.message)
      // Still mark as processed — a persistently-failing ΑΦΜ (e.g. AADE down
      // for that lookup) would otherwise block every future batch forever.
      await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } }).catch(() => {})
    }
  })

  return NextResponse.json({
    processed: batch.length,
    sent,
    ineligible,
    failed,
    remaining: Math.max(0, totalRemaining - batch.length),
  })
}
