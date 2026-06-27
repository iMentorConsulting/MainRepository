import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { diagnoseMatch } from '@/lib/matching'

// Lets an admin check exactly which eligibility criterion is rejecting a
// specific business for a program, instead of guessing from a bare match
// count — the recurring support question is "this business clearly
// qualifies, why isn't it matched?".
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const afm = request.nextUrl.searchParams.get('afm')?.trim()
  if (!afm) return NextResponse.json({ error: 'Απαιτείται ΑΦΜ' }, { status: 400 })

  const [program, business] = await Promise.all([
    prisma.program.findUnique({ where: { id: params.id } }),
    prisma.business.findFirst({ where: { afm }, include: { activities: true } }),
  ])
  if (!program) return NextResponse.json({ error: 'Δεν βρέθηκε πρόγραμμα' }, { status: 404 })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε επιχείρηση με αυτό το ΑΦΜ' }, { status: 404 })

  const results = diagnoseMatch(business as any, program as any)
  const overall = results.length === 0 || results.every(r => r.pass)

  return NextResponse.json({
    business: { afm: business.afm, onomasia: business.onomasia, legalStatusDescr: business.legalStatusDescr, postalZipCode: business.postalZipCode, regdate: business.regdate },
    overall,
    results,
  })
}
