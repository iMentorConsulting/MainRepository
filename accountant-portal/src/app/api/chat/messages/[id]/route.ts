import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const message = await prisma.chatMessage.findUnique({
    where: { id: params.id },
    include: { conversation: { select: { accountantId: true } } },
  })
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  const isOwnMessage = message.senderRole === session.user.role && message.senderId === session.user.id
  const isOwnConversation = !isAdmin && message.conversation.accountantId === session.user.accountantId

  if (!isAdmin && !(isOwnMessage && isOwnConversation)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.chatMessage.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
