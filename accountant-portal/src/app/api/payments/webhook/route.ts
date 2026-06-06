import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// Disable body parser — Stripe needs the raw body for signature verification
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid') {
        await prisma.paymentRequest.updateMany({
          where: { stripeSessionId: session.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
        console.log(`Payment marked as PAID for Stripe session: ${session.id}`)
      }
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      await prisma.paymentRequest.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'PAID', paidAt: new Date() },
      })
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      await prisma.paymentRequest.updateMany({
        where: { stripeSessionId: session.id, status: { in: ['PENDING', 'SENT'] } },
        data: { status: 'EXPIRED' },
      })
      console.log(`Payment marked as EXPIRED for Stripe session: ${session.id}`)
    }
  } catch (err) {
    console.error('Error processing Stripe webhook event:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
