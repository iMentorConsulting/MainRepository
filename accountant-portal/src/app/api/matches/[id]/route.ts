import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status } = await request.json()

  const match = await prisma.programMatch.update({
    where: { id: params.id },
    data: { status, updatedAt: new Date() },
  })

  return NextResponse.json(match)
}
