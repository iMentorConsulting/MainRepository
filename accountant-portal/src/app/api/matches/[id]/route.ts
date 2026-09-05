import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.programMatch.findUnique({ where: { id: params.id }, select: { business: { select: { accountantId: true } } } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && existing.business.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status, notes } = await request.json()

  const updateData: any = { updatedAt: new Date() }
  if (status !== undefined) updateData.status = status
  if (notes !== undefined) updateData.notes = notes

  const match = await prisma.programMatch.update({
    where: { id: params.id },
    data: updateData,
  })

  return NextResponse.json(match)
}
