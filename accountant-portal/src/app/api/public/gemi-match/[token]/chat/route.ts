import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, classifyConversation, type ChatMessage } from '@/lib/ermis-agent'
import { buildEligibilityQuestions, parseEligibilityStorage } from '@/lib/eligibility-questions'
import { sendEmail } from '@/lib/email'
import { notifyCaseManagement } from '@/lib/case-management-sync'
import { sendErmisWebhook } from '@/app/api/external/ermis-sessions/route'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'
import { runMatchingForBusiness } from '@/lib/matching'

export const dynamic = 'force-dynamic'

async function createGemiCase(params: {
  gemiId: string
  programId: string
  programTitle: string
  businessName: string
  afm: string
  summary: string
  transcript?: ChatMessage[]
  pendingItem?: string | null
}) {
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  if (!adminUser) throw new Error('Δεν βρέθηκε χρήστης ADMIN')

  // Mark the GemiProgramMatch as INTERESTED
  await prisma.gemiProgramMatch.updateMany({
    where: { gemiId: params.gemiId, programId: params.programId },
    data: { status: 'INTERESTED' },
  }).catch(() => {})

  // Find or create a Business record for this GEMI entity
  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: params.gemiId },
    select: {
      claimedBusinessId: true, afm: true, onomasia: true, email: true, mobilePhone: true,
      postalAddress: true, postalAddressNo: true, postalZipCode: true, postalAreaDescription: true,
      regdate: true, activities: true, legalStatusDescr: true,
    },
  })
  if (!gemi) throw new Error('ΓΕΜΗ εγγραφή δεν βρέθηκε')

  const gemiActivities = (Array.isArray(gemi.activities) ? gemi.activities : []) as any[]

  let businessId = gemi.claimedBusinessId ?? null

  if (!businessId) {
    const existing = await prisma.business.findUnique({ where: { afm: params.afm }, select: { id: true } })
    if (existing) {
      businessId = existing.id
      // Sync phone to existing Business if we now have one
      if (gemi.mobilePhone) {
        await prisma.business.update({ where: { id: businessId }, data: { viberPhone: gemi.mobilePhone } }).catch(() => {})
      }
    } else {
      const created = await prisma.business.create({
        data: {
          afm: params.afm,
          onomasia: gemi.onomasia ?? undefined,
          email: gemi.email ?? undefined,
          viberPhone: gemi.mobilePhone ?? undefined,
          postalAddress: gemi.postalAddress ?? undefined,
          postalAddressNo: gemi.postalAddressNo ?? undefined,
          postalZipCode: gemi.postalZipCode ?? undefined,
          postalAreaDescription: gemi.postalAreaDescription ?? undefined,
          regdate: gemi.regdate ?? undefined,
          legalStatusDescr: (gemi as any).legalStatusDescr ?? undefined,
          source: 'gemi',
          tags: ['ΓΕΜΗ'],
          // Copy ΚΑΔ activities from the GEMI record so the case-management
          // profile (ΚΑΔ, κλάδος, περιφέρεια) is complete like normal businesses
          activities: gemiActivities.length ? {
            create: gemiActivities
              .filter((a: any) => a?.firmActCode)
              .map((a: any) => ({
                firmActCode: String(a.firmActCode),
                firmActDescr: a.firmActDescr ?? null,
                firmActKind: a.firmActKind != null ? parseInt(String(a.firmActKind)) : null,
                firmActKindDescr: a.firmActKindDescr ?? null,
              })),
          } : undefined,
        },
        select: { id: true },
      })
      businessId = created.id
      await prisma.gemiLookup.update({
        where: { id: params.gemiId },
        data: { claimedBusinessId: businessId } as any,
      }).catch(() => {})
      // Auto-run matching so program matches are visible in the case detail immediately
      runMatchingForBusiness(businessId).catch(err =>
        console.error('[GemiCase] auto-matching failed:', err instanceof Error ? err.message : err)
      )
    }
  }

  const pendingNote = params.pendingItem?.trim()
    ? `\n\n⚠️ Εκκρεμότητα: ${params.pendingItem.trim()}`
    : ''
  const description = `[ΓΕΜΗ επιχείρηση] ${params.summary}${pendingNote}`

  // Fetch Business profile for case management notification
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { phone: true, email: true, ...BUSINESS_PROFILE_SELECT },
  })

  const clientCase = await prisma.clientCase.create({
    data: {
      businessId,
      programId: params.programId,
      requestType: 'APPLICATION_SUPPORT',
      title: `${params.businessName} — ${params.programTitle}`,
      description,
      priority: 'NORMAL',
      status: 'NEW',
      createdById: adminUser.id,
      activities: {
        create: {
          type: 'CREATED',
          body: `Η υπόθεση δημιουργήθηκε αυτόματα από τον Ερμή (ΓΕΜΗ prospect): ${description}`,
          authorId: adminUser.id,
          authorName: 'Ερμής (AI)',
          authorRole: 'ADMIN',
        },
      },
    },
    include: { accountant: { select: { officeName: true } } },
  })

  // Send admin email notification (same as normal businesses)
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `🗂️ Νέα Υπόθεση #${clientCase.caseNumber} από Ερμή (ΓΕΜΗ) — ${params.businessName}`,
      html: `<p>Ο Ερμής δημιούργησε νέα υπόθεση μετά από συνομιλία με ΓΕΜΗ επιχείρηση <strong>${params.businessName}</strong> (ΑΦΜ: ${params.afm}) για το πρόγραμμα <strong>${params.programTitle}</strong>:</p>
        <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${params.summary}</blockquote>
        ${pendingNote ? `<p style="color:#b45309"><strong>⚠️ Εκκρεμότητα:</strong> ${params.pendingItem!.trim()}</p>` : ''}
        <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${clientCase.id}">Δείτε την υπόθεση →</a></p>`,
    })
  } catch {}

  // Notify external case management system (same as normal businesses)
  if (business) {
    const profile = await buildBusinessProfilePayload(business)
    notifyCaseManagement({
      caseNumber: clientCase.caseNumber,
      phone: gemi.mobilePhone || business.phone || null,
      email: business.email || null,
      accountantOffice: clientCase.accountant?.officeName || null,
      caseType: clientCase.caseType,
      description: clientCase.description,
      priority: clientCase.priority,
      programTitle: params.programTitle,
      // The Ερμής conversation already happened — CM must not auto-start a
      // new screening (Viber/session) for this lead.
      ermis_completed: true,
      program_exact_title: params.programTitle,
      ...profile,
    }).catch(err => console.error('[GemiCase] case mgmt notify failed:', err?.message))

    // Send the ermis.completed webhook with the full transcript + business
    // profile + eligibility — exactly like the normal-business Ερμής flow.
    // CM only accepts ermis.* events on its dedicated Ερμής webhook endpoint
    // (the portal-integration webhook rejects them with "Μη υποστηριζόμενο event").
    const cmWebhookUrl = process.env.ERMIS_CALLBACK_URL || 'https://consult.i-mentor.gr/api/cm/leads/ermis/webhook'
    if (cmWebhookUrl && params.transcript?.length) {
      const eligibility = await classifyConversation(params.transcript, params.programTitle)
        .then(c => (c?.eligibility === 'ELIGIBLE' ? 'eligible' : 'ineligible'))
        .catch(() => null)
      const now = new Date().toISOString()
      sendErmisWebhook({
        callbackUrl: cmWebhookUrl,
        event: 'ermis.completed',
        // Token is per business+program: two Ερμής conversations for the same
        // ΑΦΜ (e.g. ΕΣΠΑ and ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ) are two distinct leads in CM.
        token: `gemi-${params.gemiId}-${params.programId}`,
        leadRef: null,
        afm: params.afm,
        businessProfile: profile,
        program: params.programTitle,
        eligibility,
        transcript: params.transcript.map(m => ({ role: m.role, text: m.text, ts: now })),
        completedAt: now,
      }).catch(err => console.error('[GemiCase] ermis.completed webhook failed:', err?.message))
    }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { message, kickoff } = await request.json()
  if (!kickoff && (!message || typeof message !== 'string' || !message.trim())) {
    return NextResponse.json({ error: 'Το μήνυμα είναι κενό' }, { status: 400 })
  }

  const matchToken = await prisma.gemiMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })
  if (kickoff && Array.isArray(matchToken.chatLog) && (matchToken.chatLog as any[]).length > 0) {
    return NextResponse.json({ error: 'Η συζήτηση έχει ήδη ξεκινήσει' }, { status: 400 })
  }

  const [gemi, program, match] = await Promise.all([
    prisma.gemiLookup.findUnique({
      where: { id: matchToken.gemiId },
      select: { onomasia: true, afm: true, regdate: true },
    }),
    prisma.program.findUnique({
      where: { id: matchToken.programId },
      select: {
        title: true, description: true, category: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true, subsidyNote: true,
        minInterestRate: true, maxInterestRate: true,
        otherRequirements: true, pricingNote: true, internalNotes: true, ermisInstructions: true,
        extraCriteriaIds: true, eligibilityQuestions: true,
        minRegdate: true, maxRegdate: true,
      },
    }),
    prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId: matchToken.gemiId, programId: matchToken.programId } },
      select: { matchReason: true },
    }),
  ])
  if (!gemi || !program) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  const extraCriteriaLabels = program.extraCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
    : []
  const { overrides: questionOverrides, custom: customQuestions } = parseEligibilityStorage(program.eligibilityQuestions)
  const qualitativeQuestions = buildEligibilityQuestions(
    {
      otherRequirements: program.otherRequirements,
      extraCriteriaLabels,
      minInvestment: program.minInvestment,
      maxInvestment: program.maxInvestment,
      isLoan: program.category === 'MICROCREDITS',
    },
    questionOverrides,
    customQuestions,
  )

  const history = (Array.isArray(matchToken.chatLog) ? matchToken.chatLog : []) as unknown as ChatMessage[]
  const newHistory: ChatMessage[] = kickoff ? history : [...history, { role: 'user', text: message.trim() }]

  // Use a fake businessId — runErmisTurn will try to look up the Business,
  // but for GEMI prospects this will return null and the case creation path
  // won't be used (we intercept via caseId logic below).
  // We pass gemiId prefixed so createPublicClientCase fails gracefully
  // and we handle the lead creation ourselves.
  let result
  try {
    result = await runErmisTurn({
      businessId: matchToken.gemiId,
      programId: matchToken.programId,
      businessName: gemi.onomasia || gemi.afm,
      program,
      autoConfirmedReasons: match?.matchReason || [],
      qualitativeQuestions,
      history: newHistory,
      alreadyAssigned: Boolean(matchToken.caseCreatedAt),
      isKickoff: Boolean(kickoff),
      tokensUsedSoFar: matchToken.tokenUsage,
      contextSummary: [
        matchToken.contextSummary,
        gemi.regdate ? `Ημερομηνία έναρξης επιχείρησης: ${gemi.regdate}` : null,
      ].filter(Boolean).join('\n') || null,
      consultant: null,
    })
  } catch (err: any) {
    console.error('[GemiErmisChat] failed:', err?.message)
    return NextResponse.json({ error: 'Ο Ερμής δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.' }, { status: 502 })
  }

  const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', text: result.reply }]

  // If assign_case was triggered, create a GEMI lead notification instead of ImentorRequest
  let caseAssigned = Boolean(matchToken.caseCreatedAt)
  let eligibilityStatus: string | null = null
  let intentStatus: string | null = null

  if (result.caseId && !matchToken.caseCreatedAt) {
    // Fire-and-forget: case creation involves email + case-management webhook
    // calls that can take tens of seconds — never block the chat reply on them
    // (the client shows "Σφάλμα σύνδεσης" if the response takes too long).
    createGemiCase({
      gemiId: matchToken.gemiId,
      programId: matchToken.programId,
      programTitle: program.title,
      businessName: gemi.onomasia || gemi.afm,
      afm: gemi.afm,
      summary: 'Ο πελάτης εκδήλωσε ενδιαφέρον μέσω του Ερμή.',
      transcript: finalHistory,
    }).catch(e => console.error('[GemiErmisChat] createGemiCase failed:', e))
    caseAssigned = true

    // Classify eligibility + intent in the background so the transcripts page
    // shows the same fields as normal-business conversations.
    classifyConversation(finalHistory, program.title)
      .then(c => {
        if (!c) return
        const elig = c.eligibility === 'ELIGIBLE' ? 'ELIGIBLE' : c.eligibility === 'NOT_ELIGIBLE' ? 'NOT_ELIGIBLE' : 'UNCLEAR'
        const intent = c.intent === 'INTERESTED' ? 'INTERESTED' : c.intent === 'NOT_INTERESTED' ? 'NOT_INTERESTED' : 'UNCLEAR'
        return prisma.gemiMatchToken.update({
          where: { token },
          data: { eligibilityStatus: elig, intentStatus: intent },
        })
      })
      .catch(e => console.error('[GemiErmisChat] classify failed:', e))
  }

  await prisma.gemiMatchToken.update({
    where: { token },
    data: {
      chatLog: finalHistory as any,
      tokenUsage: { increment: result.tokensUsed },
      ...(caseAssigned && !matchToken.caseCreatedAt ? { caseCreatedAt: new Date() } : {}),
      ...(eligibilityStatus ? { eligibilityStatus } : {}),
      ...(intentStatus ? { intentStatus } : {}),
    },
  })

  return NextResponse.json({ reply: result.reply, caseAssigned })
}
