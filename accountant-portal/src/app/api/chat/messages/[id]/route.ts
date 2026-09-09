import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const message = await prisma.chatMessage.findUnique({ where: { id: params.id } })
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.chatMessage.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
