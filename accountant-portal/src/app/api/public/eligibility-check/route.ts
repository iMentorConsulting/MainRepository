import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForGemi, loadActivePrograms } from '@/lib/gemi-matching'
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
      return NextResponse.json(
        { error: 'Δεν βρέθηκαν στοιχεία για το ΑΦΜ που καταχωρήσατε. Ελέγξτε ότι το ΑΦΜ είναι σωστό.' },
        { status: 404, headers: cors(origin) }
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

  if (activeMatches.length === 0) {
    return NextResponse.json(
      { business: { name: gemi!.onomasia || gemi!.afm }, programs: [] },
      { headers: cors(origin) }
    )
  }

  // Create Ermis links for each matching program
  const gemiId = gemi!.id
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
    { business: { name: gemi!.onomasia || gemi!.afm }, programs: programsWithLinks },
    { headers: cors(origin) }
  )
}
