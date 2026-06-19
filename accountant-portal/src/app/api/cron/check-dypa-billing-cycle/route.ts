import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000

// Hit on a schedule (Railway/cron-job.org), same pattern as the other
// /api/cron/* routes. For every ΔΥΠΑ assignment whose recurring document
// cycle is active (i.e. hireStartDate has been set), creates the next
// bimonthly CaseDocumentRequest once it falls due — starting two months
// after hireStartDate, then every two months after that.
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCheck()
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCheck()
}

async function runCheck() {
  const due = await prisma.dypaAssignment.findMany({
    where: { recurringFeeActive: true, hireStartDate: { not: null } },
    select: { id: true, clientCaseId: true, hireStartDate: true, billingCycleCount: true },
  })

  let createdCount = 0
  for (const a of due) {
    const nextDue = new Date(a.hireStartDate!.getTime() + (a.billingCycleCount + 1) * TWO_MONTHS_MS)
    if (nextDue > new Date()) continue

    const nextCycle = a.billingCycleCount + 1
    await prisma.$transaction([
      prisma.caseDocumentRequest.create({
        data: {
          caseId: a.clientCaseId,
          category: `ΔΥΠΑ — Δίμηνο #${nextCycle}`,
          note: 'Αυτόματο αίτημα εγγράφων δίμηνου κύκλου παρακολούθησης ΔΥΠΑ.',
          createdById: 'cron',
        },
      }),
      prisma.dypaAssignment.update({
        where: { id: a.id },
        data: { billingCycleCount: nextCycle, lastBillingCycleAt: new Date() },
      }),
    ])
    createdCount++
  }

  return NextResponse.json({ ok: true, checked: due.length, created: createdCount })
}
