import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateIrisReference, createIrisPayment } from '@/lib/iris'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const accountantId = searchParams.get('accountantId')

  const where: any = {}
  if (session.user.role === 'ACCOUNTANT') {
    where.accountantId = session.user.accountantId
  } else if (accountantId) {
    where.accountantId = accountantId
  }
  if (status) where.status = status

  const requests = await prisma.paymentRequest.findMany({
    where,
    include: {
      business: { select: { id: true, onomasia: true, afm: true, email: true } },
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      service: true,
      program: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { businessId, serviceId, programId, description, customAmount } = body

  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const accountantId =
    session.user.role === 'ACCOUNTANT'
      ? session.user.accountantId!
      : body.accountantId || business.accountantId

  if (!accountantId) return NextResponse.json({ error: 'Accountant required' }, { status: 400 })

  const amount =
    customAmount && session.user.role === 'ADMIN'
      ? Math.round(parseFloat(customAmount) * 100)
      : service.price

  // Generate IRIS payment data
  const reference = generateIrisReference(process.env.IRIS_REFERENCE_PREFIX || 'IMENT')
  const irisData = createIrisPayment({
    iban: process.env.IRIS_IBAN || '',
    merchantName: process.env.IRIS_MERCHANT_NAME || 'I-MENTOR',
    amount,
    reference,
    description: description || service.name,
  })

  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      businessId,
      accountantId,
      serviceId,
      programId: programId || null,
      amount,
      currency: 'EUR',
      description: description || null,
      irisReference: reference,
      irisLink: irisData.irisLink,
      irisQrData: irisData.qrData,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdBy: session.user.id,
    },
    include: {
      business: true,
      accountant: true,
      service: true,
      program: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json({ ...paymentRequest, irisData }, { status: 201 })
}
