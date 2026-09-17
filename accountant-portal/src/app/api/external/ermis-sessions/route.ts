import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'
import { CM_CATEGORY_LABEL, buildProgramDescription, buildErmisViberMessage } from '@/lib/ermis-program-payload'
import { sendViberMessage } from '@/lib/viber'
import { sendErmisWebhook } from '@/lib/ermis-webhook'

// POST /api/external/ermis-sessions
// Called by Case Management when a lead enters the Ερμής screening flow.
// Auth: x-api-key: CASES_API_KEY (same shared secret as /api/external/cases)

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

function applySoleProprietorFix(gsisData: any) {
  let onomasia = gsisData?.onomasia || ''
  let legalStatusDescr = gsisData?.legalStatusDescr || ''
  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) onomasia = parts.slice(0, 2).join(' ')
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }
  return { onomasia: onomasia || null, legalStatusDescr: legalStatusDescr || null }
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { leadRef, afm, program: programName, serviceType, callbackUrl, consultant, contextSummary, lead } = body

  if (!afm || !programName) {
    return NextResponse.json({ error: 'afm and program are required' }, { status: 400 })
  }

  const afmStr = String(afm).trim()

  // 1. Find the primary program in DB by name — match on stem to handle
  // vocabulary differences (CM sends "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"; DB title is "ΤΑΜΕΙΟ
  // ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ"). Full row (no select) — needed below both as the
  // fallback matchedPrograms entry and for its description fields.
  const stem = programName.toUpperCase().substring(0, Math.max(6, programName.length - 3))
  const dbProgram = await prisma.program.findFirst({
    where: {
      active: true,
      OR: [
        { title: { contains: stem, mode: 'insensitive' } },
        { title: { equals: programName, mode: 'insensitive' } },
      ],
    },
  })

  if (!dbProgram) {
    return NextResponse.json({
      error: `Δεν βρέθηκε ενεργό πρόγραμμα για "${programName}". Ελέγξτε τη λίστα προγραμμάτων στο Logistis.`,
    }, { status: 422 })
  }

  // 2. Find or create business (never re-lookup AADE for an existing record)
  let business = await prisma.business.findUnique({
    where: { afm: afmStr },
    select: { ...BUSINESS_PROFILE_SELECT, id: true },
  })

  if (!business) {
    // One AADE lookup for new businesses
    let gsisData: any = null
    try { gsisData = await lookupAfm(afmStr) } catch { gsisData = null }

    const fix = gsisData ? applySoleProprietorFix(gsisData) : null

    const created = await prisma.business.create({
      data: {
        afm: afmStr,
        email: lead?.email || null,
        phone: lead?.phone || lead?.phone2 || null,
        source: 'ermis-lead',
        legalStatusDescr: fix?.legalStatusDescr ?? (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
        onomasia: fix?.onomasia ?? gsisData?.onomasia ?? null,
        commercialTitle: gsisData?.commercialTitle ?? null,
        regdate: gsisData?.regdate ?? null,
        postalAddress: gsisData?.postalAddress ?? null,
        postalAddressNo: gsisData?.postalAddressNo ?? null,
        postalZipCode: gsisData?.postalZipCode ?? null,
        postalAreaDescription: gsisData?.postalAreaDescription ?? null,
        doy: gsisData?.doy ?? null,
        doyDescr: gsisData?.doyDescr ?? null,
        tags: [],
        activities: gsisData?.activities?.length ? {
          create: gsisData.activities.map((a: any) => ({
            firmActCode: a.firmActCode,
            firmActDescr: a.firmActDescr,
            firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
            firmActKindDescr: a.firmActKindDescr,
          })),
        } : undefined,
      },
      select: { ...BUSINESS_PROFILE_SELECT, id: true },
    })
    business = created
    // Matching (all programs, not just the primary) runs in the background
    // block below regardless of whether the business is new or existing.
  }

  // 3. Log lead interest (always — records every CM lead event, even for existing businesses)
  await prisma.businessLeadInterest.create({
    data: {
      businessId: business.id,
      program: programName,
      serviceType: serviceType || null,
      leadRef: leadRef ? String(leadRef) : null,
      source: 'ermis-lead',
    },
  })

  // 3b. Auto-tag the business with the program name (fire-and-forget)
  ;(async () => {
    const tag = programName.trim()
    if (!tag) return
    const existing = await prisma.tagOption.findFirst({ where: { label: tag } })
    if (!existing) {
      const count = await prisma.tagOption.count()
      await prisma.tagOption.create({ data: { label: tag, order: count } })
    }
    const biz = await prisma.business.findUnique({ where: { id: business!.id }, select: { tags: true } })
    if (biz && !biz.tags.includes(tag)) {
      await prisma.business.update({ where: { id: business!.id }, data: { tags: [...biz.tags, tag] } })
    }
  })().catch(() => {})

  // 4. Create or update the PRIMARY Ερμής session token for this business+program
  // — this is the one CM's session-creation call gets back immediately.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const leadRefStr = leadRef ? String(leadRef) : null

  const matchToken = await prisma.businessMatchToken.upsert({
    where: { businessId_programId: { businessId: business.id, programId: dbProgram.id } },
    update: {
      leadRef: leadRefStr,
      callbackUrl: callbackUrl || null,
      contactEmail: lead?.email || null,
      contactPhone: lead?.phone || lead?.phone2 || null,
      contextSummary: contextSummary || lead?.contextSummary || null,
      consultant: consultant || lead?.consultant || null,
      expiresAt,
      isPrimary: true,
      // Reset conversation when CM sends a new lead for the same business+program
      chatLog: undefined,
      caseCreatedId: null,
      tokenUsage: 0,
      tokenUsageInput: 0,
      tokenUsageOutput: 0,
      eligibilityStatus: null,
      intentStatus: null,
      reminder1SentAt: null,
      reminder2SentAt: null,
      clientRepliedAt: null,
      lastActivityAt: null,
    },
    create: {
      businessId: business.id,
      programId: dbProgram.id,
      leadRef: leadRefStr,
      callbackUrl: callbackUrl || null,
      contactEmail: lead?.email || null,
      contactPhone: lead?.phone || lead?.phone2 || null,
      contextSummary: contextSummary || lead?.contextSummary || null,
      consultant: consultant || lead?.consultant || null,
      expiresAt,
      isPrimary: true,
    },
    select: { token: true },
  })

  const token = matchToken.token
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const chatUrl = `${appUrl}/match/${token}`

  // 5. Multi-program matching + ermis.business_ready webhook (fire-and-forget,
  // doesn't block the response above — CM now calls this on every website
  // form submission, so the primary token must come back fast).
  if (callbackUrl) {
    ;(async () => {
      const { results } = await runMatchingForBusiness(business!.id)

      // Only truly eligible programs are sent to CM — a non-eligible entry
      // has no session/chatUrl anyway, and including it was meant as
      // "context for the Logistis UI" but CM's lead list doesn't filter it
      // out, so every considered program (any region, any KAD) was showing
      // up as if it were a real eligibility match. One entry per eligible
      // program; secondary ones (not the primary already handled above) get
      // their own session token created here, with no leadRef — CM routes
      // their ermis.completed back to the right sibling lead purely by token.
      const matchedPrograms = await Promise.all(
        results.filter(r => r.eligible).map(async ({ program }) => {
          const isPrimaryProgram = program.id === dbProgram!.id
          let entryToken: string
          let entryChatUrl: string

          if (isPrimaryProgram) {
            entryToken = token
            entryChatUrl = chatUrl
          } else {
            const secondary = await prisma.businessMatchToken.upsert({
              where: { businessId_programId: { businessId: business!.id, programId: program.id } },
              update: {
                callbackUrl: callbackUrl || null,
                contactEmail: lead?.email || null,
                contactPhone: lead?.phone || lead?.phone2 || null,
                contextSummary: contextSummary || lead?.contextSummary || null,
                consultant: consultant || lead?.consultant || null,
                expiresAt,
                isPrimary: false,
                leadRef: null,
                chatLog: undefined,
                caseCreatedId: null,
                tokenUsage: 0,
                tokenUsageInput: 0,
                tokenUsageOutput: 0,
                eligibilityStatus: null,
                intentStatus: null,
                reminder1SentAt: null,
                reminder2SentAt: null,
                clientRepliedAt: null,
                lastActivityAt: null,
              },
              create: {
                businessId: business!.id,
                programId: program.id,
                callbackUrl: callbackUrl || null,
                contactEmail: lead?.email || null,
                contactPhone: lead?.phone || lead?.phone2 || null,
                contextSummary: contextSummary || lead?.contextSummary || null,
                consultant: consultant || lead?.consultant || null,
                expiresAt,
                isPrimary: false,
                leadRef: null,
              },
              select: { token: true },
            })
            entryToken = secondary.token
            entryChatUrl = `${appUrl}/match/${secondary.token}`
          }

          return {
            title: program.title,
            program: CM_CATEGORY_LABEL[program.category] || program.category,
            token: entryToken,
            chatUrl: entryChatUrl,
            isEligible: true,
            isPrimary: isPrimaryProgram,
            description: buildProgramDescription(program),
          }
        })
      )

      // Edge case: the primary program closed (or was otherwise excluded)
      // between session creation and this matching run — still represent it
      // so CM always sees exactly one isPrimary entry.
      if (!matchedPrograms.some(p => p.isPrimary)) {
        matchedPrograms.unshift({
          title: dbProgram!.title,
          program: CM_CATEGORY_LABEL[dbProgram!.category] || dbProgram!.category,
          token,
          chatUrl,
          isEligible: true,
          isPrimary: true,
          description: buildProgramDescription(dbProgram!),
        })
      }

      // The primary program (the one the client actually asked about) must
      // always be first — CM's client-facing message renders in array order.
      matchedPrograms.sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1))

      // Immediate client-facing Viber — "here's what you're eligible for,
      // go chat with Ermis" — separate from the ermis-reminders cron's later
      // "still there?" nudge. Approved wording, see ermis-program-payload.ts.
      const contactPhoneStr = lead?.phone || lead?.phone2 || null
      const eligibleForViber = matchedPrograms.filter(p => p.isEligible && p.chatUrl)
      if (contactPhoneStr && eligibleForViber.length > 0) {
        const text = buildErmisViberMessage({
          businessName: business!.onomasia || business!.commercialTitle || afmStr,
          eligiblePrograms: eligibleForViber.map(p => ({ title: p.title, chatUrl: p.chatUrl })),
          consultant: consultant || lead?.consultant || null,
        })
        sendViberMessage({ to: contactPhoneStr, text, senderName: 'iMentor Consulting' })
          .catch(err => console.error('[ErmisSession] client Viber failed:', err?.message))
      }

      const profile = await buildBusinessProfilePayload(business!)
      await sendErmisWebhook({
        callbackUrl,
        event: 'ermis.business_ready',
        token,
        leadRef: leadRefStr,
        afm: afmStr,
        businessProfile: profile,
        matchedPrograms,
      })
    })().catch(err => console.error('[ErmisSession] multi-program matching/webhook failed:', err?.message))
  }

  return NextResponse.json({ token, chatUrl })
}
