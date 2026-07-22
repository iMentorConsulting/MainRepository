import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const data = await request.json()
  const { name, wpPageId, categories, placeholders, active } = data
  const template = await prisma.wordpressTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(wpPageId !== undefined && { wpPageId: Number(wpPageId) }),
      ...(categories !== undefined && { categories }),
      ...(placeholders !== undefined && { placeholders }),
      ...(active !== undefined && { active }),
    },
  })
  return NextResponse.json(template)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  await prisma.wordpressTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
