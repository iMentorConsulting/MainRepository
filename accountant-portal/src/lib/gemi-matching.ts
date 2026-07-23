import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'
import { resolveRegionFromZip } from './greek-regions'
import { normalizeLegalForm } from './legal-forms'
import { isProgramOpen } from './matching'

interface GemiBusinessView {
  id: string
  afm: string
  onomasia: string | null
  postalAreaDescription: string | null
  postalZipCode: string | null
  regdate: string | null
  legalStatusDescr: string | null
  deactivationFlag?: string | null
  stopDate?: string | null
  tags: string[]
  activities: {
    firmActCode: string
    firmActDescr: string | null
  }[]
}

interface ProgramCriteria {
  id: string
  title: string
  kadRules: string[]
  excludedKadRules: string[]
  regionRules: string[]
  zipCodeRules: string[]
  minRegdate: string | null
  maxRegdate: string | null
  excludedLegalForms: string[]
  excludeTags: string[]
  requireTags: string[]
}

function normalizeKad(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
}

function matchesBusiness(
  business: GemiBusinessView,
  program: ProgramCriteria
): { score: number; reasons: string[] } {
  if (program.excludeTags.length > 0 && business.tags.some(t => program.excludeTags.includes(t))) {
    return { score: 0, reasons: [] }
  }
  if (program.requireTags.length > 0 && !program.requireTags.some(t => business.tags.includes(t))) {
    return { score: 0, reasons: [] }
  }
  if (program.excludedLegalForms.length > 0 && program.excludedLegalForms.includes(normalizeLegalForm(business.legalStatusDescr))) {
    return { score: 0, reasons: [] }
  }

  const reasons: string[] = []
  const totalCriteria = [
    program.kadRules.length > 0,
    program.regionRules.length > 0,
    program.zipCodeRules.length > 0,
    !!program.minRegdate || !!program.maxRegdate,
  ].filter(Boolean).length

  if (totalCriteria === 0) {
    return { score: 50, reasons: ['Γενικό πρόγραμμα χωρίς ειδικά κριτήρια'] }
  }

  let allMatched = true

  if (program.kadRules.length > 0) {
    const matchedKad = business.activities.find(activity => {
      const activityCode = normalizeKad(activity.firmActCode)
      const matchesRule = program.kadRules.some(rule => {
        const cleanRule = normalizeKad(rule.trim())
        return cleanRule.includes('.') ? activityCode === cleanRule : activityCode.startsWith(cleanRule)
      })
      if (!matchesRule) return false
      const isExcluded = program.excludedKadRules.some(rule => {
        const cleanRule = normalizeKad(rule.trim())
        return cleanRule.includes('.') ? activityCode === cleanRule : activityCode.startsWith(cleanRule)
      })
      return !isExcluded
    })
    if (matchedKad) {
      reasons.push(`ΚΑΔ: ${matchedKad.firmActCode} - ${matchedKad.firmActDescr || ''}`)
    } else {
      allMatched = false
    }
  }

  if (program.regionRules.length > 0) {
    const businessRegion = resolveRegionFromZip(business.postalZipCode)
    const matchedRegion = businessRegion && program.regionRules.includes(businessRegion)
      ? businessRegion
      : null
    if (matchedRegion) {
      reasons.push(`Περιφέρεια: ${matchedRegion}`)
    } else {
      allMatched = false
    }
  }

  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matchedZip = program.zipCodeRules.find(r => zip.startsWith(r) || zip === r)
    if (matchedZip) {
      reasons.push(`ΤΚ: ${matchedZip}`)
    } else {
      allMatched = false
    }
  }

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
      reasons.push(`Ημερομηνία ίδρυσης: ${regdate.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`)
    } else {
      allMatched = false
    }
  }

  return { score: allMatched ? 100 : 0, reasons: allMatched ? reasons : [] }
}

export async function runMatchingForGemi(gemiId: string): Promise<number> {
  const gemi = await prisma.gemiLookup.findUnique({ where: { id: gemiId } })
  if (!gemi) throw new Error('GemiLookup not found')

  const rawActivities = Array.isArray(gemi.activities)
    ? gemi.activities
    : (typeof gemi.activities === 'string' ? JSON.parse(gemi.activities) : [])

  const activities = (rawActivities as { firmActCode: string; firmActDescr?: string | null }[]).map(a => ({
    firmActCode: a.firmActCode,
    firmActDescr: a.firmActDescr ?? null,
  }))

  const business: GemiBusinessView = {
    id: gemi.id,
    afm: gemi.afm,
    onomasia: gemi.onomasia,
    postalAreaDescription: gemi.postalAreaDescription,
    postalZipCode: gemi.postalZipCode,
    regdate: gemi.regdate,
    legalStatusDescr: gemi.legalStatusDescr,
    deactivationFlag: gemi.deactivationFlag,
    stopDate: gemi.stopDate,
    tags: gemi.tags,
    activities,
  }

  const programs = await prisma.program.findMany({ where: { active: true } })

  let matchCount = 0
  const qualifiedProgramIds: string[] = []

  for (const program of programs) {
    if (!isProgramOpen(program)) continue

    const { score, reasons } = matchesBusiness(business, program)
    if (score <= 0) continue
    qualifiedProgramIds.push(program.id)

    const existing = await prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId, programId: program.id } },
      select: { id: true },
    })

    await prisma.gemiProgramMatch.upsert({
      where: { gemiId_programId: { gemiId, programId: program.id } },
      update: { matchScore: score, matchReason: reasons, updatedAt: new Date() },
      create: {
        gemiId,
        programId: program.id,
        matchScore: score,
        matchReason: reasons,
        status: MatchStatus.POTENTIAL,
      },
    })

    if (!existing) matchCount++
  }

  // Remove stale matches: programs that no longer qualify after criteria
  // changes. Preserve non-POTENTIAL statuses (INTERESTED etc. carry history).
  await prisma.gemiProgramMatch.deleteMany({
    where: {
      gemiId,
      status: MatchStatus.POTENTIAL,
      ...(qualifiedProgramIds.length ? { programId: { notIn: qualifiedProgramIds } } : {}),
    },
  })

  await prisma.gemiLookup.update({
    where: { id: gemiId },
    data: { matchingDone: true, matchingDoneAt: new Date() },
  })

  return matchCount
}
