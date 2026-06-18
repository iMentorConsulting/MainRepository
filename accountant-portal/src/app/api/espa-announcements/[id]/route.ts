import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { reviewStatus, convertedProgramId } = await request.json()
  const allowed = ['NEW', 'REVIEWED', 'IGNORED', 'CONVERTED']
  if (reviewStatus && !allowed.includes(reviewStatus)) {
    return NextResponse.json({ error: 'Invalid reviewStatus' }, { status: 400 })
  }

  const announcement = await prisma.espaAnnouncement.update({
    where: { id: params.id },
    data: {
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(convertedProgramId ? { convertedProgramId } : {}),
    },
  })

  return NextResponse.json(announcement)
}
