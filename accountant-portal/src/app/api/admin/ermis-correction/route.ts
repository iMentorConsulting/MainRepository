import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyStaleMatchesBecameIneligible } from '@/lib/ermis-correction'

// One-off/manual trigger for the CM correction notice — for cases where a
// match was already reported eligible to CM and rejected *before* the
// automatic hook (in matching.ts's resetStaleMatches/dismissMatchesForProgram)
// existed, so it needs to be sent by hand. Going forward this fires
// automatically; this endpoint is just for clearing the backlog.
// Body: { programId: string, afms: string[] }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { programId, afms } = body
  if (!programId || !Array.isArray(afms) || afms.length === 0) {
    return NextResponse.json({ error: 'programId and afms[] are required' }, { status: 400 })
  }

  const normalizedAfms = afms.map((a: string) => String(a).replace(/\D/g, '').padStart(9, '0'))
  const businesses = await prisma.business.findMany({
    where: { afm: { in: normalizedAfms } },
    select: { id: true, afm: true },
  })
  if (businesses.length === 0) {
    return NextResponse.json({ error: 'No matching businesses found for the given AFMs' }, { status: 404 })
  }

  await notifyStaleMatchesBecameIneligible(programId, businesses.map(b => b.id))

  return NextResponse.json({ ok: true, businessesProcessed: businesses.map(b => b.afm) })
}
