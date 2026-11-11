import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const questionnaire = await prisma.microcreditsQuestionnaire.findUnique({
    where: { token: params.token },
    include: { business: { select: { onomasia: true } } },
  })
  if (!questionnaire) return NextResponse.json({ error: 'Ο σύνδεσμος δεν είναι έγκυρος.' }, { status: 404 })

  return NextResponse.json({
    businessName: questionnaire.business.onomasia,
    questions: questionnaire.questions,
    answers: questionnaire.answers || {},
    respondedAt: questionnaire.respondedAt,
  })
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const questionnaire = await prisma.microcreditsQuestionnaire.findUnique({ where: { token: params.token } })
  if (!questionnaire) return NextResponse.json({ error: 'Ο σύνδεσμος δεν είναι έγκυρος.' }, { status: 404 })

  const { answers } = await request.json().catch(() => ({}))
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Λείπουν οι απαντήσεις' }, { status: 400 })
  }

  await prisma.microcreditsQuestionnaire.update({
    where: { id: questionnaire.id },
    data: { answers, respondedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
