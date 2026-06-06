import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'

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
  let score = 0
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

  let matchedCriteria = 0

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
      matchedCriteria++
      reasons.push(`Επιλέξιμος ΚΑΔ: ${matchedKad.firmActCode} - ${matchedKad.firmActDescr || ''}`)
    }
  }

  // Region matching
  if (program.regionRules.length > 0) {
    const area = business.postalAreaDescription?.toLowerCase() || ''
    const matchedRegion = program.regionRules.find(r =>
      area.includes(r.toLowerCase()) || r.toLowerCase().includes(area)
    )
    if (matchedRegion) {
      matchedCriteria++
      reasons.push(`Επιλέξιμη περιοχή: ${matchedRegion}`)
    }
  }

  // ZIP matching
  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matchedZip = program.zipCodeRules.find(r => zip.startsWith(r) || zip === r)
    if (matchedZip) {
      matchedCriteria++
      reasons.push(`Επιλέξιμος ΤΚ: ${matchedZip}`)
    }
  }

  // Date matching
  if (program.minRegdate || program.maxRegdate) {
    const regdate = business.regdate ? new Date(business.regdate) : null
    let dateOk = true
    if (program.minRegdate && regdate) {
      if (regdate < new Date(program.minRegdate)) dateOk = false
    }
    if (program.maxRegdate && regdate) {
      if (regdate > new Date(program.maxRegdate)) dateOk = false
    }
    if (dateOk && regdate) {
      matchedCriteria++
      reasons.push(`Επιλέξιμη ημερομηνία ίδρυσης: ${business.regdate}`)
    }
  }

  // Legal status matching
  if (program.legalStatusRules.length > 0) {
    const legalStatus = business.legalStatusDescr || ''
    const matchedStatus = program.legalStatusRules.find(r =>
      legalStatus.toLowerCase().includes(r.toLowerCase())
    )
    if (matchedStatus) {
      matchedCriteria++
      reasons.push(`Επιλέξιμη νομική μορφή: ${matchedStatus}`)
    }
  }

  score = totalCriteria > 0 ? Math.round((matchedCriteria / totalCriteria) * 100) : 0
  return { score, reasons }
}

export async function runMatchingForProgram(programId: string): Promise<number> {
  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) throw new Error('Program not found')

  const businesses = await prisma.business.findMany({
    include: { activities: true }
  })

  let matchCount = 0

  for (const business of businesses) {
    const { score, reasons } = matchesBusiness(business, program)

    if (score >= 40) {
      await prisma.programMatch.upsert({
        where: { programId_businessId: { programId, businessId: business.id } },
        update: { matchScore: score, matchReason: reasons, updatedAt: new Date() },
        create: {
          programId,
          businessId: business.id,
          matchScore: score,
          matchReason: reasons,
          status: MatchStatus.POTENTIAL
        }
      })
      matchCount++
    }
  }

  return matchCount
}
