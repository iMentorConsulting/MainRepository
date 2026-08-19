import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// One-shot backfill: marks today's half-finished Ermis conversations so the
// reminder cron can pick them up. Sets lastActivityAt and clientRepliedAt to
// now for any token created today that has at least one user reply and no case.
// Call once via POST /api/admin/ermis-backfill — idempotent (skips already-set rows).
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Today in UTC: 2026-08-19 00:00:00 → 2026-08-19 23:59:59
  const todayStart = new Date('2026-08-19T00:00:00.000Z')
  const todayEnd = new Date('2026-08-19T23:59:59.999Z')

  const candidates = await prisma.businessMatchToken.findMany({
    where: {
      createdAt: { gte: todayStart, lte: todayEnd },
      caseCreatedId: null,
      clientRepliedAt: null,   // skip already-processed rows
    },
  })

  const now = new Date()
  let updated = 0
  let skipped = 0

  for (const t of candidates) {
    const log = Array.isArray(t.chatLog) ? (t.chatLog as any[]) : []
    const hasUserReply = log.some((m: any) => m.role === 'user')
    if (!hasUserReply) { skipped++; continue }

    await prisma.businessMatchToken.update({
      where: { id: t.id },
      data: { lastActivityAt: now, clientRepliedAt: now },
    })
    updated++
  }

  console.log(`[ErmisBackfill] updated=${updated} skipped=${skipped} (no user reply) total_candidates=${candidates.length}`)
  return NextResponse.json({ updated, skipped, total: candidates.length })
}
