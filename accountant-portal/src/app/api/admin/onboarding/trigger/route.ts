import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleOnboardingEmails, sendOnboardingEmailStep } from '@/lib/onboarding-emails'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const accountantId = request.nextUrl.searchParams.get('accountantId')
  if (!accountantId) return NextResponse.json({ error: 'accountantId required' }, { status: 400 })

  const scheduled = await prisma.onboardingEmail.findMany({
    where: { accountantId },
    orderBy: { step: 'asc' },
    select: { step: true, scheduledFor: true, sentAt: true, error: true },
  })
  return NextResponse.json({ scheduled })
}

// Admin-only: schedule (or reset) the onboarding email sequence for a specific
// accountant. Used to test all 4 emails on a test account before enabling the
// sequence globally via ONBOARDING_EMAILS_ENABLED=true.
//
// POST body options:
//   { accountantId }             — schedule steps 1-4 starting now
//   { accountantId, step: 1 }    — send a single step immediately (for previewing)
//   { accountantId, reset: true } — reschedule from scratch (clears sentAt)
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { accountantId, step, reset } = await request.json()
  if (!accountantId) return NextResponse.json({ error: 'accountantId required' }, { status: 400 })

  const accountant = await prisma.accountant.findUnique({
    where: { id: accountantId },
    select: { id: true, email: true, officeName: true, contactPerson: true },
  })
  if (!accountant) return NextResponse.json({ error: 'Accountant not found' }, { status: 404 })

  // Send a specific step immediately (for visual testing)
  if (typeof step === 'number') {
    const existing = await prisma.onboardingEmail.findUnique({
      where: { accountantId_step: { accountantId, step } },
    })
    let recordId = existing?.id
    if (!recordId) {
      const created = await prisma.onboardingEmail.create({
        data: { accountantId, step, scheduledFor: new Date() },
      })
      recordId = created.id
    } else {
      await prisma.onboardingEmail.update({
        where: { id: recordId },
        data: { scheduledFor: new Date(), sentAt: null, error: null },
      })
    }
    await sendOnboardingEmailStep(recordId)
    const updated = await prisma.onboardingEmail.findUnique({ where: { id: recordId }, select: { sentAt: true, error: true } })
    return NextResponse.json({ ok: true, step, sent: !!updated?.sentAt, error: updated?.error })
  }

  // Schedule (or reset) all 4 steps
  await scheduleOnboardingEmails(accountantId)
  if (reset) {
    // When resetting, send step 1 immediately so the admin sees it right away
    const step1Record = await prisma.onboardingEmail.findUnique({
      where: { accountantId_step: { accountantId, step: 1 } },
    })
    if (step1Record) await sendOnboardingEmailStep(step1Record.id)
  }

  const scheduled = await prisma.onboardingEmail.findMany({
    where: { accountantId },
    orderBy: { step: 'asc' },
    select: { step: true, scheduledFor: true, sentAt: true },
  })

  return NextResponse.json({ ok: true, accountant: accountant.email, scheduled })
}
