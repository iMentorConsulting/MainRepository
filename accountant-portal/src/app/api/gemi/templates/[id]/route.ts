import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if ('label' in body) data.label = body.label
  if ('description' in body) data.description = body.description
  if ('subject' in body) data.subject = body.subject
  if ('htmlContent' in body) data.htmlContent = body.htmlContent
  if ('active' in body) data.active = body.active
  const template = await prisma.gemiEmailTemplate.update({ where: { id }, data })
  return NextResponse.json(template)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  await prisma.gemiEmailTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
