import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'
import { resolveRegionFromZip } from './greek-regions'
import { sendEmail } from './email'

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
      status: MatchStatus.POTENTIAL
    }
  })
  return !existing
}

async function notifyAccountant(accountantId: string, newMatchCount: number, programTitles: string[]) {
  const accountant = await prisma.accountant.findUnique({
    where: { id: accountantId },
    select: { email: true, contactPerson: true, officeName: true },
  })
  if (!accountant) return

  const title = `${newMatchCount} νέα match${newMatchCount === 1 ? '' : 'es'} για τους πελάτες σας!`
  const body = `Βρέθηκαν νέες ευκαιρίες χρηματοδότησης για ${newMatchCount} πελάτ${newMatchCount === 1 ? 'η' : 'ες'} σας (${programTitles.slice(0, 3).join(', ')}${programTitles.length > 3 ? ' κ.α.' : ''}). Στείλτε καμπάνια τώρα!`

  await prisma.notification.create({
    data: {
      accountantId,
      type: 'NEW_MATCHES',
      title,
      body,
      link: '/matches',
    },
  })

  await sendEmail({
    to: accountant.email,
    subject: `🎯 ${title} — I-MENTOR Portal`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🎯 Νέες Ευκαιρίες για τους Πελάτες σας!</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
          <p style="color: #374151; font-size: 16px;">
            Το σύστημα I-MENTOR εντόπισε <strong style="color: #4f46e5; font-size: 20px;">${newMatchCount} νέα match${newMatchCount === 1 ? '' : 'es'}</strong> για τους πελάτες σας!
          </p>
          <p style="color: #6b7280; font-size: 14px;">Προγράμματα: <em>${programTitles.slice(0, 5).join(', ')}${programTitles.length > 5 ? ' και άλλα...' : ''}</em></p>
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: bold;">
              ⏰ Μην χάσετε την ευκαιρία!
            </p>
            <p style="margin: 8px 0 0; color: #92400e; font-size: 14px;">
              Στείλτε καμπάνια στους πελάτες σας τώρα και κερδίστε προμήθειες. Κάθε match = πιθανή χρηματοδότηση για τον πελάτη σας.
            </p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/matches"
               style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
              Δείτε τα Matches &rarr;
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            I-MENTOR Business Opportunity Network · <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/matches" style="color: #6b7280;">Μεταβείτε στο Portal</a>
          </p>
        </div>
      </div>
    `,
  })
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
  // Track new matches by accountant: accountantId -> { count, programTitles }
  const newMatchesByAccountant: Record<string, { count: number; programs: Set<string> }> = {}

  for (const business of businesses) {
    const { score, reasons } = matchesBusiness(business, program)
    if (score >= 40) qualifyingBusinessIds.push(business.id)
    const isNew = await upsertMatch(programId, business.id, score, reasons)
    if (isNew) {
      matchCount++
      if (business.accountantId) {
        if (!newMatchesByAccountant[business.accountantId]) {
          newMatchesByAccountant[business.accountantId] = { count: 0, programs: new Set() }
        }
        newMatchesByAccountant[business.accountantId].count++
        newMatchesByAccountant[business.accountantId].programs.add(program.title)
      }
    }
  }

  await resetStaleMatches(programId, qualifyingBusinessIds)

  // Notify accountants with new matches (fire and forget)
  for (const [accountantId, info] of Object.entries(newMatchesByAccountant)) {
    notifyAccountant(accountantId, info.count, Array.from(info.programs)).catch(() => {})
  }

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
  const newProgramTitles: string[] = []

  for (const program of programs) {
    const { score, reasons } = matchesBusiness(business, program)
    const isNew = await upsertMatch(program.id, business.id, score, reasons)
    if (isNew) {
      matchCount++
      newProgramTitles.push(program.title)
    }
    if (score < 40) {
      await prisma.programMatch.deleteMany({
        where: { programId: program.id, businessId, status: MatchStatus.POTENTIAL }
      })
    }
  }

  // Notify the business's accountant if new matches were found
  if (matchCount > 0 && business.accountantId) {
    notifyAccountant(business.accountantId, matchCount, newProgramTitles).catch(() => {})
  }

  return matchCount
}
