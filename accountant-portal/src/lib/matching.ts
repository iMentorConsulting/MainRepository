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

// AADE's webservice sometimes returns ΚΑΔ codes that start with 0 (e.g.
// categories 01-09: γεωργία, αλιεία, ορυχεία) without the leading zero —
// "3112100" instead of the official "03112100". Pad those back to 8 digits
// so prefix-based program criteria (e.g. "031") match correctly.
function normalizeKad(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
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
      const activityCode = normalizeKad(activity.firmActCode)
      return program.kadRules.some(rule => {
        const cleanRule = normalizeKad(rule.trim())
        if (cleanRule.includes('.')) {
          return activityCode === cleanRule
        }
        return activityCode.startsWith(cleanRule)
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
      reasons.push(`Επιλέξιμη ημερομηνία ίδρυσης: ${regdate.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`)
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

// Called after an accountant adds a business themselves — immediately notify without admin approval.
export async function autoNotifyBusinessMatches(businessId: string): Promise<void> {
  const matches = await prisma.programMatch.findMany({
    where: { businessId, notified: false, matchScore: { gte: 40 } },
    include: {
      program: { select: { title: true, otherRequirements: true } },
      business: { select: { accountantId: true, onomasia: true, afm: true } },
    },
  })

  if (matches.length === 0) return

  const accountantId = matches[0].business.accountantId
  if (!accountantId) return

  const accountant = await prisma.accountant.findUnique({
    where: { id: accountantId },
    select: { email: true, contactPerson: true },
  })
  if (!accountant) return

  const businessName = matches[0].business.onomasia || matches[0].business.afm
  const programTitles = Array.from(new Set(matches.map(m => m.program.title)))
  const count = matches.length

  const requirementsHtml = matches
    .filter(m => m.program.otherRequirements)
    .map(m => `<div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; border-radius: 6px; margin: 12px 0;">
        <p style="margin: 0; color: #374151; font-size: 14px; font-weight: bold;">Πρόσθετες Προϋποθέσεις «${m.program.title}»:</p>
        <p style="margin: 8px 0 0; color: #374151; font-size: 14px; white-space: pre-line;">${m.program.otherRequirements}</p>
      </div>`)
    .join('')

  const title = `${count} νέα match${count === 1 ? '' : 'es'} για τον πελάτη ${businessName}!`

  await prisma.notification.create({
    data: {
      accountantId,
      type: 'NEW_MATCHES',
      title,
      body: `Ο πελάτης ${businessName} είναι επιλέξιμος για ${count} πρόγραμμα${count === 1 ? '' : 'τα'}: ${programTitles.join(', ')}. Στείλτε καμπάνια τώρα!`,
      link: '/matches',
    },
  })

  await sendEmail({
    to: accountant.email,
    subject: `🎯 ${title} — I-MENTOR Portal`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🎯 Νέες Ευκαιρίες Χρηματοδότησης!</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
          <p style="color: #374151; font-size: 16px;">
            Ο πελάτης <strong>${businessName}</strong> που μόλις προσθέσατε είναι επιλέξιμος για
            <strong style="color: #4f46e5; font-size: 20px;">${count} πρόγραμμα${count === 1 ? '' : 'τα'}</strong> χρηματοδότησης!
          </p>
          <div style="background: #ede9fe; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #5b21b6; font-size: 14px; font-weight: bold;">Επιλέξιμα Προγράμματα:</p>
            <ul style="margin: 8px 0 0; padding-left: 20px; color: #5b21b6; font-size: 14px;">
              ${programTitles.map(t => `<li>${t}</li>`).join('')}
            </ul>
          </div>
          ${requirementsHtml}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/matches"
               style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
              Δείτε τα Matches &rarr;
            </a>
          </div>
        </div>
      </div>
    `,
  }).catch(() => {})

  await prisma.programMatch.updateMany({
    where: { businessId, notified: false },
    data: { notified: true },
  })
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
