import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  const updateData: any = {}
  if (typeof data.label === 'string') updateData.label = data.label.trim()
  if (typeof data.active === 'boolean') updateData.active = data.active
  if (typeof data.order === 'number') updateData.order = data.order

  const item = await prisma.eligibilityCriterion.update({ where: { id: params.id }, data: updateData })
  return NextResponse.json(item)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.eligibilityCriterion.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
