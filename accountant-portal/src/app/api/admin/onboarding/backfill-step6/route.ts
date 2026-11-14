import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// One-off: Email 6 (Σύμβαση Συνεργασίας) was added to the onboarding
// sequence after many accountants had already been scheduled/sent steps
// 1-5 — scheduleOnboardingEmails() only creates rows for the step numbers
// that existed in STEP_DELAYS_DAYS at the time it ran, so those accountants
// have no step=6 OnboardingEmail row at all and the cron (which only
// processes EXISTING rows) will never send them one.
//
// This creates ONLY the missing step=6 row, scheduled to fire on the next
// cron run — it never touches an accountant's existing step 1-5 records
// (no resetting sentAt, no rescheduling), unlike calling
// scheduleOnboardingEmails()/bulk-schedule again would. Safe to re-run —
// skips accountants that already have a step=6 row (sent or pending).
export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountantsWithOnboarding = await prisma.onboardingEmail.findMany({
    select: { accountantId: true },
    distinct: ['accountantId'],
  })
  const accountantsWithStep6 = await prisma.onboardingEmail.findMany({
    where: { step: 6 },
    select: { accountantId: true },
  })
  const hasStep6 = new Set(accountantsWithStep6.map(r => r.accountantId))
  const missing = accountantsWithOnboarding.map(r => r.accountantId).filter(id => !hasStep6.has(id))

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, backfilled: 0 })
  }

  const now = new Date()
  await prisma.onboardingEmail.createMany({
    data: missing.map(accountantId => ({ accountantId, step: 6, scheduledFor: now })),
    skipDuplicates: true,
  })

  return NextResponse.json({ ok: true, backfilled: missing.length })
}
