import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCheckoutSession } from '@/lib/stripe'

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

  // Get service
  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  // Get business
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Determine accountantId
  const accountantId =
    session.user.role === 'ACCOUNTANT'
      ? session.user.accountantId!
      : body.accountantId || business.accountantId

  if (!accountantId) return NextResponse.json({ error: 'Accountant required' }, { status: 400 })

  const amount =
    customAmount && session.user.role === 'ADMIN'
      ? Math.round(parseFloat(customAmount) * 100)
      : service.price

  // Create Stripe session
  const stripeSession = await createCheckoutSession({
    paymentRequestId: 'temp', // will update after DB insert
    serviceName: service.name,
    description: description || service.description || undefined,
    amount,
    currency: service.currency,
    customerEmail: business.email || undefined,
    customerName: business.onomasia || undefined,
    metadata: { businessId, accountantId, serviceId },
  })

  // Create payment request
  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      businessId,
      accountantId,
      serviceId,
      programId: programId || null,
      amount,
      currency: service.currency,
      description: description || null,
      stripeSessionId: stripeSession.id,
      stripePaymentLink: stripeSession.url,
      status: 'PENDING',
      expiresAt: new Date(stripeSession.expires_at * 1000),
      createdBy: session.user.id,
    },
    include: {
      business: true,
      accountant: true,
      service: true,
      program: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json(paymentRequest, { status: 201 })
}
