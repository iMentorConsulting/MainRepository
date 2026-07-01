import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'
import { sendEmail } from '@/lib/email'

// Inbound API for the Finance app's daily payment batch.
// Auth: header `x-api-key` must match env FINANCE_APP_API_KEY.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.FINANCE_APP_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

const AUTO_TAG_SERVICES = ['ΕΞΩΔΙΚΑΣΤΙΚΟΣ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']

function applySoleProprietorFix(gsisData: any) {
  let onomasia = gsisData?.onomasia || ''
  let legalStatusDescr = gsisData?.legalStatusDescr || ''
  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) onomasia = parts.slice(0, 2).join(' ')
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }
  return { onomasia: onomasia || null, legalStatusDescr: legalStatusDescr || null }
}

// Automatically creates businesses for all unmatched NEW PENDING payments,
// then syncs iMentorServices for all matched businesses.
// Runs fire-and-forget after ingestion completes.
async function autoCreateAndSync(newPaymentIds: string[]) {
  if (newPaymentIds.length === 0) return

  // 1. Mass-create businesses for unmatched payments
  const unmatched = await prisma.financePayment.findMany({
    where: { id: { in: newPaymentIds }, businessId: null, status: 'PENDING' },
  })

  for (const payment of unmatched) {
    const existing = await prisma.business.findUnique({ where: { afm: payment.afm }, select: { id: true } })
    if (existing) {
      await prisma.financePayment.update({ where: { id: payment.id }, data: { businessId: existing.id } })
      continue
    }

    let gsisData: any = null
    try { gsisData = await lookupAfm(payment.afm) } catch { gsisData = null }

    const fix = gsisData ? applySoleProprietorFix(gsisData) : null
    const autoTag = AUTO_TAG_SERVICES.some(s => payment.serviceName.toUpperCase().includes(s)) ? [payment.serviceName] : []

    const business = await prisma.business.create({
      data: {
        afm: payment.afm,
        email: payment.email || null,
        phone: payment.phone || null,
        source: 'finance-import',
        legalStatusDescr: fix?.legalStatusDescr ?? (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
        onomasia: fix?.onomasia ?? gsisData?.onomasia ?? payment.onomasia ?? null,
        commercialTitle: gsisData?.commercialTitle ?? null,
        regdate: gsisData?.regdate ?? null,
        postalAddress: gsisData?.postalAddress ?? null,
        postalAddressNo: gsisData?.postalAddressNo ?? null,
        postalZipCode: gsisData?.postalZipCode ?? null,
        postalAreaDescription: gsisData?.postalAreaDescription ?? null,
        doy: gsisData?.doy ?? null,
        doyDescr: gsisData?.doyDescr ?? null,
        tags: autoTag,
        iMentorServices: [payment.serviceName],
        activities: gsisData?.activities?.length ? {
          create: gsisData.activities.map((a: any) => ({
            firmActCode: a.firmActCode,
            firmActDescr: a.firmActDescr,
            firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
            firmActKindDescr: a.firmActKindDescr,
          }))
        } : undefined,
      },
    })
    await prisma.financePayment.update({ where: { id: payment.id }, data: { businessId: business.id } })
    runMatchingForBusiness(business.id).catch(() => {})
  }

  // 2. Sync iMentorServices for all businesses linked to new payments
  const allNewPayments = await prisma.financePayment.findMany({
    where: { id: { in: newPaymentIds }, businessId: { not: null } },
    select: { businessId: true, serviceName: true },
  })

  const servicesByBusiness = new Map<string, Set<string>>()
  for (const p of allNewPayments) {
    if (!p.businessId) continue
    if (!servicesByBusiness.has(p.businessId)) servicesByBusiness.set(p.businessId, new Set())
    servicesByBusiness.get(p.businessId)!.add(p.serviceName)
  }

  for (const [businessId, newServices] of Array.from(servicesByBusiness)) {
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { iMentorServices: true } })
    if (!biz) continue
    const merged = Array.from(new Set([...biz.iMentorServices, ...Array.from(newServices)]))
    if (merged.length !== biz.iMentorServices.length) {
      await prisma.business.update({ where: { id: businessId }, data: { iMentorServices: merged } })
    }
  }
}

async function sendAdminNotification(commissionCount: number) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'info@i-mentor.gr'
  if (commissionCount === 0) return // no commissions to approve — no email
  await sendEmail({
    to: adminEmail,
    subject: `💶 ${commissionCount} νέες προμήθειες προς έγκριση — I-MENTOR Portal`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">📋 Νέες Πληρωμές Finance</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px;">
            Υπάρχουν <strong style="color: #4f46e5;">${commissionCount} νέες πληρωμές</strong> με αντιστοιχισμένο λογιστή που περιμένουν έγκριση προμήθειας.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/commissions/finance-payments"
               style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
              Έλεγχος & Έγκριση &rarr;
            </a>
          </div>
        </div>
      </div>
    `,
  }).catch(() => {})
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
  let newCount = 0
  const newPaymentIds: string[] = []
  const errors: { externalId: string; error: string }[] = []

  for (const p of payments) {
    const { externalId, afm, onomasia, amount, invoiceNumber, service, category, paymentDate, accountant, email, tel, phone } = p || {}
    if (!externalId || !afm || amount == null || !service || !category || !paymentDate) {
      errors.push({ externalId: externalId || '(missing)', error: 'externalId, afm, amount, service, category, paymentDate are required' })
      continue
    }

    const business = await prisma.business.findUnique({ where: { afm: String(afm) }, select: { id: true } })
    if (business) matched++
    else unmatched++

    const existing = await prisma.financePayment.findUnique({ where: { externalId: String(externalId) }, select: { id: true } })
    const isNew = !existing

    const result = await prisma.financePayment.upsert({
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
        email: email || null,
        phone: tel || phone || null,
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
        email: email || null,
        phone: tel || phone || null,
        businessId: business?.id || null,
      },
    })
    received++
    if (isNew) {
      newCount++
      newPaymentIds.push(result.id)
    }
  }

  await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: { financeCronLastRunAt: new Date(), financeCronLastError: errors.length ? `${errors.length} σφάλματα` : null },
    create: { id: 'main', financeCronLastRunAt: new Date(), financeCronLastError: errors.length ? `${errors.length} σφάλματα` : null },
  }).catch(() => {})

  // Auto-create businesses + sync services, then notify admin only if commissions are waiting
  ;(async () => {
    await autoCreateAndSync(newPaymentIds).catch(() => {})
    if (newPaymentIds.length === 0) return
    // Count new PENDING payments that have a business with an accountant = commissions to approve
    const commissionCount = await prisma.financePayment.count({
      where: {
        id: { in: newPaymentIds },
        status: 'PENDING',
        business: { accountantId: { not: null } },
      },
    })
    await sendAdminNotification(commissionCount).catch(() => {})
  })()

  return NextResponse.json({ received, matched, unmatched, newCount, errors })
}
