import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForGemi, loadActivePrograms } from '@/lib/gemi-matching'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = (process.env.ELIGIBILITY_CORS_ORIGIN || 'https://www.i-mentor.gr,https://i-mentor.gr')
  .split(',')
  .map(o => o.trim())

function cors(origin?: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
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
            email: email || null,
            phone: phone || null,
          },
        })
      } else {
        gemi = await prisma.gemiLookup.update({
          where: { id: gemi.id },
          data: {
            ...aadeFields,
            ...(email && !gemi.email ? { email } : {}),
            ...(phone && !gemi.phone ? { phone } : {}),
          },
        })
      }
    }
  } else {
    // Update contact info if newly provided
    if ((email && !gemi.email) || (phone && !gemi.phone)) {
      gemi = await prisma.gemiLookup.update({
        where: { id: gemi.id },
        data: {
          ...(email && !gemi.email ? { email } : {}),
          ...(phone && !gemi.phone ? { phone } : {}),
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
          description: true,
          minSubsidyPct: true,
          maxSubsidyPct: true,
          minInvestment: true,
          maxInvestment: true,
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
        title: m.program.title,
        description: m.program.description,
        minSubsidyPct: m.program.minSubsidyPct,
        maxSubsidyPct: m.program.maxSubsidyPct,
        minInvestment: m.program.minInvestment,
        maxInvestment: m.program.maxInvestment,
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
