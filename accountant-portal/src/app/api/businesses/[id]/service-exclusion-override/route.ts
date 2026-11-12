import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForBusiness } from '@/lib/matching'
import { createAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Lifts the "already received this service from I-MENTOR" exclusion for one
// specific business+program — used from the program's "Έλεγχος
// Επιλεξιμότητας" diagnostic when the consultant wants that business to
// re-apply (e.g. a second round of Ταμείο Μικροπιστώσεων) without erasing
// its iMentorServices history, which is what actually drives the exclusion.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { programId } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({ where: { id: params.id } })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  if (!business.serviceExclusionOverrides.includes(programId)) {
    await prisma.business.update({
      where: { id: business.id },
      data: { serviceExclusionOverrides: { push: programId } },
    })
    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entity: 'Business',
      entityId: business.id,
      details: `Παράκαμψη εξαίρεσης «ήδη έλαβε την υπηρεσία» για το πρόγραμμα ${programId}`,
    })
  }

  await runMatchingForBusiness(business.id)

  return NextResponse.json({ ok: true })
}

// Re-applies the exclusion (undoes the bypass above).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })

  const business = await prisma.business.findUnique({ where: { id: params.id } })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  await prisma.business.update({
    where: { id: business.id },
    data: { serviceExclusionOverrides: business.serviceExclusionOverrides.filter(id => id !== programId) },
  })

  await runMatchingForBusiness(business.id)

  return NextResponse.json({ ok: true })
}
