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
    select: { chatLog: true, tokenUsage: true, caseCreatedId: true, createdAt: true },
  })

  return NextResponse.json({
    chatLog: matchToken?.chatLog || [],
    tokenUsage: matchToken?.tokenUsage || 0,
    caseCreatedId: matchToken?.caseCreatedId || null,
    startedAt: matchToken?.createdAt || null,
  })
}
