import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLegalForm } from '@/lib/legal-forms'
import { isKadCodeEligible } from '@/lib/kad-matching'
import { buildMicrocreditsEmailSubject, buildMicrocreditsEmailHtml, type MicrocreditsKadRow } from '@/lib/microcredits-eligibility-email'
import { sendEmail } from '@/lib/email'
import { logMessage } from '@/lib/message-log'
import { notifyCaseManagementCommunication, type CmLeadStatus } from '@/lib/case-management-sync'

export const dynamic = 'force-dynamic'

// Same tool as /api/businesses/[id]/microcredits-eligibility — only the data
// source differs, since a not-yet-claimed ΓΕΜΗ lead has a GemiLookup record
// (activities as JSON, not a BusinessActivity relation) instead of a Business.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, income, profit, proposedAmount, consultantName, customMessage, send, cmNotify, cmLeadStatus, cmReminderDate } = await request.json().catch(() => ({}))
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

  const gemi = await prisma.gemiLookup.findUnique({ where: { id: params.id } })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  const activities = Array.isArray(gemi.activities) ? (gemi.activities as any[]) : []
  const kadRows: MicrocreditsKadRow[] = activities.map(a => ({
    code: a?.firmActCode,
    descr: a?.firmActDescr ?? null,
    isMain: (a?.firmActKind != null ? parseInt(String(a.firmActKind)) : null) === 1,
    eligible: isKadCodeEligible(a?.firmActCode, program),
  }))
  const legalFormEligible = program.excludedLegalForms.length === 0 || !program.excludedLegalForms.includes(normalizeLegalForm(gemi.legalStatusDescr))

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const subject = buildMicrocreditsEmailSubject(gemi.onomasia)
  const html = buildMicrocreditsEmailHtml({
    businessName: gemi.onomasia,
    afm: gemi.afm,
    legalStatusDescr: gemi.legalStatusDescr,
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
    if (!gemi.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: gemi.email, subject, html })
    logMessage({
      kind: 'MICROCREDITS',
      channel: 'EMAIL',
      businessId: gemi.claimedBusinessId,
      businessName: gemi.onomasia,
      afm: gemi.afm,
      accountantId: gemi.claimedAccountantId,
      subject,
      recipient: gemi.email,
      success: ok,
      sentByUserId: session.user.id,
      sentByName: session.user.name,
    })
    let cmSync: { delivered: boolean; found?: boolean; created?: boolean } | null = null
    if (ok && cmNotify !== false) {
      cmSync = await notifyCaseManagementCommunication({
        afm: gemi.afm,
        onomasia: gemi.onomasia,
        email: gemi.email,
        phone: gemi.phone,
        programTitle: program.title,
        kind: 'MICROCREDITS',
        channel: 'EMAIL',
        subject,
        comment: `Εστάλη ανάλυση επιλεξιμότητας Ταμείου Μικροπιστώσεων (έσοδα ${incomeNum.toLocaleString('el-GR')}€, κέρδη ${profitNum.toLocaleString('el-GR')}€, προτεινόμενο δάνειο ${proposedNum.toLocaleString('el-GR')}€).`,
        leadStatus: (cmLeadStatus || null) as CmLeadStatus | null,
        reminderDate: cmReminderDate || null,
        sentByName: session.user.name,
      })
    }
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true, cmSync })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!gemi.email })
}
