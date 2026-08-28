import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForGemi, loadActivePrograms } from '@/lib/gemi-matching'
import { runMatchingForBusiness } from '@/lib/matching'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = new Set([
  'https://www.i-mentor.gr',
  'https://i-mentor.gr',
  ...(process.env.ELIGIBILITY_CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean),
])

function cors(origin?: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.i-mentor.gr'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: cors(origin) })
}

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return true
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    })
    const data = await res.json()
    return data.success === true && (data.score ?? 1) >= 0.5
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρη αίτηση' }, { status: 400, headers: cors(origin) })
  }

  const { afm, email, phone, recaptchaToken } = body || {}

  // reCAPTCHA
  if (!recaptchaToken || !(await verifyRecaptcha(String(recaptchaToken)))) {
    return NextResponse.json({ error: 'Επαλήθευση reCAPTCHA απέτυχε. Παρακαλώ δοκιμάστε ξανά.' }, { status: 400, headers: cors(origin) })
  }

  // AFM validation
  const cleanAfm = String(afm || '').replace(/\D/g, '').replace(/^0+/, '').padStart(9, '0')
  if (!/^\d{9}$/.test(cleanAfm)) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ. Εισάγετε ακριβώς 9 ψηφία.' }, { status: 400, headers: cors(origin) })
  }

  // Email validation (required)
  const cleanEmail = String(email || '').trim()
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: 'Παρακαλώ εισάγετε έγκυρο email.' }, { status: 400, headers: cors(origin) })
  }

  // Phone validation (required)
  const cleanPhone = String(phone || '').replace(/\s/g, '')
  if (!cleanPhone || !/^\+?[\d\-]{8,}$/.test(cleanPhone)) {
    return NextResponse.json({ error: 'Παρακαλώ εισάγετε έγκυρο τηλέφωνο.' }, { status: 400, headers: cors(origin) })
  }

  // Find or create GemiLookup record
  let gemi = await prisma.gemiLookup.findUnique({ where: { afm: cleanAfm } })

  if (!gemi || !gemi.aadeEnriched) {
    let aadeData = null
    try {
      aadeData = await lookupAfm(cleanAfm)
    } catch {
      // AADE unreachable — if we have a stale record use it
    }

    if (!aadeData && !gemi) {
      // AFM unknown to AADE — create a stub record to capture the lead and
      // generate a personalized Θέμις link for the Εξωδικαστικός promo.
      let themisUrl: string | null = null
      try {
        const stub = await prisma.gemiLookup.create({
          data: { afm: cleanAfm, email: cleanEmail, phone: cleanPhone, matchingDone: false },
        })
        const extrajudicialProgram = await prisma.program.findFirst({
          where: { category: 'EXTRAJUDICIAL', active: true },
          select: { id: true },
        })
        if (extrajudicialProgram) {
          const baseLink = await getOrCreateGemiErmisLink(stub.id, extrajudicialProgram.id)
          themisUrl = `${baseLink}?type=themis`
        }
      } catch {
        // Non-fatal — fall back to generic URL in the widget
      }
      return NextResponse.json(
        { notFound: true, themisUrl },
        { headers: cors(origin) }
      )
    }

    if (aadeData) {
      const aadeFields = {
        onomasia: aadeData.onomasia,
        legalStatusDescr: aadeData.legalStatusDescr || null,
        postalAddress: aadeData.postalAddress || null,
        postalAddressNo: aadeData.postalAddressNo || null,
        postalZipCode: aadeData.postalZipCode || null,
        postalAreaDescription: aadeData.postalAreaDescription || null,
        doy: aadeData.doy || null,
        doyDescr: aadeData.doyDescr || null,
        regdate: aadeData.regdate || null,
        deactivationFlag: aadeData.deactivationFlag || null,
        stopDate: aadeData.stopDate || null,
        activities: aadeData.activities as any,
        aadeEnriched: true,
        aadeEnrichedAt: new Date(),
        matchingDone: false,
      }
      if (!gemi) {
        gemi = await prisma.gemiLookup.create({
          data: {
            ...aadeFields,
            afm: cleanAfm,
            email: cleanEmail,
            phone: cleanPhone,
          },
        })
      } else {
        gemi = await prisma.gemiLookup.update({
          where: { id: gemi.id },
          data: {
            ...aadeFields,
            ...(cleanEmail && !gemi.email ? { email: cleanEmail } : {}),
            ...(cleanPhone && !gemi.phone ? { phone: cleanPhone } : {}),
          },
        })
      }
    }
  } else {
    // Update contact info if newly provided
    if ((cleanEmail && !gemi.email) || (cleanPhone && !gemi.phone)) {
      gemi = await prisma.gemiLookup.update({
        where: { id: gemi.id },
        data: {
          ...(cleanEmail && !gemi.email ? { email: cleanEmail } : {}),
          ...(cleanPhone && !gemi.phone ? { phone: cleanPhone } : {}),
        },
      })
    }
  }

  // Sync to Business table so the record appears in the normal businesses dashboard
  if (!gemi!.claimedBusinessId) {
    try {
      const existingBusiness = await prisma.business.findUnique({ where: { afm: cleanAfm } })
      if (!existingBusiness) {
        const activities = Array.isArray(gemi!.activities) ? (gemi!.activities as any[]) : []
        const business = await prisma.business.create({
          data: {
            afm: cleanAfm,
            source: 'website-form',
            onomasia: gemi!.onomasia,
            legalStatusDescr: gemi!.legalStatusDescr,
            postalAddress: gemi!.postalAddress,
            postalAddressNo: gemi!.postalAddressNo,
            postalZipCode: gemi!.postalZipCode,
            postalAreaDescription: gemi!.postalAreaDescription,
            doy: gemi!.doy,
            doyDescr: gemi!.doyDescr,
            regdate: gemi!.regdate,
            deactivationFlag: gemi!.deactivationFlag,
            stopDate: gemi!.stopDate,
            email: cleanEmail || undefined,
            phone: cleanPhone || undefined,
            activities: activities.length > 0 ? {
              create: activities.map((a: any) => ({
                firmActCode: a.firmActCode,
                firmActDescr: a.firmActDescr,
                firmActKind: a.firmActKind != null ? parseInt(String(a.firmActKind)) : null,
                firmActKindDescr: a.firmActKindDescr,
              }))
            } : undefined,
          },
        })
        await prisma.gemiLookup.update({
          where: { id: gemi!.id },
          data: { claimedBusinessId: business.id, claimedAt: new Date() },
        })
        runMatchingForBusiness(business.id).catch(err => console.error('[WebsiteWidget] Business matching failed:', err?.message))
      } else {
        await prisma.gemiLookup.update({
          where: { id: gemi!.id },
          data: { claimedBusinessId: existingBusiness.id, claimedAt: new Date() },
        })
      }
    } catch (err: any) {
      // Non-fatal — widget result still shown, business sync failed silently
      console.error('[WebsiteWidget] Business sync failed:', err?.message)
    }
  }

  // Inactive business → no programs
  if (gemi!.deactivationFlag === 'Y' || !!gemi!.stopDate) {
    return NextResponse.json(
      { business: { name: gemi!.onomasia || gemi!.afm }, programs: [], inactive: true },
      { headers: cors(origin) }
    )
  }

  // Run matching if not yet done
  if (!gemi!.matchingDone) {
    const programs = await loadActivePrograms()
    await runMatchingForGemi(gemi!.id, programs)
  }

  // Read matches (exclude manually rejected)
  const matches = await prisma.gemiProgramMatch.findMany({
    where: { gemiId: gemi!.id, status: { not: 'REJECTED' }, matchScore: { gt: 0 } },
    include: {
      program: {
        select: {
          id: true,
          title: true,
          category: true,
          description: true,
          minSubsidyPct: true,
          maxSubsidyPct: true,
          subsidyNote: true,
          minInvestment: true,
          maxInvestment: true,
          minInterestRate: true,
          maxInterestRate: true,
          otherRequirements: true,
          keyPoints: true,
          monthlyAmount: true,
          subsidyMonths: true,
          totalBenefit: true,
          beneficiaries: true,
          regions: true,
          heroImageUrl: true,
          websiteUrl: true,
          active: true,
        },
      },
    },
    orderBy: { matchScore: 'desc' },
  })

  // Only include matches for still-active programs
  type Match = typeof matches[0]
  const activeMatches = matches.filter((m: Match) => m.program.active)

  // Generate Θέμις link — always, so the promo card always has a personalized link
  const gemiId = gemi!.id
  let themisUrl: string | null = null
  try {
    const extrajudicialProgram = await prisma.program.findFirst({
      where: { category: 'EXTRAJUDICIAL', active: true },
      select: { id: true },
    })
    if (extrajudicialProgram) {
      const baseLink = await getOrCreateGemiErmisLink(gemiId, extrajudicialProgram.id)
      themisUrl = `${baseLink}?type=themis`
    }
  } catch {
    // Non-fatal — promo card will fall back to website URL
  }

  if (activeMatches.length === 0) {
    return NextResponse.json(
      { business: { name: gemi!.onomasia || gemi!.afm }, programs: [], themisUrl },
      { headers: cors(origin) }
    )
  }

  // Create Ermis links for each matching program
  const programsWithLinks = await Promise.all(
    activeMatches.map(async (m: Match) => {
      const ermisUrl = await getOrCreateGemiErmisLink(gemiId, m.programId)
      return {
        programId: m.programId,
        category: m.program.category,
        title: m.program.title,
        description: m.program.description,
        minSubsidyPct: m.program.minSubsidyPct,
        maxSubsidyPct: m.program.maxSubsidyPct,
        subsidyNote: m.program.subsidyNote,
        minInvestment: m.program.minInvestment,
        maxInvestment: m.program.maxInvestment,
        minInterestRate: m.program.minInterestRate,
        maxInterestRate: m.program.maxInterestRate,
        otherRequirements: m.program.otherRequirements,
        keyPoints: m.program.keyPoints,
        monthlyAmount: m.program.monthlyAmount,
        subsidyMonths: m.program.subsidyMonths,
        totalBenefit: m.program.totalBenefit,
        beneficiaries: m.program.beneficiaries,
        regions: m.program.regions,
        heroImageUrl: m.program.heroImageUrl,
        websiteUrl: m.program.websiteUrl,
        matchScore: m.matchScore,
        matchReasons: m.matchReason,
        ermisUrl,
      }
    })
  )

  return NextResponse.json(
    { business: { name: gemi!.onomasia || gemi!.afm }, programs: programsWithLinks, themisUrl },
    { headers: cors(origin) }
  )
}
