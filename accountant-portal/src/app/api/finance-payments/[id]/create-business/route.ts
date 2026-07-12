import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'

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

// POST /api/finance-payments/[id]/create-business
// Auto-creates a Business from a FinancePayment row:
// 1. AADE lookup via lookupAfm()
// 2. If found: create with full AADE data + email/phone from payment
// 3. If not found: create as ΙΔΙΩΤΗΣ
// 4. Auto-tags service name for ΕΞΩΔΙΚΑΣΤΙΚΟΣ/ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ
// 5. Links FinancePayment.businessId back to the new business
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payment = await prisma.financePayment.findUnique({ where: { id: params.id } })
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (payment.businessId) return NextResponse.json({ error: 'Η επιχείρηση έχει ήδη αντιστοιχιστεί' }, { status: 400 })

  // Check if business already exists (created by someone else in the meantime)
  const existing = await prisma.business.findUnique({ where: { afm: payment.afm } })
  if (existing) {
    await prisma.financePayment.update({ where: { id: params.id }, data: { businessId: existing.id } })
    if ((!existing.email && payment.email) || (!existing.phone && payment.phone)) {
      await prisma.business.update({
        where: { id: existing.id },
        data: {
          ...(!existing.email && payment.email ? { email: payment.email } : {}),
          ...(!existing.phone && payment.phone ? { phone: payment.phone } : {}),
        },
      })
    }
    return NextResponse.json({ businessId: existing.id, created: false })
  }

  // AADE lookup
  let gsisData: any = null
  try {
    gsisData = await lookupAfm(payment.afm)
  } catch {
    gsisData = null
  }

  const fix = gsisData ? applySoleProprietorFix(gsisData) : null
  const autoTag = AUTO_TAG_SERVICES.some(s => payment.serviceName.toUpperCase().includes(s))
    ? [payment.serviceName] : []

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

  await prisma.financePayment.update({ where: { id: params.id }, data: { businessId: business.id } })

  runMatchingForBusiness(business.id).catch(() => {})

  return NextResponse.json({ businessId: business.id, created: true, fromAade: !!gsisData })
}
