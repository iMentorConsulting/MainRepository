// Core "given an ΑΦΜ (+ email/phone), find or enrich the GEMI record, run
// multi-program matching, and build per-program Ermis chat links" logic —
// shared by the on-page eligibility widget (/api/public/eligibility-check)
// and any other trigger that wants the same result (e.g. a Moosend signup
// webhook), so both stay behaviorally identical instead of drifting apart.
import { prisma } from './prisma'
import { lookupAfm } from './gsis'
import { runMatchingForGemi, loadActivePrograms } from './gemi-matching'
import { runMatchingForBusiness } from './matching'
import { getOrCreateGemiErmisLink } from './gemi-ermis'
import { buildAadeBusinessDetails, type AadeBusinessDetails } from './business-profile'

export interface EligibilityProgramResult {
  programId: string
  category: string
  title: string
  description: string | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  subsidyNote: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  otherRequirements: string | null
  keyPoints: string[]
  monthlyAmount: string | null
  subsidyMonths: string | null
  totalBenefit: string | null
  beneficiaries: string | null
  regions: string | null
  heroImageUrl: string | null
  websiteUrl: string | null
  matchScore: number
  matchReasons: string[]
  ermisUrl: string
}

export type EligibilityBusinessDetails = AadeBusinessDetails

export interface EligibilityCheckResult {
  gemiId: string | null
  businessName: string | null
  notFound?: boolean
  inactive?: boolean
  programs: EligibilityProgramResult[]
  themisUrl: string | null
  businessDetails?: EligibilityBusinessDetails
}

function buildBusinessDetails(gemi: {
  afm: string
  onomasia: string | null
  postalAddress: string | null
  postalAddressNo: string | null
  postalZipCode: string | null
  postalAreaDescription: string | null
  activities: unknown
}): EligibilityBusinessDetails {
  const activities = Array.isArray(gemi.activities) ? (gemi.activities as any[]) : []
  return buildAadeBusinessDetails({
    ...gemi,
    activities: activities.map(a => ({
      firmActCode: a?.firmActCode,
      firmActDescr: a?.firmActDescr ?? null,
      firmActKind: a?.firmActKind != null ? parseInt(String(a.firmActKind)) : null,
    })),
  })
}

