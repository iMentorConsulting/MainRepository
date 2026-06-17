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
  if (typeof data.label === 'string') updateData.label = data.label
  if (typeof data.description === 'string') updateData.description = data.description
  if (typeof data.subject === 'string') updateData.subject = data.subject
  if (typeof data.bodyWithAccountant === 'string') updateData.bodyWithAccountant = data.bodyWithAccountant
  if (typeof data.bodyDirect === 'string') updateData.bodyDirect = data.bodyDirect
  if (typeof data.active === 'boolean') updateData.active = data.active

  const item = await prisma.messageTemplate.update({ where: { id: params.id }, data: updateData })
  return NextResponse.json(item)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.messageTemplate.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
