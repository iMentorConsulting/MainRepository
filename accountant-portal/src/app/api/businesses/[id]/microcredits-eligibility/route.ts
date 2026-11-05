import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLegalForm } from '@/lib/legal-forms'
import { isKadCodeEligible } from '@/lib/kad-matching'
import { buildMicrocreditsEmailSubject, buildMicrocreditsEmailHtml, type MicrocreditsKadRow } from '@/lib/microcredits-eligibility-email'
import { sendEmail } from '@/lib/email'
import { logMessage } from '@/lib/message-log'

export const dynamic = 'force-dynamic'

// ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ-only tool: an admin/consultant enters the business's
// latest-year income/profit and a proposed loan amount, and gets back the
// "ΑΝΑΛΥΣΗ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ" email mirroring the consultant's manual Word
// template — every one of the business's ΚΑΔ checked individually against
// THIS program's rules (not just "does at least one pass"), legal form
// checked the same way, then preview/send like the other business-email
// tools in this app.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, income, profit, proposedAmount, consultantName, customMessage, send } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  const incomeNum = Number(income)
  const profitNum = Number(profit)
  const proposedNum = Number(proposedAmount)
  if (!Number.isFinite(incomeNum) || !Number.isFinite(profitNum) || !Number.isFinite(proposedNum)) {
    return NextResponse.json({ error: 'Λείπουν ή είναι μη έγκυρα τα ποσά' }, { status: 400 })
  }
  const signerName = typeof consultantName === 'string' && consultantName.trim() ? consultantName.trim() : (session.user.name || '')
  if (!signerName) return NextResponse.json({ error: 'Λείπει το όνομα συμβούλου' }, { status: 400 })

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true, accountant: { select: { officeName: true } } },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  const kadRows: MicrocreditsKadRow[] = business.activities.map(a => ({
    code: a.firmActCode,
    descr: a.firmActDescr,
    isMain: a.firmActKind === 1,
    eligible: isKadCodeEligible(a.firmActCode, program),
  }))
  const legalFormEligible = program.excludedLegalForms.length === 0 || !program.excludedLegalForms.includes(normalizeLegalForm(business.legalStatusDescr))

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const subject = buildMicrocreditsEmailSubject(business.onomasia)
  const html = buildMicrocreditsEmailHtml({
    businessName: business.onomasia,
    afm: business.afm,
    legalStatusDescr: business.legalStatusDescr,
    legalFormEligible,
    kadRows,
    income: incomeNum,
    profit: profitNum,
    proposedAmount: proposedNum,
    consultantName: signerName,
    customMessage: typeof customMessage === 'string' && customMessage.trim() ? customMessage.trim() : null,
    imentorLogoUrl: appSetting?.imentorLogoUrl,
  })

  if (send === true) {
    if (!business.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: business.email, subject, html })
    logMessage({
      kind: 'MICROCREDITS',
      channel: 'EMAIL',
      businessId: business.id,
      businessName: business.onomasia,
      afm: business.afm,
      accountantId: business.accountantId,
      accountantName: business.accountant?.officeName,
      subject,
      recipient: business.email,
      success: ok,
      sentByUserId: session.user.id,
      sentByName: session.user.name,
    })
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!business.email })
}
