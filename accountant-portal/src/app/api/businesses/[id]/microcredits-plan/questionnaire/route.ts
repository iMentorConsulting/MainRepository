import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isKadCodeEligible } from '@/lib/kad-matching'
import { sendEmail } from '@/lib/email'
import { buildQuestionnaireEmailHtml } from '@/lib/microcredits-business-plan'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'

// ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ business-plan flow, step 1: the consultant picks
// which of the business's own ΚΑΔ the application is actually about (a
// business can match the program on multiple ΚΑΔ, but the questionnaire —
// and later the business plan's own "ΚΑΔ Επένδυσης" field — must be
// tailored to only the one(s) that genuinely apply), optionally overriding
// the official ΚΑΔ description with a short note when it doesn't match
// reality. An AI-tailored questionnaire is generated and emailed to the
// client via a public token link.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })

  const questionnaire = await prisma.microcreditsQuestionnaire.findFirst({
    where: { businessId: params.id, programId },
    orderBy: { createdAt: 'desc' },
  })

  // The ΚΑΔ picker in the UI must only offer ΚΑΔ that are actually eligible
  // for THIS program — a business can have activities that matched some
  // other program but not this one (or are excluded here specifically), and
  // tailoring the questionnaire/business-plan's "ΚΑΔ Επένδυσης" to an
  // ineligible one would be wrong.
  const program = await prisma.program.findUnique({ where: { id: programId } })
  const business = program
    ? await prisma.business.findUnique({ where: { id: params.id }, include: { activities: true } })
    : null
  const eligibleActivities = (business?.activities || []).filter(a => program && isKadCodeEligible(a.firmActCode, program))

  return NextResponse.json({
    questionnaire,
    eligibleActivities: eligibleActivities.map(a => ({ firmActCode: a.firmActCode, firmActDescr: a.firmActDescr })),
  })
}

// Admin-only: deletes the questionnaire (and any business plan drafts built
// from it) so the flow can be re-tested or genuinely restarted from
// scratch — e.g. the consultant wants to redo it with different ΚΑΔ, or
// it was sent by mistake during testing.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })

  await prisma.microcreditsBusinessPlan.deleteMany({
    where: { businessId: params.id, programId },
  })
  await prisma.microcreditsQuestionnaire.deleteMany({
    where: { businessId: params.id, programId },
  })

  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, selectedKadCodes, activityNote, questions } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  if (!Array.isArray(selectedKadCodes) || selectedKadCodes.length === 0) {
    return NextResponse.json({ error: 'Επιλέξτε τουλάχιστον έναν ΚΑΔ' }, { status: 400 })
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'Λείπουν οι ερωτήσεις — κάντε πρώτα προεπισκόπηση' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })
  if (!business.email) return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  const eligibleSelectedCodes = selectedKadCodes.filter((code: string) =>
    business.activities.some(a => a.firmActCode === code) && isKadCodeEligible(code, program)
  )
  if (eligibleSelectedCodes.length === 0) {
    return NextResponse.json({ error: 'Οι επιλεγμένοι ΚΑΔ δεν είναι επιλέξιμοι για αυτό το πρόγραμμα' }, { status: 400 })
  }

  const questionnaire = await prisma.microcreditsQuestionnaire.create({
    data: {
      businessId: business.id,
      programId,
      selectedKadCodes: eligibleSelectedCodes,
      activityNote: activityNote || null,
      questions: questions as any,
      sentAt: new Date(),
    },
  })

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const logoHtml = appSetting?.imentorLogoUrl
    ? `<img src="${appSetting.imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:48px;width:auto;max-width:200px;object-fit:contain;margin:0 0 14px;" />`
    : `<span style="display:block;font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:17px;margin:0 0 14px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const formUrl = `${APP_URL}/microcredits-questionnaire/${questionnaire.token}`
  const sent = await sendEmail({
    to: business.email,
    subject: `Ερωτηματολόγιο για την αίτησή σας στο Ταμείο Μικροπιστώσεων`,
    html: buildQuestionnaireEmailHtml({ businessName: business.onomasia || '', formUrl, logoHtml }),
  }).catch(() => false)

  if (!sent) {
    return NextResponse.json({ error: 'Το ερωτηματολόγιο δημιουργήθηκε αλλά η αποστολή email απέτυχε.', questionnaire }, { status: 502 })
  }

  return NextResponse.json({ questionnaire })
}
