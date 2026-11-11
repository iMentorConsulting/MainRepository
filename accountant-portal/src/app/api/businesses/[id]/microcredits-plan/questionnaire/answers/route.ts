import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Lets a consultant fill in or correct the client's answers directly — e.g.
// after conducting the interview by phone instead of having the client use
// the public form — and mark the questionnaire as answered themselves.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, answers, markResponded } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Λείπουν οι απαντήσεις' }, { status: 400 })
  }

  const questionnaire = await prisma.microcreditsQuestionnaire.findFirst({
    where: { businessId: params.id, programId },
    orderBy: { createdAt: 'desc' },
  })
  if (!questionnaire) return NextResponse.json({ error: 'Δεν βρέθηκε ερωτηματολόγιο' }, { status: 404 })

  const updated = await prisma.microcreditsQuestionnaire.update({
    where: { id: questionnaire.id },
    data: {
      answers,
      ...(markResponded && !questionnaire.respondedAt ? { respondedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ questionnaire: updated })
}
