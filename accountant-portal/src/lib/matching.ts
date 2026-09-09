import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'
import { resolveRegionFromZip } from './greek-regions'

interface BusinessWithActivities {
  id: string
  afm: string
  onomasia: string | null
  postalAreaDescription: string | null
  postalZipCode: string | null
  regdate: string | null
  legalStatusDescr: string | null
  activities: {
    firmActCode: string
    firmActDescr: string | null
  }[]
}

interface ProgramCriteria {
  id: string
  title: string
  kadRules: string[]
  regionRules: string[]
  zipCodeRules: string[]
  minRegdate: string | null
  maxRegdate: string | null
  legalStatusRules: string[]
}

function matchesBusiness(
  business: BusinessWithActivities,
  program: ProgramCriteria
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const totalCriteria = [
    program.kadRules.length > 0,
    program.regionRules.length > 0,
    program.zipCodeRules.length > 0,
    !!program.minRegdate || !!program.maxRegdate,
    program.legalStatusRules.length > 0,
  ].filter(Boolean).length

  if (totalCriteria === 0) {
    return { score: 50, reasons: ['Γενικό πρόγραμμα χωρίς ειδικά κριτήρια'] }
  }

  let allMatched = true

  // KAD matching
  if (program.kadRules.length > 0) {
    const matchedKad = business.activities.find(activity => {
      return program.kadRules.some(rule => {
        const cleanRule = rule.trim()
        if (cleanRule.includes('.')) {
          return activity.firmActCode === cleanRule
        }
        return activity.firmActCode.startsWith(cleanRule)
      })
    })
    if (matchedKad) {
      reasons.push(`Επιλέξιμος ΚΑΔ: ${matchedKad.firmActCode} - ${matchedKad.firmActDescr || ''}`)
    } else {
      allMatched = false
    }
  }

  // Region matching — resolve the business's Greek region ("Περιφέρεια")
  // from its postal code and compare against the program's selected regions.
  if (program.regionRules.length > 0) {
    const businessRegion = resolveRegionFromZip(business.postalZipCode)
    const matchedRegion = businessRegion && program.regionRules.includes(businessRegion)
      ? businessRegion
      : null
    if (matchedRegion) {
      reasons.push(`Επιλέξιμη περιφέρεια: ${matchedRegion}`)
    } else {
      allMatched = false
    }
  }

  // ZIP matching
  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matchedZip = program.zipCodeRules.find(r => zip.startsWith(r) || zip === r)
    if (matchedZip) {
      reasons.push(`Επιλέξιμος ΤΚ: ${matchedZip}`)
    } else {
      allMatched = false
    }
  }

  // Date matching
  if (program.minRegdate || program.maxRegdate) {
    const regdate = business.regdate ? new Date(business.regdate) : null
    let dateOk = !!regdate
    if (program.minRegdate && regdate) {
      if (regdate < new Date(program.minRegdate)) dateOk = false
    }
    if (program.maxRegdate && regdate) {
      if (regdate > new Date(program.maxRegdate)) dateOk = false
    }
    if (dateOk && regdate) {
      reasons.push(`Επιλέξιμη ημερομηνία ίδρυσης: ${business.regdate}`)
    } else {
      allMatched = false
    }
  }

  // Legal status matching
  if (program.legalStatusRules.length > 0) {
    const legalStatus = business.legalStatusDescr || ''
    const matchedStatus = program.legalStatusRules.find(r =>
      legalStatus.toLowerCase().includes(r.toLowerCase())
    )
    if (matchedStatus) {
      reasons.push(`Επιλέξιμη νομική μορφή: ${matchedStatus}`)
    } else {
      allMatched = false
    }
  }

  return { score: allMatched ? 100 : 0, reasons: allMatched ? reasons : [] }
}

// Returns true if a NEW match was created (not an update to an existing one).
async function upsertMatch(programId: string, businessId: string, score: number, reasons: string[]): Promise<boolean> {
  if (score < 40) return false
  const existing = await prisma.programMatch.findUnique({
    where: { programId_businessId: { programId, businessId } },
    select: { id: true },
  })
  await prisma.programMatch.upsert({
    where: { programId_businessId: { programId, businessId } },
    update: { matchScore: score, matchReason: reasons, updatedAt: new Date() },
    create: {
      programId,
      businessId,
      matchScore: score,
      matchReason: reasons,
      status: MatchStatus.POTENTIAL,
      notified: false,
    }
  })
  return !existing
}

// Removes stale matches that no longer satisfy the program criteria.
// Only POTENTIAL matches are reset — matches the accountant has already
// reviewed or acted upon are preserved.
async function resetStaleMatches(programId: string, qualifyingBusinessIds: string[]) {
  await prisma.programMatch.deleteMany({
    where: {
      programId,
      status: MatchStatus.POTENTIAL,
      businessId: { notIn: qualifyingBusinessIds }
    }
  })
}

export async function runMatchingForProgram(programId: string): Promise<number> {
  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) throw new Error('Program not found')

  const businesses = await prisma.business.findMany({
    include: { activities: true }
  })

  let matchCount = 0
  const qualifyingBusinessIds: string[] = []

  for (const business of businesses) {
    const { score, reasons } = matchesBusiness(business, program)
    if (score >= 40) qualifyingBusinessIds.push(business.id)
    const isNew = await upsertMatch(programId, business.id, score, reasons)
    if (isNew) matchCount++
  }

  await resetStaleMatches(programId, qualifyingBusinessIds)

  return matchCount
}

export async function runMatchingForBusiness(businessId: string): Promise<number> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { activities: true }
  })
  if (!business) throw new Error('Business not found')

  const programs = await prisma.program.findMany({ where: { active: true } })

  let matchCount = 0

  for (const program of programs) {
    const { score, reasons } = matchesBusiness(business, program)
    const isNew = await upsertMatch(program.id, business.id, score, reasons)
    if (isNew) matchCount++
    if (score < 40) {
      await prisma.programMatch.deleteMany({
        where: { programId: program.id, businessId, status: MatchStatus.POTENTIAL }
      })
    }
  }

  return matchCount
}
