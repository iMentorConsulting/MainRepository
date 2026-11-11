import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMicrocreditsQuestionnaire } from '@/lib/microcredits-business-plan'

export const dynamic = 'force-dynamic'

// Generates (or regenerates, with extra consultant guidance) a draft
// questionnaire WITHOUT creating a record or sending anything — lets the
// consultant review, remove questions, and re-roll before the real send.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { selectedKadCodes, activityNote, extraInstructions } = await request.json().catch(() => ({}))
  if (!Array.isArray(selectedKadCodes) || selectedKadCodes.length === 0) {
    return NextResponse.json({ error: 'Επιλέξτε τουλάχιστον έναν ΚΑΔ' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const selectedKad = business.activities
    .filter(a => selectedKadCodes.includes(a.firmActCode))
    .map(a => ({ code: a.firmActCode, description: a.firmActDescr || '' }))
  if (selectedKad.length === 0) {
    return NextResponse.json({ error: 'Οι επιλεγμένοι ΚΑΔ δεν βρέθηκαν στις δραστηριότητες της επιχείρησης' }, { status: 400 })
  }

  try {
    const questions = await generateMicrocreditsQuestionnaire({
      businessName: business.onomasia || business.afm,
      foundingDate: business.regdate,
      legalForm: business.legalStatusDescr,
      selectedKad,
      activityNote: activityNote || null,
      extraInstructions: extraInstructions || null,
    })
    return NextResponse.json({ questions })
  } catch (err: any) {
    console.error('[Microcredits questionnaire preview] AI generation failed:', err?.message)
    return NextResponse.json({ error: 'Η δημιουργία του ερωτηματολογίου απέτυχε.' }, { status: 500 })
  }
}
