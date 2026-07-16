import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, type ChatMessage } from '@/lib/ermis-agent'
import { buildEligibilityQuestions, parseEligibilityStorage } from '@/lib/eligibility-questions'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

async function createGemiLead(params: {
  gemiId: string
  programId: string
  programTitle: string
  businessName: string
  afm: string
  summary: string
  pendingItem?: string | null
}) {
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })

  const pendingNote = params.pendingItem?.trim()
    ? `\n\n⚠️ Εκκρεμότητα: ${params.pendingItem.trim()}`
    : ''

  // Mark the GemiProgramMatch as confirmed
  await prisma.gemiProgramMatch.updateMany({
    where: { gemiId: params.gemiId, programId: params.programId },
    data: { status: 'CONFIRMED' },
  }).catch(() => {})

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `🗂️ Νέο Ενδιαφέρον ΓΕΜΗ από Ερμής — ${params.businessName} (${params.afm})`,
      html: `<p>Ο Ερμής ολοκλήρωσε συνομιλία με επιχείρηση ΓΕΜΗ <strong>${params.businessName}</strong> (ΑΦΜ: ${params.afm}) για το πρόγραμμα <strong>${params.programTitle}</strong>:</p>
        <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${params.summary}</blockquote>
        ${pendingNote ? `<p style="color:#b45309"><strong>⚠️ Εκκρεμότητα:</strong> ${params.pendingItem!.trim()}</p>` : ''}
        <p>Η επιχείρηση δεν είναι ακόμα πελάτης. Επικοινωνήστε μαζί της για να προχωρήσετε.</p>`,
    })
  } catch {}

  return `gemi-${params.gemiId}`
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { message, kickoff } = await request.json()
  if (!kickoff && (!message || typeof message !== 'string' || !message.trim())) {
    return NextResponse.json({ error: 'Το μήνυμα είναι κενό' }, { status: 400 })
  }

  const matchToken = await prisma.gemiMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })
  if (kickoff && Array.isArray(matchToken.chatLog) && (matchToken.chatLog as any[]).length > 0) {
    return NextResponse.json({ error: 'Η συζήτηση έχει ήδη ξεκινήσει' }, { status: 400 })
  }

  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: matchToken.gemiId },
      select: { onomasia: true, afm: true },
    }),
    prisma.program.findUnique({
      where: { id: matchToken.programId },
      select: {
        title: true, description: true, category: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true, subsidyNote: true,
        minInterestRate: true, maxInterestRate: true,
        otherRequirements: true, pricingNote: true, internalNotes: true, ermisInstructions: true,
        extraCriteriaIds: true, eligibilityQuestions: true,
      },
    }),
    prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId: matchToken.gemiId, programId: matchToken.programId } },
      select: { matchReason: true },
    }),
  ])
  if (!gemi || !program) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  const extraCriteriaLabels = program.extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
    : []
  const { overrides: questionOverrides, custom: customQuestions } = parseEligibilityStorage(program.eligibilityQuestions)
  const qualitativeQuestions = buildEligibilityQuestions(
    {
      otherRequirements: program.otherRequirements,
      extraCriteriaLabels,
      minInvestment: program.minInvestment,
      maxInvestment: program.maxInvestment,
      isLoan: program.category === 'MICROCREDITS',
    },
    questionOverrides,
    customQuestions,
  )

  const history = (Array.isArray(matchToken.chatLog) ? matchToken.chatLog : []) as unknown as ChatMessage[]
  const newHistory: ChatMessage[] = kickoff ? history : [...history, { role: 'user', text: message.trim() }]

  // Use a fake businessId — runErmisTurn will try to look up the Business,
  // but for GEMI prospects this will return null and the case creation path
  // won't be used (we intercept via caseId logic below).
  // We pass gemiId prefixed so createPublicClientCase fails gracefully
  // and we handle the lead creation ourselves.
  let result
  try {
    result = await runErmisTurn({
      businessId: matchToken.gemiId,
      programId: matchToken.programId,
      businessName: gemi.onomasia || gemi.afm,
      program,
      autoConfirmedReasons: match?.matchReason || [],
      qualitativeQuestions,
      history: newHistory,
      alreadyAssigned: Boolean(matchToken.caseCreatedAt),
      isKickoff: Boolean(kickoff),
      tokensUsedSoFar: matchToken.tokenUsage,
      contextSummary: matchToken.contextSummary ?? null,
      consultant: null,
    })
  } catch (err: any) {
    console.error('[GemiErmisChat] failed:', err?.message)
    return NextResponse.json({ error: 'Ο Ερμής δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.' }, { status: 502 })
  }

  const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', text: result.reply }]

  // If assign_case was triggered, create a GEMI lead notification instead of ImentorRequest
  let caseAssigned = Boolean(matchToken.caseCreatedAt)
  if (result.caseId && !matchToken.caseCreatedAt) {
    try {
      await createGemiLead({
        gemiId: matchToken.gemiId,
        programId: matchToken.programId,
        programTitle: program.title,
        businessName: gemi.onomasia || gemi.afm,
        afm: gemi.afm,
        summary: 'Ο πελάτης εκδήλωσε ενδιαφέρον μέσω του Ερμή.',
      })
    } catch {}
    caseAssigned = true
  }

  await prisma.gemiMatchToken.update({
    where: { token },
    data: {
      chatLog: finalHistory as any,
      tokenUsage: { increment: result.tokensUsed },
      ...(caseAssigned && !matchToken.caseCreatedAt ? { caseCreatedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ reply: result.reply, caseAssigned })
}
