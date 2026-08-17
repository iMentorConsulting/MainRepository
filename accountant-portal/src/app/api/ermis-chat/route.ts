import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Lets admins/accountants read the full Ερμής transcript for a business+program —
// the conversation is already persisted on BusinessMatchToken.chatLog for QA and
// "what exactly did Ερμής tell this customer" purposes.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = request.nextUrl.searchParams.get('businessId')
  const programId = request.nextUrl.searchParams.get('programId')
  if (!businessId || !programId) return NextResponse.json({ error: 'Λείπει businessId ή programId' }, { status: 400 })

  if (session.user.role === 'ACCOUNTANT' && (session.user as any).accountantId) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { accountantId: true } })
    if (!business || business.accountantId !== (session.user as any).accountantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const matchToken = await prisma.businessMatchToken.findUnique({
    where: { businessId_programId: { businessId, programId } },
    select: { chatLog: true, tokenUsage: true, tokenUsageInput: true, tokenUsageOutput: true, caseCreatedId: true, createdAt: true, contextSummary: true },
  })

  if (matchToken) {
    return NextResponse.json({
      chatLog: matchToken.chatLog || [],
      tokenUsage: matchToken.tokenUsage || 0,
      tokenUsageInput: matchToken.tokenUsageInput || 0,
      tokenUsageOutput: matchToken.tokenUsageOutput || 0,
      caseCreatedId: matchToken.caseCreatedId || null,
      startedAt: matchToken.createdAt || null,
      contextSummary: matchToken.contextSummary || null,
    })
  }

  // Fall back to GemiMatchToken — GEMI-originated cases store the transcript there
  const gemiRecord = await prisma.gemiLookup.findFirst({
    where: { claimedBusinessId: businessId },
    select: { id: true },
  })
  if (gemiRecord) {
    const gemiToken = await prisma.gemiMatchToken.findUnique({
      where: { gemiId_programId: { gemiId: gemiRecord.id, programId } },
      select: { chatLog: true, tokenUsage: true, caseCreatedAt: true, createdAt: true },
    })
    if (gemiToken) {
      return NextResponse.json({
        chatLog: gemiToken.chatLog || [],
        tokenUsage: gemiToken.tokenUsage || 0,
        tokenUsageInput: 0,
        tokenUsageOutput: 0,
        caseCreatedId: gemiToken.caseCreatedAt ? 'gemi' : null,
        startedAt: gemiToken.createdAt || null,
      })
    }
  }

  return NextResponse.json({
    chatLog: [],
    tokenUsage: 0,
    tokenUsageInput: 0,
    tokenUsageOutput: 0,
    caseCreatedId: null,
    startedAt: null,
  })
}
