import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

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

// Sends the ermis.business_ready or ermis.completed webhook back to CM.
export async function sendErmisWebhook(params: {
  callbackUrl: string
  event: 'ermis.business_ready' | 'ermis.completed' | 'ermis.progress'
  token: string
  leadRef: string | null
  afm: string
  businessProfile: any
  eligibility?: string | null
  transcript?: any[] | null
  completedAt?: string | null
}) {
  const apiKey = process.env.CASES_API_KEY
  if (!apiKey) return
  try {
    await fetch(params.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        event: params.event,
        token: params.token,
        leadRef: params.leadRef,
        afm: params.afm,
        business: params.businessProfile,
        matchedPrograms: params.businessProfile?.matchedPrograms ?? [],
        ...(params.eligibility !== undefined ? { eligibility: params.eligibility } : {}),
        ...(params.transcript !== undefined ? { transcript: params.transcript } : {}),
        ...(params.completedAt !== undefined ? { completedAt: params.completedAt } : {}),
      }),
    })
  } catch (err: any) {
    console.error('[ErmisWebhook] failed:', err?.message)
  }
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { leadRef, afm, program: programName, serviceType, callbackUrl, consultant, contextSummary, lead } = body

  if (!afm || !programName) {
    return NextResponse.json({ error: 'afm and program are required' }, { status: 400 })
  }

  const afmStr = String(afm).trim()

  // 1. Find program in DB by name — match on stem to handle vocabulary differences
  // (CM sends "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ"; DB title is "ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ")
  const stem = programName.toUpperCase().substring(0, Math.max(6, programName.length - 3))
  const dbProgram = await prisma.program.findFirst({
    where: {
      active: true,
      OR: [
        { title: { contains: stem, mode: 'insensitive' } },
        { title: { equals: programName, mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true },
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

    // Run program matching for the new business (fire-and-forget)
    runMatchingForBusiness(business.id).catch(() => {})
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

  // 4. Create or update the Ερμής session token for this business+program
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  const matchToken = await prisma.businessMatchToken.upsert({
    where: { businessId_programId: { businessId: business.id, programId: dbProgram.id } },
    update: {
      leadRef: leadRef ? String(leadRef) : null,
      callbackUrl: callbackUrl || null,
      contextSummary: contextSummary || lead?.contextSummary || null,
      consultant: consultant || lead?.consultant || null,
      expiresAt,
      // Reset conversation when CM sends a new lead for the same business+program
      chatLog: undefined,
      caseCreatedId: null,
      tokenUsage: 0,
      tokenUsageInput: 0,
      tokenUsageOutput: 0,
      eligibilityStatus: null,
      intentStatus: null,
    },
    create: {
      businessId: business.id,
      programId: dbProgram.id,
      leadRef: leadRef ? String(leadRef) : null,
      callbackUrl: callbackUrl || null,
      contextSummary: contextSummary || lead?.contextSummary || null,
      consultant: consultant || lead?.consultant || null,
      expiresAt,
    },
    select: { token: true },
  })

  const token = matchToken.token
  const chatUrl = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/match/${token}`

  // 5. Fire ermis.business_ready webhook to CM (fire-and-forget)
  if (callbackUrl) {
    ;(async () => {
      // Wait briefly for matching to settle (it's fire-and-forget above)
      await new Promise(r => setTimeout(r, 3000))
      const profile = await buildBusinessProfilePayload(business!)
      await sendErmisWebhook({
        callbackUrl,
        event: 'ermis.business_ready',
        token,
        leadRef: leadRef ? String(leadRef) : null,
        afm: afmStr,
        businessProfile: profile,
      })
    })().catch(() => {})
  }

  return NextResponse.json({ token, chatUrl })
}
