import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const matchToken = await prisma.businessMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })

  const [business, program] = await Promise.all([
    prisma.business.findUnique({ where: { id: matchToken.businessId }, select: { onomasia: true, afm: true } }),
    prisma.program.findUnique({
      where: { id: matchToken.programId },
      select: {
        title: true, description: true,
        kadRules: true, regionRules: true, zipCodeRules: true, excludedLegalForms: true,
        minRegdate: true, maxRegdate: true, minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true, minInterestRate: true, maxInterestRate: true,
        requireTags: true, excludeTags: true, eligibilityQuestions: true,
      },
    }),
  ])
  if (!business || !program) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  if (!matchToken.usedAt) {
    await prisma.businessMatchToken.update({ where: { token }, data: { usedAt: new Date() } })
  }

  return NextResponse.json({
    business: { name: business.onomasia || business.afm },
    program: { ...program, title: program.title, description: program.description },
  })
}
