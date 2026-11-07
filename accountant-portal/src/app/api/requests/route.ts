import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  }

  const requests = await prisma.imentorRequest.findMany({
    where,
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ACCOUNTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!session.user.accountantId) {
    return NextResponse.json({ error: 'No accountant profile' }, { status: 400 })
  }

  const { businessId, programId, subject, message } = await request.json()

  const req = await prisma.imentorRequest.create({
    data: {
      accountantId: session.user.accountantId,
      businessId,
      programId: programId || null,
      subject,
      message,
      status: 'NEW',
    },
    include: {
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
    }
  })

  return NextResponse.json(req, { status: 201 })
}
