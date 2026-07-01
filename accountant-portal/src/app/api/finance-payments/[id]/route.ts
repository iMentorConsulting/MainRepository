import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateCommission, formatEuros } from '@/lib/commission'
import { sendEmail } from '@/lib/email'
import { findApplicablePolicy } from '@/lib/finance-payments'

// PUT /api/finance-payments/[id] — Body: { action: 'approve' | 'reject' | 'defer', notes? }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action, notes } = await req.json()
  if (!['approve', 'reject', 'defer', 'rematch', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve, reject, defer, rematch or reset' }, { status: 400 })
  }

  const payment = await prisma.financePayment.findUnique({
    where: { id: params.id },
    include: { business: { include: { accountant: true } } },
  })
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reset') {
    const updated = await prisma.financePayment.update({
      where: { id: params.id },
      data: {
        status: 'PENDING',
        commissionId: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
      },
    })
    return NextResponse.json(updated)
  }

  if (action === 'rematch') {
    const business = await prisma.business.findUnique({ where: { afm: payment.afm }, select: { id: true } })
    const updated = await prisma.financePayment.update({
      where: { id: params.id },
      data: { businessId: business?.id || null },
      include: { business: { select: { id: true, afm: true, onomasia: true, accountantId: true, accountant: { select: { officeName: true } } } } },
    })
    return NextResponse.json(updated)
  }

  if (payment.status !== 'PENDING') {
    return NextResponse.json({ error: 'Only PENDING payments can be reviewed' }, { status: 400 })
  }

  if (action === 'reject' || action === 'defer') {
    const updated = await prisma.financePayment.update({
      where: { id: params.id },
      data: {
        status: action === 'reject' ? 'REJECTED' : 'DEFERRED',
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
      },
    })
    return NextResponse.json(updated)
  }

  // action === 'approve'
  const business = payment.business
  if (!business) return NextResponse.json({ error: 'Δεν υπάρχει συνδεδεμένη επιχείρηση για αυτή την πληρωμή' }, { status: 400 })
  if (!business.accountantId || !business.accountant) {
    return NextResponse.json({ error: 'Δεν υπάρχει λογιστής για αυτή την επιχείρηση' }, { status: 400 })
  }

  const stage = payment.category.includes('ΥΛΟΠΟΙΗΣΗ') ? 'IMPLEMENTATION' : 'APPLICATION'
  const policy = await findApplicablePolicy(payment.serviceName, stage)

  if (!policy) {
    return NextResponse.json({
      error: `Δεν βρέθηκε πολιτική προμηθειών για την υπηρεσία "${payment.serviceName}" (${stage === 'APPLICATION' ? 'ΑΙΤΗΣΗ' : 'ΥΛΟΠΟΙΗΣΗ'}). Ορίστε πρώτα πολιτική στις Πολιτικές Προμηθειών.`,
    }, { status: 422 })
  }

  let commissionAmount = 0
  let commissionRate: number | null = null
  if (policy) {
    const override = await prisma.accountantCommissionOverride.findUnique({
      where: { accountantId_commissionPolicyId: { accountantId: business.accountantId, commissionPolicyId: policy.id } },
    })
    const calc = calculateCommission(payment.amount, policy, override)
    commissionAmount = calc.commissionAmount
    commissionRate = calc.commissionRate
  }

  // Add service to business's iMentorServices list (deduplicated)
  await prisma.business.update({
    where: { id: business.id },
    data: {
      iMentorServices: { set: Array.from(new Set([...business.iMentorServices, payment.serviceName])) },
    },
  })

  const commission = await prisma.commission.create({
    data: {
      accountantId: business.accountantId,
      businessId: business.id,
      commissionPolicyId: policy?.id || null,
      stage,
      grossAmount: payment.amount,
      commissionRate,
      commissionAmount,
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: session.user.id,
      notes: `Από πληρωμή Finance app (${payment.category}, ${payment.invoiceNumber || payment.externalId})`,
    },
  })

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const emailsEnabled = appSetting?.financeCommissionEmailsEnabled === true

  let emailSkippedNote = ''
  if (emailsEnabled && business.accountant.email) {
    await sendEmail({
      to: business.accountant.email,
      subject: `💶 Νέα προμήθεια εγκρίθηκε — I-MENTOR Portal`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">💶 Εγκρίθηκε νέα προμήθεια</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 16px;">Αγαπητέ/ή <strong>${business.accountant.contactPerson}</strong>,</p>
            <p style="color: #374151; font-size: 16px;">
              Εγκρίθηκε προμήθεια <strong style="color: #4f46e5;">${formatEuros(commissionAmount)}</strong>
              για τον πελάτη <strong>${business.onomasia || business.afm}</strong>.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/commissions"
                 style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                Δείτε τις Προμήθειες &rarr;
              </a>
            </div>
          </div>
        </div>
      `,
    }).catch(() => {})
    await prisma.notification.create({
      data: {
        accountantId: business.accountantId,
        type: 'COMMISSION_APPROVED',
        title: `Εγκρίθηκε προμήθεια ${formatEuros(commissionAmount)}`,
        body: `Για τον πελάτη ${business.onomasia || business.afm}`,
        link: '/commissions',
      },
    })
  } else if (!emailsEnabled) {
    emailSkippedNote = ' [email skipped — notifications disabled]'
  }

  const updated = await prisma.financePayment.update({
    where: { id: params.id },
    data: {
      status: 'APPROVED',
      commissionId: commission.id,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNotes: (notes || '') + emailSkippedNote,
    },
    include: { commission: true },
  })

  return NextResponse.json(updated)
}
