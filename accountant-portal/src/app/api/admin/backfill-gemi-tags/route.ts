import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/backfill-gemi-tags
// One-time backfill: add "ΓΕΜΗ" tag to all businesses with source='gemi-claim'
// that don't already have it.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const result = await prisma.$executeRaw`
    UPDATE "Business"
    SET tags = array_append(tags, 'ΓΕΜΗ')
    WHERE source = 'gemi-claim'
      AND NOT ('ΓΕΜΗ' = ANY(tags))
  `

  return NextResponse.json({ updated: result })
}
