import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForGemi } from '@/lib/gemi-matching'

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
  try {
    const body = await request.json()
    if (typeof body?.limit === 'number') {
      limit = Math.min(Math.max(1, body.limit), 1000)
    }
  } catch {
    // no body or invalid JSON — use default
  }

  const records = await prisma.gemiLookup.findMany({
    where: { aadeEnriched: true, matchingDone: false },
    select: { id: true },
    take: limit,
  })

  let totalMatches = 0
  for (const record of records) {
    const count = await runMatchingForGemi(record.id)
    totalMatches += count
  }

  return NextResponse.json({ processed: records.length, totalMatches })
}
