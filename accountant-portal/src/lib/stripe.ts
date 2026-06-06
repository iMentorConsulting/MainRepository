import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
})

export async function createCheckoutSession({
  paymentRequestId,
  serviceName,
  description,
  amount,
  currency,
  customerEmail,
  customerName,
  metadata,
}: {
  paymentRequestId: string
  serviceName: string
  description?: string
  amount: number
  currency: string
  customerEmail?: string
  customerName?: string
  metadata?: Record<string, string>
}) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'sepa_debit'],
    mode: 'payment',
    customer_email: customerEmail || undefined,
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: serviceName,
            description: description || undefined,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      paymentRequestId,
      ...metadata,
    },
    success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    locale: 'el',
  })

  return session
}
