import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel') ?? 'EMAIL'
  const programId = searchParams.get('programId') || null
  const importBatch = searchParams.get('importBatch') || null

  let emailCount = 0
  let viberCount = 0

  const baseWhere: Record<string, unknown> = { unsubscribedAt: null }
  if (importBatch) baseWhere.importBatch = importBatch

  if (programId) {
    // Count only GemiLookups that have a match for this program
    const matchedGemiIds = await prisma.gemiProgramMatch.findMany({
      where: { programId, status: { not: 'REJECTED' } },
      select: { gemiId: true },
    })
    const ids = matchedGemiIds.map(m => m.gemiId)

    if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
      emailCount = await prisma.gemiLookup.count({
        where: { ...baseWhere, id: { in: ids }, email: { not: null } },
      })
    }
    if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
      viberCount = await prisma.gemiLookup.count({
        where: { ...baseWhere, id: { in: ids }, phone: { not: null } },
      })
    }
  } else {
    if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
      emailCount = await prisma.gemiLookup.count({
        where: { ...baseWhere, email: { not: null } },
      })
    }
    if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
      viberCount = await prisma.gemiLookup.count({
        where: { ...baseWhere, phone: { not: null } },
      })
    }
  }

  return NextResponse.json({ emailCount, viberCount, total: emailCount + viberCount })
}
