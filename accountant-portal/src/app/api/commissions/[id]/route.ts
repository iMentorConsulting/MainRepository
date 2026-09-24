import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const commission = await prisma.commission.findUnique({
    where: { id: params.id },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
      business: { select: { id: true, onomasia: true, afm: true, email: true } },
      paymentRequest: {
        include: {
          service: { select: { id: true, name: true } },
          program: { select: { id: true, title: true } },
        },
      },
    },
  })

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountants can only view their own commissions
  if (session.user.role === 'ACCOUNTANT' && commission.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(commission)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { status, notes, externalInvoiceId, externalInvoiceNo, externalInvoiceUrl } = body

  const commission = await prisma.commission.findUnique({ where: { id: params.id } })
  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updateData: any = {}

  if (status) {
    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['PAID', 'CANCELLED'],
      PAID: [],
      CANCELLED: [],
    }
    if (!validTransitions[commission.status]?.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${commission.status} to ${status}` },
        { status: 400 }
      )
    }
    updateData.status = status
    if (status === 'APPROVED') {
      updateData.approvedAt = new Date()
      updateData.approvedBy = session.user.id
    }
    if (status === 'PAID') {
      updateData.paidAt = new Date()
    }
    if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date()
    }
  }

  if (notes !== undefined) updateData.notes = notes
  if (externalInvoiceId !== undefined) updateData.externalInvoiceId = externalInvoiceId
  if (externalInvoiceNo !== undefined) updateData.externalInvoiceNo = externalInvoiceNo
  if (externalInvoiceUrl !== undefined) updateData.externalInvoiceUrl = externalInvoiceUrl

  const updated = await prisma.commission.update({
    where: { id: params.id },
    data: updateData,
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
      paymentRequest: {
        include: { service: { select: { id: true, name: true } } },
      },
    },
  })

  return NextResponse.json(updated)
}
