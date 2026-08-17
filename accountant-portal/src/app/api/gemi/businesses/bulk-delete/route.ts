import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids, importBatch } = await request.json()

  // Mode 1: delete an entire import batch (παρτίδα)
  if (typeof importBatch === 'string' && importBatch.trim()) {
    const { count } = await prisma.gemiLookup.deleteMany({
      where: { importBatch: importBatch.trim() },
    })
    return NextResponse.json({ deleted: count, importBatch: importBatch.trim() })
  }

  // Mode 2: delete explicitly selected ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array or importBatch required' }, { status: 400 })
  }

  const { count } = await prisma.gemiLookup.deleteMany({
    where: { id: { in: ids } },
  })

  return NextResponse.json({ deleted: count })
}
