import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeProjections } from '@/lib/microcredits-business-plan'
import { buildMicrocreditsBusinessPlanDocx } from '@/lib/microcredits-business-plan-docx'
import { resolveRegionFromZip } from '@/lib/greek-regions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const planId = request.nextUrl.searchParams.get('planId')
  if (!planId) return NextResponse.json({ error: 'Λείπει το plan' }, { status: 400 })

  const plan = await prisma.microcreditsBusinessPlan.findUnique({ where: { id: planId } })
  if (!plan || plan.businessId !== params.id) return NextResponse.json({ error: 'Δεν βρέθηκε το business plan' }, { status: 404 })

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const questionnaire = plan.questionnaireId
    ? await prisma.microcreditsQuestionnaire.findUnique({ where: { id: plan.questionnaireId } })
    : null

  const allKad = business.activities.map(a => ({ code: a.firmActCode, description: a.firmActDescr || '' }))
  const selectedCodes = questionnaire?.selectedKadCodes || []
  const kadInvestment = allKad.filter(k => selectedCodes.includes(k.code))

  const projections = computeProjections({
    currentRevenue: plan.currentRevenue,
    currentEbitda: plan.currentEbitda,
    currentNetProfit: plan.currentNetProfit,
    annualGrowthPct: plan.annualGrowthPct,
  })

  let buffer: Buffer
  try {
    buffer = await buildMicrocreditsBusinessPlanDocx({
      companyName: business.onomasia || business.afm,
      tradeName: business.commercialTitle,
      afm: business.afm,
      legalRep: plan.legalRepresentative,
      legalForm: business.legalStatusDescr,
      kadList: allKad,
      kadInvestment: kadInvestment.length > 0 ? kadInvestment : allKad,
      foundingDate: business.regdate,
      doy: business.doyDescr,
      street: business.postalAddress,
      streetNo: business.postalAddressNo,
      zip: business.postalZipCode,
      county: business.postalAreaDescription,
      region: resolveRegionFromZip(business.postalZipCode),
      phone: business.phone,
      email: business.email,
      section1_1: plan.section1_1,
      section2_1: plan.section2_1,
      section2_2: plan.section2_2,
      revenue: projections.revenue,
      ebitda: projections.ebitda,
      netProfit: projections.netProfit,
      marginPct: projections.marginPct,
      date: new Date().toLocaleDateString('el-GR'),
    })
  } catch (err: any) {
    console.error('[Microcredits business plan] docx generation failed:', err?.message)
    return NextResponse.json({ error: 'Η δημιουργία του εγγράφου απέτυχε.' }, { status: 500 })
  }

  const rawName = business.onomasia || business.afm
  const asciiName = rawName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'business_plan'
  const utf8Name = encodeURIComponent(`BusinessPlan_${rawName}`.slice(0, 80))
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="BusinessPlan_${asciiName}.docx"; filename*=UTF-8''${utf8Name}.docx`,
    },
  })
}
