import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Overview of every Microcredits questionnaire ever sent, across all
// businesses, so a consultant can track which ones still need a follow-up
// instead of relying only on the automatic reminder cron.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const questionnaires = await prisma.microcreditsQuestionnaire.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      business: { select: { id: true, onomasia: true, afm: true, email: true, phone: true } },
      program: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json({ questionnaires })
}
