import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { ids } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const result = await prisma.commission.updateMany({
    where: {
      id: { in: ids },
      status: 'PENDING',
    },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: session.user.id,
    },
  })

  return NextResponse.json({ approved: result.count, requested: ids.length })
}
