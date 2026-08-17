import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const announcements = await prisma.espaAnnouncement.findMany({
    orderBy: { firstSeenAt: 'desc' },
  })

  return NextResponse.json(announcements)
}
