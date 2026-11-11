import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isKadCodeEligible } from '@/lib/kad-matching'
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

  const { programId, selectedKadCodes, activityNote, extraInstructions } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  if (!Array.isArray(selectedKadCodes) || selectedKadCodes.length === 0) {
    return NextResponse.json({ error: 'Επιλέξτε τουλάχιστον έναν ΚΑΔ' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  // Defense in depth: the UI only ever offers program-eligible ΚΑΔ, but
  // re-validate here too rather than trusting the client.
  const selectedKad = business.activities
    .filter(a => selectedKadCodes.includes(a.firmActCode) && isKadCodeEligible(a.firmActCode, program))
    .map(a => ({ code: a.firmActCode, description: a.firmActDescr || '' }))
  if (selectedKad.length === 0) {
    return NextResponse.json({ error: 'Οι επιλεγμένοι ΚΑΔ δεν είναι επιλέξιμοι για αυτό το πρόγραμμα' }, { status: 400 })
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
