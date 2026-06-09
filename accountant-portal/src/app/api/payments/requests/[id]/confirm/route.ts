import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { bankReference } = body

  const updated = await prisma.paymentRequest.update({
    where: { id: params.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      confirmedBy: session.user.id,
      bankReference: bankReference || null,
    },
  })

  return NextResponse.json(updated)
}
