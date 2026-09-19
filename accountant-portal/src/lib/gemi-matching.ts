import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'
import { resolveRegionFromZip } from './greek-regions'
import { normalizeLegalForm } from './legal-forms'
import { isProgramOpen, resolveRegdate } from './matching'
import { evaluateKadCriterion } from './kad-matching'

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
  excludedKadExceptions: string[]
  regionRules: string[]
  zipCodeRules: string[]
  minRegdate: string | null
  maxRegdate: string | null
  excludedLegalForms: string[]
  excludeTags: string[]
  requireTags: string[]
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

  // A fake/test entry with zero registered KAD activity is never a real
  // business, regardless of which criteria (tags, region, etc.) happen to
  // line up — never let it auto-qualify for a business subsidy program.
  // See matching.ts's identical guard for why legal form alone isn't used.
  if (business.activities.length === 0) {
    return { score: 0, reasons: [] }
  }

  const reasons: string[] = []
  const totalCriteria = [
    program.kadRules.length > 0,
    program.regionRules.length > 0,
    program.zipCodeRules.length > 0,
    !!program.minRegdate || !!program.maxRegdate,
  ].filter(Boolean).length

  // A program with no configured criteria at all is meant to be "open to
  // every real business" — the guard above already ensures it's a real one.
  if (totalCriteria === 0) {
    return { score: 50, reasons: ['Γενικό πρόγραμμα χωρίς ειδικά κριτήρια'] }
  }

  let allMatched = true

  if (program.kadRules.length > 0) {
    const kadResult = evaluateKadCriterion(business.activities.map(a => a.firmActCode), program)
    const matchedKad = kadResult.matchedCode ? business.activities.find(a => a.firmActCode === kadResult.matchedCode) : undefined
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
    const resolvedMin = resolveRegdate(program.minRegdate)
    const resolvedMax = resolveRegdate(program.maxRegdate)
    let dateOk = !!regdate
    if (resolvedMin && regdate && regdate < resolvedMin) dateOk = false
    if (resolvedMax && regdate && regdate > resolvedMax) dateOk = false
    if (dateOk && regdate) {
      reasons.push(`Ημερομηνία ίδρυσης: ${regdate.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`)
    } else {
      allMatched = false
    }
  }

  return { score: allMatched ? 100 : 0, reasons: allMatched ? reasons : [] }
}

export async function loadActivePrograms() {
  return prisma.program.findMany({ where: { active: true } })
}

export async function runMatchingForGemi(gemiId: string, programs: Awaited<ReturnType<typeof loadActivePrograms>>): Promise<number> {
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

  // Inactive businesses must never be matched — delete any stale POTENTIAL matches and bail.
  if (business.deactivationFlag === 'Y' || !!business.stopDate) {
    await prisma.gemiProgramMatch.deleteMany({
      where: { gemiId, status: MatchStatus.POTENTIAL },
    })
    await prisma.gemiLookup.update({
      where: { id: gemiId },
      data: { matchingDone: true, matchingDoneAt: new Date() },
    })
    return 0
  }

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