// afm must already be the cleaned 9-digit string; email/phone are optional
// (used to fill in contact info on first sight, never overwritten after).
export async function checkEligibilityForAfm(cleanAfm: string, email?: string | null, phone?: string | null): Promise<EligibilityCheckResult> {
  const cleanEmail = (email || '').trim()
  const cleanPhone = (phone || '').replace(/\s/g, '')

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
        const stub = await prisma.gemiLookup.upsert({
          where: { afm: cleanAfm },
          create: { afm: cleanAfm, email: cleanEmail || null, phone: cleanPhone || null, matchingDone: false },
          update: {
            ...(cleanEmail ? { email: cleanEmail } : {}),
            ...(cleanPhone ? { phone: cleanPhone } : {}),
          },
        })
        const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
        themisUrl = `${appUrl}/gemi-entry/g/${stub.id}?type=themis`

        // Even with no AADE data, this is still a real lead that submitted
        // the form/webhook — it must land in the normal Business table, not
        // just sit as a bare GEMI stub, so accountants/consultants can
        // follow up on it like any other business.
        if (!stub.claimedBusinessId) {
          let business = await prisma.business.findUnique({ where: { afm: cleanAfm } })
          if (!business) {
            try {
              business = await prisma.business.create({
                data: {
                  afm: cleanAfm,
                  source: 'website-form',
                  legalStatusDescr: 'ΙΔΙΩΤΗΣ',
                  email: cleanEmail || undefined,
                  phone: cleanPhone || undefined,
                },
              })
            } catch (createErr: any) {
              if (createErr?.code === 'P2002') {
                business = await prisma.business.findUnique({ where: { afm: cleanAfm } })
              } else {
                throw createErr
              }
            }
          }
          if (business) {
            await prisma.gemiLookup.update({
              where: { id: stub.id },
              data: { claimedBusinessId: business.id, claimedAt: new Date() },
            })
          }
        }
      } catch (err: any) {
        console.error('[EligibilityCheck] stub/Business sync failed:', err?.message)
      }
      return { gemiId: null, businessName: null, notFound: true, programs: [], themisUrl }
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
          data: { ...aadeFields, afm: cleanAfm, email: cleanEmail || null, phone: cleanPhone || null },
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
  } else if ((cleanEmail && !gemi.email) || (cleanPhone && !gemi.phone)) {
    gemi = await prisma.gemiLookup.update({
      where: { id: gemi.id },
      data: {
        ...(cleanEmail && !gemi.email ? { email: cleanEmail } : {}),
        ...(cleanPhone && !gemi.phone ? { phone: cleanPhone } : {}),
      },
    })
  }

  // Sync to Business table so the record appears in the normal businesses dashboard
  if (!gemi!.claimedBusinessId) {
    try {
      let existingBusiness = await prisma.business.findUnique({ where: { afm: cleanAfm } })
      if (!existingBusiness) {
        const activities = Array.isArray(gemi!.activities) ? (gemi!.activities as any[]) : []
        let createdBusiness: { id: string } | null = null
        try {
          createdBusiness = await prisma.business.create({
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
        } catch (createErr: any) {
          // Unique constraint on afm — a concurrent request (e.g. a
          // double-submit) created it a moment ago. Fall through to link
          // the now-existing record instead of losing this sync entirely.
          if (createErr?.code === 'P2002') {
            existingBusiness = await prisma.business.findUnique({ where: { afm: cleanAfm } })
          } else {
            throw createErr
          }
        }

        if (createdBusiness) {
          await prisma.gemiLookup.update({
            where: { id: gemi!.id },
            data: { claimedBusinessId: createdBusiness.id, claimedAt: new Date() },
          })
          runMatchingForBusiness(createdBusiness.id).catch(err => console.error('[EligibilityCheck] Business matching failed:', err?.message))
        }
      }

      if (existingBusiness) {
        await prisma.gemiLookup.update({
          where: { id: gemi!.id },
          data: { claimedBusinessId: existingBusiness.id, claimedAt: new Date() },
        })
      }
    } catch (err: any) {
      console.error('[EligibilityCheck] Business sync failed:', err?.message)
    }
  }

  const gemiId = gemi!.id
  const businessDetails = buildBusinessDetails(gemi!)

  // Inactive business → no programs
  if (gemi!.deactivationFlag === 'Y' || !!gemi!.stopDate) {
    return { gemiId, businessName: gemi!.onomasia || gemi!.afm, inactive: true, programs: [], themisUrl: null, businessDetails }
  }

  if (!gemi!.matchingDone) {
    const programs = await loadActivePrograms()
    await runMatchingForGemi(gemiId, programs)
  }

  const matches = await prisma.gemiProgramMatch.findMany({
    where: { gemiId, status: { not: 'REJECTED' }, matchScore: { gt: 0 } },
    include: {
      program: {
        select: {
          id: true, title: true, category: true, description: true,
          minSubsidyPct: true, maxSubsidyPct: true, subsidyNote: true,
          minInvestment: true, maxInvestment: true,
          minInterestRate: true, maxInterestRate: true,
          otherRequirements: true, keyPoints: true,
          monthlyAmount: true, subsidyMonths: true, totalBenefit: true,
          beneficiaries: true, regions: true,
          heroImageUrl: true, websiteUrl: true, active: true,
        },
      },
    },
    orderBy: { matchScore: 'desc' },
  })

  type Match = typeof matches[0]
  const activeMatches = matches.filter((m: Match) => m.program.active)

  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

  if (activeMatches.length === 0) {
    const themisUrl = `${appUrl}/gemi-entry/g/${gemiId}?type=themis`
    return { gemiId, businessName: gemi!.onomasia || gemi!.afm, programs: [], themisUrl, businessDetails }
  }

  const programsWithLinks: EligibilityProgramResult[] = await Promise.all(
    activeMatches.map(async (m: Match) => {
      const ermisUrl = await getOrCreateGemiErmisLink(gemiId, m.programId, gemi!.phone)
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

  const exMatch = programsWithLinks.find(p => p.category === 'EXTRAJUDICIAL')
  const themisUrl = exMatch
    ? `${exMatch.ermisUrl}?type=themis`
    : `${appUrl}/gemi-entry/g/${gemiId}?type=themis`

  return { gemiId, businessName: gemi!.onomasia || gemi!.afm, programs: programsWithLinks, themisUrl, businessDetails }
}
