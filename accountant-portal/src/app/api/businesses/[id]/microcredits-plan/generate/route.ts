import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateBusinessPlanSections, computeProjections, buildTimelineSentence, buildExpenseBreakdownParagraphs, type QuestionnaireQuestion, type ExpenseBreakdown, type FixedAssetItem } from '@/lib/microcredits-business-plan'

export const dynamic = 'force-dynamic'

const MAX_FIXED_ASSETS_PCT = 0.4

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })

  const plan = await prisma.microcreditsBusinessPlan.findFirst({
    where: { businessId: params.id, programId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ plan })
}

// Step 2 of the ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ business-plan flow: once the client has
// answered the questionnaire, the consultant supplies the financial inputs
// that only the accountant has (current turnover/EBITDA/net profit, the
// loan amount and its working-capital/fixed-assets split, an annual growth
// assumption) and an AI draft of the three narrative sections is generated
// for review. Nothing here is final — the consultant reviews/edits before
// downloading the .docx.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const {
    programId, questionnaireId,
    currentRevenue, currentEbitda, currentNetProfit, annualGrowthPct,
    loanAmount, workingCapitalAmount, fixedAssetsAmount,
    legalRepresentative, consultantNotes, owners,
    operatingExpenseBreakdown, fixedAssetItems, implementationMonths,
  } = body

  const breakdown: ExpenseBreakdown = {
    emporeumata: Number(operatingExpenseBreakdown?.emporeumata) || 0,
    analosima: Number(operatingExpenseBreakdown?.analosima) || 0,
    deko: Number(operatingExpenseBreakdown?.deko) || 0,
    enoikia: Number(operatingExpenseBreakdown?.enoikia) || 0,
    loipa: Number(operatingExpenseBreakdown?.loipa) || 0,
  }
  const assetItems: FixedAssetItem[] = Array.isArray(fixedAssetItems)
    ? fixedAssetItems.filter((i: any) => i?.description && Number(i.amount) > 0).map((i: any) => ({ description: String(i.description), amount: Number(i.amount) }))
    : []
  const months = Number.isFinite(Number(implementationMonths)) && Number(implementationMonths) > 0 ? Number(implementationMonths) : 24

  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const nums = { currentRevenue, currentEbitda, currentNetProfit, annualGrowthPct, loanAmount, workingCapitalAmount, fixedAssetsAmount }
  for (const [key, value] of Object.entries(nums)) {
    if (!Number.isFinite(Number(value))) {
      return NextResponse.json({ error: `Μη έγκυρη τιμή για το πεδίο ${key}` }, { status: 400 })
    }
  }

  const loanAmountNum = Number(loanAmount)
  const workingCapitalNum = Number(workingCapitalAmount)
  const fixedAssetsNum = Number(fixedAssetsAmount)

  if (Math.abs(workingCapitalNum + fixedAssetsNum - loanAmountNum) > 1) {
    return NextResponse.json({ error: 'Το κεφάλαιο κίνησης + τα πάγια πρέπει να ισούνται με το συνολικό ποσό δανείου' }, { status: 400 })
  }
  if (loanAmountNum > 0 && fixedAssetsNum / loanAmountNum > MAX_FIXED_ASSETS_PCT + 0.001) {
    return NextResponse.json({ error: `Τα πάγια δεν μπορούν να υπερβαίνουν το ${MAX_FIXED_ASSETS_PCT * 100}% του συνολικού δανείου` }, { status: 400 })
  }

  const breakdownTotal = breakdown.emporeumata + breakdown.analosima + breakdown.deko + breakdown.enoikia + breakdown.loipa
  if (workingCapitalNum > 0 && breakdownTotal > 0 && Math.abs(breakdownTotal - workingCapitalNum) > 1) {
    return NextResponse.json({ error: 'Η ανάλυση λειτουργικών δαπανών πρέπει να ισούται με το κεφάλαιο κίνησης' }, { status: 400 })
  }
  const assetItemsTotal = assetItems.reduce((sum, i) => sum + i.amount, 0)
  if (fixedAssetsNum > 0 && assetItemsTotal > 0 && Math.abs(assetItemsTotal - fixedAssetsNum) > 1) {
    return NextResponse.json({ error: 'Η ανάλυση παγίων πρέπει να ισούται με το ποσό παγίων' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  let questionnaire = null
  if (typeof questionnaireId === 'string' && questionnaireId) {
    questionnaire = await prisma.microcreditsQuestionnaire.findUnique({ where: { id: questionnaireId } })
  }

  const selectedKad = (questionnaire?.selectedKadCodes || [])
    .map(code => business.activities.find(a => a.firmActCode === code))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map(a => ({ code: a.firmActCode, description: a.firmActDescr || '' }))

  const questions = (questionnaire?.questions as unknown as QuestionnaireQuestion[]) || []
  const answers = (questionnaire?.answers as Record<string, string>) || {}

  let sections
  try {
    sections = await generateBusinessPlanSections({
      businessName: business.onomasia || business.afm,
      legalForm: business.legalStatusDescr,
      foundingDate: business.regdate,
      selectedKad,
      activityNote: questionnaire?.activityNote,
      questions,
      answers,
      currentRevenue: Number(currentRevenue),
      currentEbitda: Number(currentEbitda),
      currentNetProfit: Number(currentNetProfit),
      loanAmount: loanAmountNum,
      workingCapitalAmount: workingCapitalNum,
      fixedAssetsAmount: fixedAssetsNum,
      operatingExpenseBreakdown: breakdownTotal > 0 ? breakdown : null,
      fixedAssetItems: assetItems.length > 0 ? assetItems : null,
      consultantNotes: consultantNotes || null,
    })
  } catch (err: any) {
    console.error('[Microcredits business plan] AI generation failed:', err?.message)
    return NextResponse.json({ error: 'Η δημιουργία του επιχειρηματικού σχεδίου απέτυχε.' }, { status: 500 })
  }

  // Ε. Χρονοδιάγραμμα (2.1) and the whole of section 2.2 (ΠΙΝΑΚΑΣ ΔΑΠΑΝΩΝ)
  // are built deterministically from the exact figures above, not by the AI.
  const section2_1 = [...sections.section2_1, buildTimelineSentence(months)]
  const section2_2 = buildExpenseBreakdownParagraphs({
    loanAmount: loanAmountNum,
    workingCapitalAmount: workingCapitalNum,
    fixedAssetsAmount: fixedAssetsNum,
    breakdown,
    fixedAssetItems: assetItems,
  })

  const plan = await prisma.microcreditsBusinessPlan.create({
    data: {
      businessId: business.id,
      programId,
      questionnaireId: questionnaire?.id || null,
      currentRevenue: Number(currentRevenue),
      currentEbitda: Number(currentEbitda),
      currentNetProfit: Number(currentNetProfit),
      annualGrowthPct: Number(annualGrowthPct),
      loanAmount: loanAmountNum,
      workingCapitalAmount: workingCapitalNum,
      fixedAssetsAmount: fixedAssetsNum,
      legalRepresentative: legalRepresentative || null,
      consultantNotes: consultantNotes || null,
      owners: Array.isArray(owners) ? owners : undefined,
      operatingExpenseBreakdown: breakdownTotal > 0 ? (breakdown as any) : undefined,
      fixedAssetItems: assetItems.length > 0 ? (assetItems as any) : undefined,
      implementationMonths: months,
      section1_1: sections.section1_1,
      section2_1,
      section2_2,
      generatedAt: new Date(),
    },
  })

  return NextResponse.json({ plan })
}
