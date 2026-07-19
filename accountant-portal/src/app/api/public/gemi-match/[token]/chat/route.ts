import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runErmisTurn, type ChatMessage } from '@/lib/ermis-agent'
import { buildEligibilityQuestions, parseEligibilityStorage } from '@/lib/eligibility-questions'

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

  await prisma.clientCase.create({
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
  })
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
