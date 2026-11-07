import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEligibilityAdviceSubject, buildEligibilityAdviceEmailHtml, extractDiscussedAmount } from '@/lib/eligibility-advice-email'
import { sendEmail } from '@/lib/email'
import { logMessage } from '@/lib/message-log'
import { notifyCaseManagementCommunication, type CmLeadStatus } from '@/lib/case-management-sync'
import { autoClaimGemiOnSend } from '@/lib/gemi-claim'

export const dynamic = 'force-dynamic'

// Same tool as /api/businesses/[id]/eligibility-advice — only the data
// source differs: GemiLookup/GemiProgramMatch/GemiMatchToken instead of
// Business/ProgramMatch/BusinessMatchToken.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, send, customMessage, includeErmisAmount, investmentAmount, cmNotify, cmLeadStatus, cmReminderDate, cmCreateIfMissing, questions } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const gemi = await prisma.gemiLookup.findUnique({ where: { id: params.id } })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const [match, appSetting, matchToken] = await Promise.all([
    prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId: gemi.id, programId } },
      include: {
        program: {
          select: {
            title: true, category: true,
            minSubsidyPct: true, maxSubsidyPct: true, subsidyNote: true,
            minInvestment: true, maxInvestment: true,
            monthlyAmount: true, subsidyMonths: true, totalBenefit: true,
            expenseCategories: true, investmentPricingBrackets: true,
          },
        },
      },
    }),
    prisma.appSetting.findUnique({ where: { id: 'main' } }),
    prisma.gemiMatchToken.findUnique({ where: { gemiId_programId: { gemiId: gemi.id, programId } }, select: { chatLog: true } }),
  ])
  if (!match || match.status === 'REJECTED') {
    return NextResponse.json({ error: 'Η επιχείρηση δεν είναι επιλέξιμη για αυτό το πρόγραμμα' }, { status: 400 })
  }

  const detectedAmount = extractDiscussedAmount(matchToken?.chatLog)
  const ermisDiscussedAmount = includeErmisAmount !== false ? detectedAmount : null
  const ermisChatLog = Array.isArray(matchToken?.chatLog)
    ? (matchToken!.chatLog as any[]).filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant')).map(m => ({ role: m.role, text: m.text }))
    : []

  const subject = buildEligibilityAdviceSubject(gemi.onomasia, match.program.title)
  const html = buildEligibilityAdviceEmailHtml({
    businessName: gemi.onomasia,
    program: match.program,
    matchReasons: match.matchReason,
    ermisDiscussedAmount,
    investmentAmount: typeof investmentAmount === 'number' && investmentAmount > 0 ? investmentAmount : null,
    customMessage: typeof customMessage === 'string' && customMessage.trim() ? customMessage.trim() : null,
    questions: Array.isArray(questions) ? questions.filter((q: unknown) => typeof q === 'string' && q.trim()).map((q: string) => q.trim()) : undefined,
    imentorLogoUrl: appSetting?.imentorLogoUrl,
  })

  if (send === true) {
    if (!gemi.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: gemi.email, subject, html })
    logMessage({
      kind: 'ADVICE',
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
        programTitle: match.program.title,
        kind: 'ADVICE',
        channel: 'EMAIL',
        subject,
        comment: `Εστάλη email «Ενημέρωση & Επόμενα Βήματα» για το πρόγραμμα «${match.program.title}».`,
        leadStatus: (cmLeadStatus || null) as CmLeadStatus | null,
        reminderDate: cmReminderDate || null,
        createIfMissing: cmCreateIfMissing !== false,
        sentByName: session.user.name,
        sentByEmail: session.user.email,
      })
    }
    const claimed = ok ? await autoClaimGemiOnSend(gemi) : false
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true, detectedAmount, ermisChatLog, cmSync, claimed })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!gemi.email, detectedAmount, ermisChatLog })
}
