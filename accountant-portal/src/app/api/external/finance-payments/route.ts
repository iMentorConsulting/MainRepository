import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Inbound API for the Finance app's daily payment batch.
// Auth: header `x-api-key` must match env FINANCE_APP_API_KEY.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.FINANCE_APP_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

// POST /api/external/finance-payments
// Body: { payments: [{ externalId, afm, onomasia?, amount, invoiceNumber?, service, category, paymentDate, accountant? }] }
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const payments = Array.isArray(body?.payments) ? body.payments : null
  if (!payments) return NextResponse.json({ error: 'payments array is required' }, { status: 400 })

  let received = 0
  let matched = 0
  let unmatched = 0
  const errors: { externalId: string; error: string }[] = []

  for (const p of payments) {
    const { externalId, afm, onomasia, amount, invoiceNumber, service, category, paymentDate, accountant } = p || {}
    if (!externalId || !afm || amount == null || !service || !category || !paymentDate) {
      errors.push({ externalId: externalId || '(missing)', error: 'externalId, afm, amount, service, category, paymentDate are required' })
      continue
    }

    const business = await prisma.business.findUnique({ where: { afm: String(afm) }, select: { id: true } })
    if (business) matched++
    else unmatched++

    await prisma.financePayment.upsert({
      where: { externalId: String(externalId) },
      update: {
        afm: String(afm),
        onomasia: onomasia || null,
        amount: Math.round(Number(amount)),
        invoiceNumber: invoiceNumber || null,
        serviceName: String(service),
        category: String(category),
        paymentDate: new Date(paymentDate),
        financeAccountant: accountant || null,
        businessId: business?.id || null,
      },
      create: {
        externalId: String(externalId),
        afm: String(afm),
        onomasia: onomasia || null,
        amount: Math.round(Number(amount)),
        invoiceNumber: invoiceNumber || null,
        serviceName: String(service),
        category: String(category),
        paymentDate: new Date(paymentDate),
        financeAccountant: accountant || null,
        businessId: business?.id || null,
      },
    })
    received++
  }

  await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: { financeCronLastRunAt: new Date(), financeCronLastError: errors.length ? `${errors.length} σφάλματα` : null },
    create: { id: 'main', financeCronLastRunAt: new Date(), financeCronLastError: errors.length ? `${errors.length} σφάλματα` : null },
  }).catch(() => {})

  return NextResponse.json({ received, matched, unmatched, errors })
}
