import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountantId = session.user.accountantId
  if (!accountantId) return NextResponse.json([])

  const notifications = await prisma.notification.findMany({
    where: { accountantId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return NextResponse.json(notifications)
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountantId = session.user.accountantId
  if (!accountantId) return NextResponse.json({ error: 'No accountant' }, { status: 403 })

  const { ids } = await request.json()

  await prisma.notification.updateMany({
    where: { accountantId, id: { in: ids } },
    data: { read: true },
  })

  return NextResponse.json({ ok: true })
}
