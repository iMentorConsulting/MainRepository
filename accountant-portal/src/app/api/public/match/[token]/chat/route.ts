import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, type ChatMessage } from '@/lib/ermis-agent'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { message } = await request.json()
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Το μήνυμα είναι κενό' }, { status: 400 })
  }

  const matchToken = await prisma.businessMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })

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
      },
    }),
    prisma.programMatch.findUnique({
      where: { programId_businessId: { programId: matchToken.programId, businessId: matchToken.businessId } },
      select: { matchReason: true },
    }),
  ])
  if (!business || !program) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  const history = (Array.isArray(matchToken.chatLog) ? matchToken.chatLog : []) as unknown as ChatMessage[]
  const newHistory: ChatMessage[] = [...history, { role: 'user', text: message.trim() }]

  let result
  try {
    result = await runErmisTurn({
      businessId: matchToken.businessId,
      programId: matchToken.programId,
      businessName: business.onomasia || business.afm,
      program,
      autoConfirmedReasons: match?.matchReason || [],
      history: newHistory,
      alreadyAssigned: Boolean(matchToken.caseCreatedId),
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
      ...(result.caseId ? { caseCreatedId: result.caseId } : {}),
    },
  })

  return NextResponse.json({ reply: result.reply, caseAssigned: Boolean(result.caseId) })
}
