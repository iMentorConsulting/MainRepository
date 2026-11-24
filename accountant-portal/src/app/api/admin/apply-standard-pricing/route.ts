import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Puts every ACTIVE (not archived) ΕΣΠΑ + LEADER program back on the standard
// I-MENTOR price list (DEFAULT_INVESTMENT_PRICING_BRACKETS in
// src/lib/investment-pricing.ts) — including programs that had their own custom
// table or had the table removed. A program "on the standard list" stores no table
// (null), so it follows every future change of the standard automatically.
// Body: { dryRun?: boolean } → returns the counts; without dryRun it applies.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))

  const programs = await prisma.program.findMany({
    where: { active: true, archived: false, category: { in: ['ESPA', 'LEADER'] } },
    select: { id: true, title: true, investmentPricingBrackets: true },
  })

  const onStandard = programs.filter(p => p.investmentPricingBrackets == null)
  const custom = programs.filter(p => Array.isArray(p.investmentPricingBrackets) && p.investmentPricingBrackets.length > 0)
  const noTable = programs.filter(p => Array.isArray(p.investmentPricingBrackets) && p.investmentPricingBrackets.length === 0)

  const summary = {
    total: programs.length,
    alreadyOnStandard: onStandard.length,
    customReset: custom.map(p => p.title),
    noTableReset: noTable.map(p => p.title),
  }
  if (body.dryRun) return NextResponse.json({ dryRun: true, ...summary })

  const toReset = [...custom, ...noTable].map(p => p.id)
  if (toReset.length > 0) {
    await prisma.program.updateMany({ where: { id: { in: toReset } }, data: { investmentPricingBrackets: Prisma.DbNull } })
  }
  return NextResponse.json({ applied: true, ...summary })
}
