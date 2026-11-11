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

// `submit: true` (the final "Υποβολή" click) marks the questionnaire as
// answered (respondedAt). Without it, this is just an autosave of
// in-progress answers — called periodically while the client types, so
// closing the tab and coming back later doesn't lose their progress —
// and must NOT mark the questionnaire as responded.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const questionnaire = await prisma.microcreditsQuestionnaire.findUnique({ where: { token: params.token } })
  if (!questionnaire) return NextResponse.json({ error: 'Ο σύνδεσμος δεν είναι έγκυρος.' }, { status: 404 })

  const { answers, submit } = await request.json().catch(() => ({}))
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Λείπουν οι απαντήσεις' }, { status: 400 })
  }

  await prisma.microcreditsQuestionnaire.update({
    where: { id: questionnaire.id },
    data: submit === true ? { answers, respondedAt: new Date() } : { answers },
  })

  return NextResponse.json({ ok: true })
}
