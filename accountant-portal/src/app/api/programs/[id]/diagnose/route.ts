import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { diagnoseMatch, businessAlreadyReceivedProgram, isProgramOpen } from '@/lib/matching'

// Lets an admin check exactly which eligibility criterion is rejecting a
// specific business for a program, instead of guessing from a bare match
// count — the recurring support question is "this business clearly
// qualifies, why isn't it matched?".
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
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

  // runMatchingForProgram (the "Matching" button) refuses to create ANY
  // match for a program that isn't currently open — inactive, archived, or
  // outside its start/end date window — regardless of how well a business
  // fits every other criterion. Surface that here too, or this tool reports
  // "meets every criterion" for a business that mass matching will still
  // never match, which is exactly the "it should match but doesn't" report
  // this diagnostic exists to resolve.
  if (!isProgramOpen(program)) {
    let reason = 'Το πρόγραμμα δεν είναι ενεργό.'
    if (!program.active) reason = 'Το πρόγραμμα είναι ανενεργό (active = false).'
    else if (program.archived) reason = 'Το πρόγραμμα είναι αρχειοθετημένο.'
    else if (program.startDate && new Date() < program.startDate) reason = `Η περίοδος υποβολής αιτήσεων δεν έχει ξεκινήσει ακόμη (από ${program.startDate.toLocaleDateString('el-GR')}).`
    else if (program.endDate && new Date() > program.endDate) reason = `Η περίοδος υποβολής αιτήσεων έχει λήξει (έως ${program.endDate.toLocaleDateString('el-GR')}).`
    return NextResponse.json({
      business: { afm: business.afm, onomasia: business.onomasia, legalStatusDescr: business.legalStatusDescr, postalZipCode: business.postalZipCode, regdate: business.regdate },
      overall: false,
      programClosed: true,
      results: [{ pass: false, criterion: 'Κατάσταση προγράμματος', detail: `${reason} Για αυτό το λόγο δεν δημιουργούνται matches, ακόμη κι αν η επιχείρηση πληροί όλα τα υπόλοιπα κριτήρια.` }],
    })
  }

  // Check if the business has already received this service from I-MENTOR
  if (businessAlreadyReceivedProgram(business.iMentorServices, program.title)) {
    return NextResponse.json({
      business: { afm: business.afm, onomasia: business.onomasia, legalStatusDescr: business.legalStatusDescr, postalZipCode: business.postalZipCode, regdate: business.regdate },
      overall: false,
      excludedByService: true,
      results: [{ pass: false, criterion: 'iMentorServices', detail: `Η επιχείρηση έχει ήδη λάβει την υπηρεσία "${business.iMentorServices.join(', ')}" από την I-MENTOR — εξαιρείται από αυτό το πρόγραμμα.` }],
    })
  }

  const results = diagnoseMatch(business as any, program as any)
  const overall = results.length === 0 || results.every(r => r.pass)

  return NextResponse.json({
    business: { afm: business.afm, onomasia: business.onomasia, legalStatusDescr: business.legalStatusDescr, postalZipCode: business.postalZipCode, regdate: business.regdate },
    overall,
    results,
  })
}
