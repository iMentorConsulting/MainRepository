import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEligibilityAdviceSubject, buildEligibilityAdviceEmailHtml, extractDiscussedAmount } from '@/lib/eligibility-advice-email'
import { sendEmail } from '@/lib/email'
import { logMessage } from '@/lib/message-log'
import { notifyCaseManagementCommunication, type CmLeadStatus } from '@/lib/case-management-sync'

export const dynamic = 'force-dynamic'

// Admin/consultant tool: a short "why you're eligible + what the grant is
// worth + what to do next" email, distinct from the full program-info dump
// in program-email/route.ts. Asks the prospect to reply with their own
// investment idea, a rough cost estimate, and any questions. See
// src/lib/eligibility-advice-email.ts.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, send, customMessage, includeErmisAmount, investmentAmount, cmNotify, cmLeadStatus, cmReminderDate } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    select: { id: true, onomasia: true, afm: true, email: true, phone: true, accountantId: true, accountant: { select: { officeName: true } } },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const [match, appSetting, matchToken] = await Promise.all([
    prisma.programMatch.findUnique({
      where: { programId_businessId: { programId, businessId: business.id } },
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
    prisma.businessMatchToken.findUnique({ where: { businessId_programId: { businessId: business.id, programId } }, select: { chatLog: true } }),
  ])
  if (!match || match.status === 'REJECTED') {
    return NextResponse.json({ error: 'Η επιχείρηση δεν είναι επιλέξιμη για αυτό το πρόγραμμα' }, { status: 400 })
  }

  const detectedAmount = extractDiscussedAmount(matchToken?.chatLog)
  const ermisDiscussedAmount = includeErmisAmount !== false ? detectedAmount : null
  const ermisChatLog = Array.isArray(matchToken?.chatLog)
    ? (matchToken!.chatLog as any[]).filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant')).map(m => ({ role: m.role, text: m.text }))
    : []

  const subject = buildEligibilityAdviceSubject(business.onomasia, match.program.title)
  const html = buildEligibilityAdviceEmailHtml({
    businessName: business.onomasia,
    program: match.program,
    matchReasons: match.matchReason,
    ermisDiscussedAmount,
    investmentAmount: typeof investmentAmount === 'number' && investmentAmount > 0 ? investmentAmount : null,
    customMessage: typeof customMessage === 'string' && customMessage.trim() ? customMessage.trim() : null,
    imentorLogoUrl: appSetting?.imentorLogoUrl,
  })

  if (send === true) {
    if (!business.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: business.email, subject, html })
    logMessage({
      kind: 'ADVICE',
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
    let cmSync: { delivered: boolean; found?: boolean } | null = null
    if (ok && cmNotify !== false) {
      cmSync = await notifyCaseManagementCommunication({
        afm: business.afm,
        onomasia: business.onomasia,
        email: business.email,
        phone: business.phone,
        programTitle: match.program.title,
        kind: 'ADVICE',
        channel: 'EMAIL',
        subject,
        comment: `Εστάλη email «Ενημέρωση & Επόμενα Βήματα» για το πρόγραμμα «${match.program.title}».`,
        leadStatus: (cmLeadStatus || null) as CmLeadStatus | null,
        reminderDate: cmReminderDate || null,
        sentByName: session.user.name,
      })
    }
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true, detectedAmount, ermisChatLog, cmSync })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!business.email, detectedAmount, ermisChatLog })
}
