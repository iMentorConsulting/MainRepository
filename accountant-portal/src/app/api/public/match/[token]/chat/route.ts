import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, type ChatMessage } from '@/lib/ermis-agent'
import { buildEligibilityQuestions, QuestionOverrides } from '@/lib/eligibility-questions'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { message, kickoff } = await request.json()
  if (!kickoff && (!message || typeof message !== 'string' || !message.trim())) {
    return NextResponse.json({ error: 'Το μήνυμα είναι κενό' }, { status: 400 })
  }

  const matchToken = await prisma.businessMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })
  if (kickoff && Array.isArray(matchToken.chatLog) && matchToken.chatLog.length > 0) {
    return NextResponse.json({ error: 'Η συζήτηση έχει ήδη ξεκινήσει' }, { status: 400 })
  }

  const [business, program, match] = await Promise.all([
    prisma.business.findUnique({ where: { id: matchToken.businessId }, select: { onomasia: true, afm: true } }),
    prisma.program.findUnique({
      where: { id: matchToken.programId },
      select: {
        title: true, description: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true, subsidyNote: true,
        minInterestRate: true, maxInterestRate: true,
        otherRequirements: true, pricingNote: true,
        extraCriteriaIds: true, eligibilityQuestions: true,
      },
    }),
    prisma.programMatch.findUnique({
      where: { programId_businessId: { programId: matchToken.programId, businessId: matchToken.businessId } },
      select: { matchReason: true },
    }),
  ])
  if (!business || !program) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  const extraCriteriaLabels = program.extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
    : []
  const qualitativeQuestions = buildEligibilityQuestions(
    {
      otherRequirements: program.otherRequirements,
      extraCriteriaLabels,
      minInvestment: program.minInvestment,
      maxInvestment: program.maxInvestment,
    },
    (program.eligibilityQuestions as QuestionOverrides | null) || {},
  )

  const history = (Array.isArray(matchToken.chatLog) ? matchToken.chatLog : []) as unknown as ChatMessage[]
  const newHistory: ChatMessage[] = kickoff ? history : [...history, { role: 'user', text: message.trim() }]

  let result
  try {
    result = await runErmisTurn({
      businessId: matchToken.businessId,
      programId: matchToken.programId,
      businessName: business.onomasia || business.afm,
      program,
      autoConfirmedReasons: match?.matchReason || [],
      qualitativeQuestions,
      history: newHistory,
      alreadyAssigned: Boolean(matchToken.caseCreatedId),
      isKickoff: Boolean(kickoff),
      tokensUsedSoFar: matchToken.tokenUsage,
    })
  } catch (err: any) {
    console.error('[ErmisChat] failed:', err?.message)
    return NextResponse.json({ error: 'Ο Ερμής δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.' }, { status: 502 })
  }

  const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', text: result.reply }]

  await prisma.businessMatchToken.update({
    where: { token },
    data: {
      chatLog: finalHistory as any,
      tokenUsage: { increment: result.tokensUsed },
      ...(result.caseId ? { caseCreatedId: result.caseId } : {}),
    },
  })

  return NextResponse.json({ reply: result.reply, caseAssigned: Boolean(result.caseId) })
}
