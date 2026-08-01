import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await prisma.gemiLookup.findMany({
    where: { postalAreaDescription: { not: null } },
    select: { postalAreaDescription: true },
    distinct: ['postalAreaDescription'],
    orderBy: { postalAreaDescription: 'asc' },
  })

  return NextResponse.json(rows.map(r => r.postalAreaDescription as string))
}
