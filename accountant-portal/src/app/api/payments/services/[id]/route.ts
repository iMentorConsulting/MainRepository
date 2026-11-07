import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await prisma.service.findUnique({ where: { id: params.id } })
  if (!service) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(service)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const service = await prisma.service.update({
    where: { id: params.id },
    data: {
      name: body.name,
      description: body.description ?? null,
      price: body.price !== undefined ? Math.round(parseFloat(body.price) * 100) : undefined,
      currency: body.currency,
      active: body.active,
    },
  })
  return NextResponse.json(service)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft delete: deactivate instead of delete if there are existing payment requests
  const existingRequests = await prisma.paymentRequest.count({ where: { serviceId: params.id } })
  if (existingRequests > 0) {
    const service = await prisma.service.update({
      where: { id: params.id },
      data: { active: false },
    })
    return NextResponse.json(service)
  }

  await prisma.service.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
