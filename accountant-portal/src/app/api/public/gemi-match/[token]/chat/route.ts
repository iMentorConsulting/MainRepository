import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, type ChatMessage } from '@/lib/ermis-agent'
import { buildEligibilityQuestions, parseEligibilityStorage } from '@/lib/eligibility-questions'
import { sendEmail } from '@/lib/email'
import { notifyCaseManagement } from '@/lib/case-management-sync'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

export const dynamic = 'force-dynamic'

async function createGemiCase(params: {
  gemiId: string
  programId: string
  programTitle: string
  businessName: string
  afm: string
  summary: string
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
      regdate: true,
    },
  })
  if (!gemi) throw new Error('ΓΕΜΗ εγγραφή δεν βρέθηκε')

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
          source: 'gemi',
          tags: ['ΓΕΜΗ'],
        },
        select: { id: true },
      })
      businessId = created.id
      await prisma.gemiLookup.update({
        where: { id: params.gemiId },
        data: { claimedBusinessId: businessId } as any,
      }).catch(() => {})
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
      ...profile,
    }).catch(err => console.error('[GemiCase] case mgmt notify failed:', err?.message))
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
      select: { onomasia: true, afm: true },
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
      contextSummary: matchToken.contextSummary ?? null,
      consultant: null,
    })
  } catch (err: any) {
    console.error('[GemiErmisChat] failed:', err?.message)
    return NextResponse.json({ error: 'Ο Ερμής δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.' }, { status: 502 })
  }

  const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', text: result.reply }]

  // If assign_case was triggered, create a GEMI lead notification instead of ImentorRequest
  let caseAssigned = Boolean(matchToken.caseCreatedAt)
  if (result.caseId && !matchToken.caseCreatedAt) {
    try {
      await createGemiCase({
        gemiId: matchToken.gemiId,
        programId: matchToken.programId,
        programTitle: program.title,
        businessName: gemi.onomasia || gemi.afm,
        afm: gemi.afm,
        summary: 'Ο πελάτης εκδήλωσε ενδιαφέρον μέσω του Ερμή.',
      })
    } catch (e) {
      console.error('[GemiErmisChat] createGemiCase failed:', e)
    }
    caseAssigned = true
  }

  await prisma.gemiMatchToken.update({
    where: { token },
    data: {
      chatLog: finalHistory as any,
      tokenUsage: { increment: result.tokensUsed },
      ...(caseAssigned && !matchToken.caseCreatedAt ? { caseCreatedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ reply: result.reply, caseAssigned })
}
