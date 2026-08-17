import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleOnboardingEmails } from '@/lib/onboarding-emails'

// POST /api/admin/onboarding/bulk-schedule
// Schedules the 4-step onboarding sequence for every accountant that doesn't
// already have one scheduled. Safe to call multiple times — skips accountants
// that already have onboarding records.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  // Pass { force: true } to reschedule even accountants who already have records
  const force = body?.force === true

  const allAccountants = await prisma.accountant.findMany({
    select: { id: true, email: true, officeName: true },
  })

  // Find accountants that already have at least one onboarding record
  const existing = await prisma.onboardingEmail.findMany({
    select: { accountantId: true },
    distinct: ['accountantId'],
  })
  const alreadyScheduled = new Set(existing.map(r => r.accountantId))

  const toSchedule = force
    ? allAccountants
    : allAccountants.filter(a => !alreadyScheduled.has(a.id))

  let scheduled = 0
  let skipped = 0

  for (const accountant of toSchedule) {
    try {
      await scheduleOnboardingEmails(accountant.id)
      scheduled++
    } catch (err: any) {
      console.error(`[BulkOnboarding] Failed for ${accountant.email}:`, err?.message)
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    total: allAccountants.length,
    scheduled,
    skipped,
    alreadyHad: alreadyScheduled.size,
  })
}

// GET: preview — shows how many would be scheduled without doing anything
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const total = await prisma.accountant.count()
  const existing = await prisma.onboardingEmail.findMany({
    select: { accountantId: true },
    distinct: ['accountantId'],
  })
  const alreadyScheduled = existing.length
  const wouldSchedule = total - alreadyScheduled

  return NextResponse.json({ total, alreadyScheduled, wouldSchedule })
}
