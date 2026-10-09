import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pr = await prisma.paymentRequest.findUnique({
    where: { id: params.id },
    include: {
      business: { select: { id: true, onomasia: true, afm: true, email: true, phone: true } },
      accountant: { select: { id: true, officeName: true, contactPerson: true, phone: true } },
      service: true,
      program: { select: { id: true, title: true } },
    },
  })

  if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountants can only see their own payment requests
  if (session.user.role === 'ACCOUNTANT' && pr.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(pr)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pr = await prisma.paymentRequest.findUnique({ where: { id: params.id } })
  if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountants can only update their own payment requests
  if (session.user.role === 'ACCOUNTANT' && pr.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Only allow cancellation via this endpoint (status changes like PAID come via webhook)
  if (body.status && body.status !== 'CANCELLED') {
    return NextResponse.json({ error: 'Only CANCELLED status can be set manually' }, { status: 400 })
  }

  const updated = await prisma.paymentRequest.update({
    where: { id: params.id },
    data: {
      status: body.status || undefined,
      description: body.description !== undefined ? body.description : undefined,
    },
    include: {
      business: { select: { id: true, onomasia: true, afm: true, email: true } },
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      service: true,
      program: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json(updated)
}
