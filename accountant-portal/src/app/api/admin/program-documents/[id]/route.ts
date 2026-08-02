import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, category, instructions, order } = await request.json()
  const doc = await prisma.programDocument.update({
    where: { id: params.id },
    data: {
      ...(name != null ? { name: name.trim() } : {}),
      ...(category != null ? { category } : {}),
      ...(instructions !== undefined ? { instructions: instructions?.trim() || null } : {}),
      ...(order != null ? { order } : {}),
    },
  })
  return NextResponse.json(doc)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.programDocument.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
