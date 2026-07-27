import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOnboardingEmailStep } from '@/lib/onboarding-emails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sends any pending onboarding emails whose scheduledFor has passed.
// Called by Railway cron (or any scheduler) — authenticated via CRON_SECRET.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const pending = await prisma.onboardingEmail.findMany({
    where: { scheduledFor: { lte: new Date() }, sentAt: null },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
  })

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  let sent = 0
  let errors = 0

  for (const record of pending) {
    try {
      await sendOnboardingEmailStep(record.id)
      const updated = await prisma.onboardingEmail.findUnique({ where: { id: record.id }, select: { sentAt: true } })
      if (updated?.sentAt) sent++
      else errors++
    } catch (err: any) {
      console.error(`[OnboardingCron] step ${record.step} for ${record.accountantId} failed:`, err?.message)
      await prisma.onboardingEmail.update({
        where: { id: record.id },
        data: { error: err?.message || 'Unknown error' },
      }).catch(() => {})
      errors++
    }
  }

  return NextResponse.json({ ok: true, sent, errors, total: pending.length })
}
