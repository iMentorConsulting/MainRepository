import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'

// Re-checks businesses against ΑΑΔΕ to refresh deactivationFlag/deactivationFlagDescr/stopDate
// (needed for businesses imported before these fields were persisted).
// Body: { ids?: string[] } — when omitted, refreshes all businesses visible to the caller.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = (session.user as any).accountantId

  const { ids } = await request.json().catch(() => ({}))

  const where: any = {}
  if (Array.isArray(ids) && ids.length > 0) where.id = { in: ids }
  if (!isAdmin && accountantId) where.accountantId = accountantId

  const businesses = await prisma.business.findMany({ where, select: { id: true, afm: true } })

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
      if (data.deactivationFlag === 'Y' || data.stopDate) nowInactive++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ total: businesses.length, updated, nowInactive, failed })
}
