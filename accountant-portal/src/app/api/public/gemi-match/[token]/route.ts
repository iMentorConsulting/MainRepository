import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const matchToken = await prisma.gemiMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })

  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: matchToken.gemiId },
      select: { onomasia: true, afm: true, activities: true },
    }),
    prisma.program.findUnique({
      where: { id: matchToken.programId },
      select: {
        title: true, description: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true,
        minInterestRate: true, maxInterestRate: true,
        otherRequirements: true, extraCriteriaIds: true, eligibilityQuestions: true,
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

  if (!matchToken.usedAt) {
    await prisma.gemiMatchToken.update({ where: { token }, data: { usedAt: new Date() } })
  }

  const baseUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const themisLink = `${baseUrl}/ge/${token}?type=themis`

  return NextResponse.json({
    business: { name: gemi.onomasia || gemi.afm },
    themisLink,
    program: {
      title: program.title,
      description: program.description,
      minInvestment: program.minInvestment,
      maxInvestment: program.maxInvestment,
      minSubsidyPct: program.minSubsidyPct,
      maxSubsidyPct: program.maxSubsidyPct,
      minInterestRate: program.minInterestRate,
      maxInterestRate: program.maxInterestRate,
      otherRequirements: program.otherRequirements,
      extraCriteriaLabels,
      eligibilityQuestions: program.eligibilityQuestions,
    },
    autoConfirmedReasons: match?.matchReason || [],
    chatLog: matchToken.chatLog || [],
    caseAssigned: Boolean(matchToken.caseCreatedAt),
  })
}
