import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const batches = await prisma.gemiLookup.findMany({
    where: { importBatch: { not: null } },
    select: { importBatch: true },
    distinct: ['importBatch'],
    orderBy: { importBatch: 'asc' },
  })

  return NextResponse.json({
    importBatches: batches.map(b => b.importBatch).filter(Boolean) as string[],
  })
}
