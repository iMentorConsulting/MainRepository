import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { MatchStatus } from '@prisma/client'

// Re-checks businesses against ΑΑΔΕ to refresh deactivationFlag/deactivationFlagDescr/stopDate
// (needed for businesses imported before these fields were persisted).
// Admin-only, and requires a non-empty ids array (no bulk-refresh-all to avoid hammering ΑΑΔΕ).
// Body: { ids: string[] }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids } = await request.json().catch(() => ({}))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκαν επιχειρήσεις' }, { status: 400 })
  }

  const businesses = await prisma.business.findMany({ where: { id: { in: ids } }, select: { id: true, afm: true } })

  let updated = 0
  let nowInactive = 0
  let failed = 0

  for (const business of businesses) {
    try {
      const data = await lookupAfm(business.afm)
      if (!data) { failed++; continue }
      await prisma.business.update({
        where: { id: business.id },
        data: {
          deactivationFlag: data.deactivationFlag || null,
          deactivationFlagDescr: data.deactivationFlagDescr || null,
          stopDate: data.stopDate || null,
        },
      })
      updated++
      if (data.deactivationFlag === 'Y' || data.stopDate) {
        nowInactive++
        // Dismiss all POTENTIAL matches for newly inactive businesses
        await prisma.programMatch.updateMany({
          where: { businessId: business.id, status: MatchStatus.POTENTIAL },
          data: { status: MatchStatus.REJECTED, matchScore: 0 },
        })
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ total: businesses.length, updated, nowInactive, failed })
}
