import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const commission = await prisma.commission.findUnique({ where: { id: params.id } })
  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (commission.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Only APPROVED commissions can be marked as paid' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { externalInvoiceId, externalInvoiceNo, externalInvoiceUrl, notes } = body

  const updated = await prisma.commission.update({
    where: { id: params.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      ...(externalInvoiceId && { externalInvoiceId }),
      ...(externalInvoiceNo && { externalInvoiceNo }),
      ...(externalInvoiceUrl && { externalInvoiceUrl }),
      ...(notes && { notes }),
    },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
    },
  })

  return NextResponse.json(updated)
}
