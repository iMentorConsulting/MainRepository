import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { dismissMatchesForProgram } from '@/lib/matching'

export const runtime = 'nodejs'
export const maxDuration = 60

// Program create/edit already triggers matching/dismissal immediately (see
// /api/programs and /api/programs/[id]), but a program whose endDate simply
// passes with no admin edit was never caught — its stale POTENTIAL matches
// would linger in the normal Business database indefinitely. This sweep
// catches that case: any program still flagged active/not-archived whose
// endDate has passed gets its matches dismissed, same as a manual edit would.

// GET — called by an external cron scheduler (secret in query param)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSweep()
}

// POST — called by the Railway cron-service (Bearer token) or manually by an admin
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return runSweep()
  const session = await auth()
  if (session?.user?.role === 'ADMIN') return runSweep()
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function runSweep() {
  const expired = await prisma.program.findMany({
    where: { active: true, archived: false, endDate: { lt: new Date() } },
    select: { id: true, title: true },
  })

  for (const program of expired) {
    await dismissMatchesForProgram(program.id)
  }

  return NextResponse.json({ ok: true, expiredCount: expired.length, expired: expired.map(p => p.title) })
}
