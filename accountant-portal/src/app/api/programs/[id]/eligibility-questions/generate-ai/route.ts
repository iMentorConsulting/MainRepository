import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEligibilityRequirements } from '@/lib/eligibility-ai'

// Admin-triggered, once-per-program LLM classification pass — never called
// from the public Ερμής flow. Returns proposals only; the admin must review
// and save them via PUT /api/programs/[id]/eligibility-questions before they
// affect what businesses see.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const program = await prisma.program.findUnique({ where: { id: params.id } })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const criteriaList = program.extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
    : []

  const otherRequirementItems = program.otherRequirements
    ? program.otherRequirements.split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : []

  const items = [
    ...otherRequirementItems.map((text, i) => ({ id: `req-${i}`, text })),
    ...criteriaList.map(c => ({ id: `criterion-${c.id}`, text: c.label })),
  ]

  try {
    const classifications = await classifyEligibilityRequirements(items)
    return NextResponse.json({ classifications })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Σφάλμα κατά την ταξινόμηση'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
