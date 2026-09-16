import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForGemi, loadActivePrograms } from '@/lib/gemi-matching'
import { mapWithConcurrency } from '@/lib/concurrency'

// Each record costs several sequential DB round-trips (see runMatchingForGemi),
// so processing them one-at-a-time is dominated by network latency, not DB
// load. Running a bounded number in parallel cuts wall-clock time roughly
// proportionally without overwhelming the connection pool.
const MATCH_CONCURRENCY = 16

export async function POST(request: NextRequest) {
  const session = await auth()
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const bearerValid = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!session && !bearerValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let limit = 200
  let reset = false
  let ids: string[] | null = null
  try {
    const body = await request.json()
    if (typeof body?.limit === 'number') {
      limit = Math.min(Math.max(1, body.limit), 3000)
    }
    reset = body?.reset === true
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      ids = body.ids as string[]
    }
  } catch {
    // no body or invalid JSON — use default
  }

  // Targeted re-match for specific IDs (e.g. after editing a single business)
  if (ids) {
    await prisma.gemiLookup.updateMany({
      where: { id: { in: ids } },
      data: { matchingDone: false },
    })
    const records = await prisma.gemiLookup.findMany({
      where: { id: { in: ids }, matchingDone: false },
      select: { id: true },
    })
    const programs = await loadActivePrograms()
    const counts = await mapWithConcurrency(records, MATCH_CONCURRENCY, record => runMatchingForGemi(record.id, programs))
    const totalMatches = counts.reduce((sum, c) => sum + c, 0)
    return NextResponse.json({ processed: records.length, totalMatches, remaining: 0 })
  }

  // Force re-matching: flag every enriched business as not-yet-matched so the
  // normal batch loop re-processes all of them (used after program changes).
  if (reset) {
    const { count } = await prisma.gemiLookup.updateMany({
      where: { aadeEnriched: true },
      data: { matchingDone: false },
    })
    console.log(`[GemiMatch] reset matchingDone for ${count} businesses (force re-match)`)
  }

  const records = await prisma.gemiLookup.findMany({
    where: { aadeEnriched: true, matchingDone: false },
    select: { id: true },
    take: limit,
  })

  const programs = await loadActivePrograms()
  const counts = await mapWithConcurrency(records, MATCH_CONCURRENCY, record => runMatchingForGemi(record.id, programs))
  const totalMatches = counts.reduce((sum, c) => sum + c, 0)

  // How many still await matching (for client-side progress/looping)
  const remaining = await prisma.gemiLookup.count({
    where: { aadeEnriched: true, matchingDone: false },
  })

  return NextResponse.json({ processed: records.length, totalMatches, remaining })
}
