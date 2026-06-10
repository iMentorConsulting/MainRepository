import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const STATUSES = new Set(['PENDING', 'ANSWERED', 'COMPLETED', 'ARCHIVED'])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await request.json()
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'Μη έγκυρη κατάσταση' }, { status: 400 })
  }

  const conversation = await prisma.chatConversation.update({
    where: { id: params.id },
    data: { status },
  })

  return NextResponse.json(conversation)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.chatConversation.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
