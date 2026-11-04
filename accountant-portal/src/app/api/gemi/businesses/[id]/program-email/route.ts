import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAadeBusinessDetails } from '@/lib/business-profile'
import { buildProspectProgramEmailSubject, buildProspectProgramEmailHtml } from '@/lib/eligibility-email'
import { sendEmail } from '@/lib/email'
import { logMessage } from '@/lib/message-log'

export const dynamic = 'force-dynamic'

// Same tool as /api/businesses/[id]/program-email, built on the exact same
// email template (buildProspectProgramEmailHtml) so the two stay identical
// if that template changes — only the data source differs, since a
// not-yet-claimed ΓΕΜΗ lead has a GemiLookup/GemiProgramMatch record, not
// yet a Business/ProgramMatch one.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, send, customMessage } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const gemi = await prisma.gemiLookup.findUnique({ where: { id: params.id } })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const match = await prisma.gemiProgramMatch.findUnique({
    where: { gemiId_programId: { gemiId: gemi.id, programId } },
    include: {
      program: { include: { requiredDocuments: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } },
    },
  })
  if (!match || match.status === 'REJECTED') {
    return NextResponse.json({ error: 'Η επιχείρηση δεν είναι επιλέξιμη για αυτό το πρόγραμμα' }, { status: 400 })
  }

  const activities = Array.isArray(gemi.activities) ? (gemi.activities as any[]) : []
  const businessDetails = buildAadeBusinessDetails({
    ...gemi,
    activities: activities.map(a => ({
      firmActCode: a?.firmActCode,
      firmActDescr: a?.firmActDescr ?? null,
      firmActKind: a?.firmActKind != null ? parseInt(String(a.firmActKind)) : null,
    })),
  })

  const [appSetting, extraCriteria] = await Promise.all([
    prisma.appSetting.findUnique({ where: { id: 'main' } }),
    match.program.extraCriteriaIds.length > 0
      ? prisma.eligibilityCriterion.findMany({ where: { id: { in: match.program.extraCriteriaIds } }, select: { label: true } })
      : Promise.resolve([]),
  ])

  const subject = buildProspectProgramEmailSubject(gemi.onomasia, match.program.title)
  const html = buildProspectProgramEmailHtml({
    businessName: gemi.onomasia,
    businessDetails,
    program: match.program,
    matchReasons: match.matchReason,
    extraCriteriaLabels: extraCriteria.map(c => c.label),
    requiredDocuments: match.program.requiredDocuments,
    customMessage: typeof customMessage === 'string' && customMessage.trim() ? customMessage.trim() : null,
    imentorLogoUrl: appSetting?.imentorLogoUrl,
  })

  if (send === true) {
    if (!gemi.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: gemi.email, subject, html })
    logMessage({
      kind: 'PROGRAM_EMAIL',
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
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!gemi.email })
}
