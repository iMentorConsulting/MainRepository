import { prisma } from './prisma'
import { MatchStatus } from '@prisma/client'
import { resolveRegionFromZip } from './greek-regions'
import { sendEmail } from './email'
import { isInactiveBusiness } from './business-filters'
import { normalizeLegalForm } from './legal-forms'
import { getOrCreateMatchActionToken } from './match-action-token'
import { buildProgramInfoHtml } from './program-info-html'

interface BusinessWithActivities {
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

// AADE's webservice sometimes returns ΚΑΔ codes that start with 0 (e.g.
// categories 01-09: γεωργία, αλιεία, ορυχεία) without the leading zero —
// "3112100" instead of the official "03112100". Pad those back to 8 digits
// so prefix-based program criteria (e.g. "031") match correctly.
function normalizeKad(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
}

export interface MatchDiagnosis {
  pass: boolean
  criterion: string
  detail: string
}

// Same rules as matchesBusiness() below, but returns a per-criterion
// breakdown instead of a single score — lets an admin see exactly WHICH
// rule is rejecting a business that visually looks eligible, instead of
// guessing from a bare "0 matched".
export function diagnoseMatch(business: BusinessWithActivities, program: ProgramCriteria): MatchDiagnosis[] {
  const out: MatchDiagnosis[] = []
  const legalForm = normalizeLegalForm(business.legalStatusDescr)

  if (program.excludeTags.length > 0) {
    const hit = business.tags.find(t => program.excludeTags.includes(t))
    out.push({ pass: !hit, criterion: 'excludeTags', detail: hit ? `Η επιχείρηση έχει το tag "${hit}" που είναι στη λίστα εξαίρεσης` : 'Καμία επικάλυψη με tags εξαίρεσης' })
  }
  if (program.requireTags.length > 0) {
    const hasAny = program.requireTags.some(t => business.tags.includes(t))
    out.push({ pass: hasAny, criterion: 'requireTags', detail: hasAny ? 'Η επιχείρηση έχει ένα από τα απαιτούμενα tags' : `Η επιχείρηση δεν έχει κανένα από τα απαιτούμενα tags: ${program.requireTags.join(', ')}` })
  }
  if (program.excludedLegalForms.length > 0) {
    const excluded = program.excludedLegalForms.includes(legalForm)
    out.push({ pass: !excluded, criterion: 'excludedLegalForms', detail: excluded ? `Η νομική μορφή "${legalForm}" είναι στη λίστα εξαιρούμενων μορφών του προγράμματος` : `Η νομική μορφή "${legalForm}" δεν είναι εξαιρούμενη` })
  }

  if (program.kadRules.length > 0) {
    const allKad = program.kadRules.includes('*')
    const matchedKad = business.activities.find(activity => {
      const activityCode = normalizeKad(activity.firmActCode)
      const matchesRule = allKad || program.kadRules.some(rule => {
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
    const excludedDetail = program.excludedKadRules.length > 0 ? ` (εξαιρούνται: ${program.excludedKadRules.join(', ')})` : ''
    const ruleLabel = allKad ? 'Όλοι οι ΚΑΔ' : `κανόνες ΚΑΔ του προγράμματος`
    out.push({ pass: !!matchedKad, criterion: 'kadRules', detail: matchedKad ? `Ταιριάζει ΚΑΔ ${matchedKad.firmActCode}` : `Κανένα από τα ΚΑΔ της επιχείρησης (${business.activities.map(a => a.firmActCode).join(', ') || '—'}) δεν ταιριάζει με τους ${ruleLabel}${excludedDetail}` })
  }
  if (program.regionRules.length > 0) {
    const businessRegion = resolveRegionFromZip(business.postalZipCode)
    const matched = !!businessRegion && program.regionRules.includes(businessRegion)
    out.push({ pass: matched, criterion: 'regionRules', detail: matched ? `Περιφέρεια: ${businessRegion}` : `Η περιφέρεια της επιχείρησης (ΤΚ ${business.postalZipCode || '—'} → ${businessRegion || 'άγνωστη'}) δεν είναι στις επιλεγμένες περιφέρειες` })
  }
  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matched = program.zipCodeRules.some(r => zip.startsWith(r) || zip === r)
    out.push({ pass: matched, criterion: 'zipCodeRules', detail: matched ? `ΤΚ ${zip} ταιριάζει` : `ΤΚ ${zip || '—'} δεν ταιριάζει με κανέναν κανόνα ΤΚ` })
  }
  if (program.minRegdate || program.maxRegdate) {
    const regdate = business.regdate ? new Date(business.regdate) : null
    let ok = !!regdate
    if (program.minRegdate && regdate && regdate < new Date(program.minRegdate)) ok = false
    if (program.maxRegdate && regdate && regdate > new Date(program.maxRegdate)) ok = false
    out.push({ pass: ok, criterion: 'regdate', detail: regdate ? `Ημ. ίδρυσης ${regdate.toLocaleDateString('el-GR')} έναντι εύρους ${program.minRegdate || '—'} έως ${program.maxRegdate || '—'}` : 'Άγνωστη ημερομηνία ίδρυσης' })
  }

  return out
}

function matchesBusiness(
  business: BusinessWithActivities,
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

  // KAD matching
  if (program.kadRules.length > 0) {
    const allKad = program.kadRules.includes('*')
    const matchedKad = business.activities.find(activity => {
      const activityCode = normalizeKad(activity.firmActCode)
      const matchesRule = allKad || program.kadRules.some(rule => {
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

  // Region matching — resolve the business's Greek region ("Περιφέρεια")
  // from its postal code and compare against the program's selected regions.
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

  // ZIP matching
  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matchedZip = program.zipCodeRules.find(r => zip.startsWith(r) || zip === r)
    if (matchedZip) {
      reasons.push(`ΤΚ: ${matchedZip}`)
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
      reasons.push(`Ημερομηνία ίδρυσης: ${regdate.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`)
    } else {
      allMatched = false
    }
  }

  return { score: allMatched ? 100 : 0, reasons: allMatched ? reasons : [] }
}

// A program is "open" (eligible to receive/keep matches) only if:
//  1. active = true
//  2. archived = false
//  3. today falls within startDate..endDate (either bound may be null = open-ended)
export function isProgramOpen(program: { active: boolean; archived: boolean; startDate: Date | null; endDate: Date | null }): boolean {
  if (!program.active || program.archived) return false
  const now = new Date()
  if (program.startDate && now < program.startDate) return false
  if (program.endDate && now > program.endDate) return false
  return true
}

// Dismisses all POTENTIAL matches for a program that is no longer open.
// Called whenever a program is saved with active=false, archived=true, or
// date boundaries that exclude today — so stale matches disappear immediately
// without waiting for the next matching run.
export async function dismissMatchesForProgram(programId: string): Promise<void> {
  await prisma.programMatch.updateMany({
    where: { programId, status: MatchStatus.POTENTIAL },
    data: { status: MatchStatus.REJECTED, matchScore: 0 },
  })
}

// Direct-client matches are no longer notified individually — they are
// collected and sent as a daily digest by the /api/cron/direct-match-digest
// endpoint (runs at 15:00 every day). Matches stay notified=false until then.
async function autoNotifyDirectMatch(_businessId: string, _programId: string): Promise<void> {
  // no-op: digest cron handles notification
}

// Returns true if a NEW match was created (not an update to an existing one).
async function upsertMatch(programId: string, businessId: string, score: number, reasons: string[]): Promise<boolean> {
  if (score < 40) return false
  const existing = await prisma.programMatch.findUnique({
    where: { programId_businessId: { programId, businessId } },
    select: { id: true, status: true },
  })
  // A business that newly qualifies again after being REJECTED (e.g. once
  // criteria that had wrongly disqualified it are fixed) must come back as
  // POTENTIAL — otherwise it stays REJECTED forever, since the status was
  // never touched here, only matchScore/matchReason.
  const revivedStatus = existing?.status === MatchStatus.REJECTED ? MatchStatus.POTENTIAL : undefined
  await prisma.programMatch.upsert({
    where: { programId_businessId: { programId, businessId } },
    update: { matchScore: score, matchReason: reasons, updatedAt: new Date(), ...(revivedStatus ? { status: revivedStatus } : {}) },
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

// Marks stale matches as REJECTED once they no longer satisfy the program's
// (possibly just-edited) criteria. Covers POTENTIAL matches regardless of
// whether they were already notified — an admin tightening e.g. ΚΑΔ rules
// must immediately stop a wrong business from showing as a match, even if
// the accountant already got an email about it. Matches the accountant has
// already acted on (REVIEWED/INTERESTED/SUBMITTED/REJECTED) are left alone,
// since those reflect a human decision, not just the auto-matcher's score.
async function resetStaleMatches(programId: string, qualifyingBusinessIds: string[]) {
  await prisma.programMatch.updateMany({
    where: {
      programId,
      status: MatchStatus.POTENTIAL,
      businessId: { notIn: qualifyingBusinessIds }
    },
    data: { status: MatchStatus.REJECTED, matchScore: 0 },
  })
}

export async function runMatchingForProgram(programId: string): Promise<number> {
  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) throw new Error('Program not found')

  // Closed programs must not accumulate new matches — dismiss any that exist.
  if (!isProgramOpen(program)) {
    await dismissMatchesForProgram(programId)
    return 0
  }

  const businesses = await prisma.business.findMany({
    include: { activities: true },
  })

  let matchCount = 0
  const qualifyingBusinessIds: string[] = []

  for (const business of businesses) {
    if (isInactiveBusiness(business)) continue
    if (businessAlreadyReceivedProgram(business.iMentorServices, program.title)) continue
    const { score, reasons } = matchesBusiness(business, program)
    if (score >= 40) qualifyingBusinessIds.push(business.id)
    const isNew = await upsertMatch(programId, business.id, score, reasons)
    if (isNew) {
      matchCount++
      if (!business.accountantId) {
        autoNotifyDirectMatch(business.id, programId).catch(() => {})
      }
    }
  }

  await resetStaleMatches(programId, qualifyingBusinessIds)

  return matchCount
}

// Called after an accountant adds a business themselves — immediately notify without admin approval.
export async function autoNotifyBusinessMatches(businessId: string): Promise<void> {
  const matches = await prisma.programMatch.findMany({
    where: { businessId, notified: false, matchScore: { gte: 40 } },
    include: {
      program: { select: {
        id: true, title: true, otherRequirements: true, category: true,
        monthlyAmount: true, subsidyMonths: true, totalBenefit: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true,
        minInterestRate: true, maxInterestRate: true,
      } },
      business: { select: { accountantId: true, onomasia: true, afm: true, email: true, phone: true } },
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
  const hasContact = !!(matches[0].business.email || matches[0].business.phone)
  const count = matches.length
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

  await prisma.notification.create({
    data: {
      accountantId,
      type: 'NEW_MATCHES',
      title: `Ο πελάτης ${businessName} ταιριάζει με ${count} πρόγραμμα${count === 1 ? '' : 'τα'}`,
      body: `Ο πελάτης ${businessName} είναι επιλέξιμος για ${count} πρόγραμμα${count === 1 ? '' : 'τα'}: ${Array.from(new Set(matches.map(m => m.program.title))).join(', ')}.`,
      link: '/matches',
    },
  })

  const programSectionsHtml = await Promise.all(matches.map(async m => {
    const token = await getOrCreateMatchActionToken(accountantId, m.program.id)
    const actionUrl = `${appUrl}/match-action/${token}`
    const infoHtml = buildProgramInfoHtml(m.program)
    const req = m.program.otherRequirements
      ? `<p style="margin: 8px 0 0; color: #374151; font-size: 13px;">${m.program.otherRequirements.replace(/\n/g, '<br>')}</p>`
      : ''
    return `<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <p style="margin: 0 0 8px; font-size: 15px; font-weight: bold; color: #4f46e5;">🎯 ${m.program.title}</p>
      ${infoHtml}
      ${req}
      <a href="${actionUrl}" style="display: inline-block; margin-top: 12px; background: linear-gradient(135deg, #059669, #047857); color: white; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold;">
        Ανάθεση σε I-MENTOR &rarr;
      </a>
    </div>`
  }))

  const missingContactHtml = !hasContact
    ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
         <p style="margin: 0 0 6px; color: #92400e; font-size: 14px; font-weight: bold;">⚠️ Ο πελάτης δεν έχει στοιχεία επικοινωνίας</p>
         <p style="margin: 0; color: #92400e; font-size: 14px;">Για να τον ενημερώσει η I-MENTOR χρειάζεται email ή κινητό τηλέφωνο. Μπορείτε να τα συμπληρώσετε απευθείας στη σελίδα ανάθεσης.</p>
       </div>`
    : ''

  await sendEmail({
    to: accountant.email,
    subject: `🎯 Ο πελάτης ${businessName} ταιριάζει με ${count} πρόγραμμα${count === 1 ? '' : 'τα'} — I-MENTOR`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
        <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px; line-height: 1.3;">Νέες Ευκαιρίες Χρηματοδότησης<br>για τους Πελάτες σας</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin: 0 0 12px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
          <p style="font-size: 15px; margin: 0 0 24px;">Ο πελάτης <strong>${businessName}</strong> που μόλις προσθέσατε είναι επιλέξιμος για <strong style="color: #4f46e5;">${count} πρόγραμμα${count === 1 ? '' : 'τα'}</strong> χρηματοδότησης!</p>

          <div style="background: linear-gradient(135deg, #059669, #047857); border-radius: 12px; padding: 20px; margin: 0 0 24px; text-align: center;">
            <p style="color: white; font-size: 17px; font-weight: bold; margin: 0 0 8px;">Αφήστε μας να χειριστούμε τα πάντα!</p>
            <p style="color: #d1fae5; font-size: 13px; margin: 0; line-height: 1.6;">Η I-MENTOR αναλαμβάνει να επικοινωνήσει με τον πελάτη σας, να τον ενημερώσει και — εφόσον εκφράσει ενδιαφέρον — να προχωρήσει με τον φάκελό του.</p>
          </div>

          ${missingContactHtml}

          <p style="font-size: 14px; font-weight: bold; margin: 0 0 12px;">Επιλέξτε πρόγραμμα για ανάθεση:</p>
          ${programSectionsHtml.join('')}

          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 20px 0 0;">Οι σύνδεσμοι ισχύουν για 45 ημέρες και δεν απαιτούν σύνδεση.</p>
        </div>
        <div style="padding: 16px 32px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">I-MENTOR Portal &middot; <a href="${appUrl}" style="color: #9ca3af; text-decoration: none;">logistis.i-mentor.gr</a></p>
        </div>
      </div>
    `,
  }).catch(() => {})

  await prisma.programMatch.updateMany({
    where: { businessId, notified: false },
    data: { notified: true },
  })
}

// Returns true if the business has already received this service via I-MENTOR.
// Matches on a common stem (first 8 chars) to handle Greek declension
// differences (e.g. "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ" received → skip program "ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ").
export function businessAlreadyReceivedProgram(iMentorServices: string[], programTitle: string): boolean {
  const titleUpper = programTitle.toUpperCase()
  return iMentorServices.some(svc => {
    const svcUpper = svc.toUpperCase()
    const stem = svcUpper.substring(0, Math.max(6, svcUpper.length - 3))
    return titleUpper.includes(stem) || svcUpper.includes(programTitle.toUpperCase().substring(0, Math.max(6, programTitle.length - 3)))
  })
}

export async function runMatchingForBusiness(businessId: string): Promise<number> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { activities: true }
  })
  if (!business) throw new Error('Business not found')

  if (isInactiveBusiness(business)) {
    await prisma.programMatch.deleteMany({ where: { businessId, status: MatchStatus.POTENTIAL, notified: false } })
    return 0
  }

  const programs = await prisma.program.findMany({ where: { active: true } })

  let matchCount = 0

  for (const program of programs) {
    // Closed programs (inactive, archived, or outside date window) must not match.
    if (!isProgramOpen(program)) {
      await prisma.programMatch.updateMany({
        where: { programId: program.id, businessId, status: MatchStatus.POTENTIAL },
        data: { status: MatchStatus.REJECTED, matchScore: 0 },
      })
      continue
    }

    // Remove stale matches for programs the business has already received from I-MENTOR
    if (businessAlreadyReceivedProgram(business.iMentorServices, program.title)) {
      await prisma.programMatch.deleteMany({
        where: { programId: program.id, businessId, status: MatchStatus.POTENTIAL },
      })
      continue
    }

    const { score, reasons } = matchesBusiness(business, program)
    const isNew = await upsertMatch(program.id, business.id, score, reasons)
    if (isNew) {
      matchCount++
      if (!business.accountantId) {
        autoNotifyDirectMatch(business.id, program.id).catch(() => {})
      }
    }
    if (score < 40) {
      await prisma.programMatch.deleteMany({
        where: { programId: program.id, businessId, status: MatchStatus.POTENTIAL, notified: false }
      })
    }
  }

  return matchCount
}

// Called after a bulk import — sends ONE email per program (not per business),
// each listing all newly-matched businesses for that program plus the
// program's "Πρόσθετες Προϋποθέσεις" (if any), instead of one email per business.
export async function notifyBatchMatchesForBusinesses(businessIds: string[]): Promise<void> {
  if (businessIds.length === 0) return

  const matches = await prisma.programMatch.findMany({
    where: { businessId: { in: businessIds }, notified: false, matchScore: { gte: 40 } },
    include: {
      program: { select: {
        id: true, title: true, extraCriteriaIds: true, category: true,
        monthlyAmount: true, subsidyMonths: true, totalBenefit: true,
        minInvestment: true, maxInvestment: true,
        minSubsidyPct: true, maxSubsidyPct: true,
        minInterestRate: true, maxInterestRate: true,
      } },
      business: { select: { id: true, accountantId: true, onomasia: true, afm: true, email: true, phone: true } },
    },
  })

  if (matches.length === 0) return

  const allCriteriaIds = Array.from(new Set(matches.flatMap(m => m.program.extraCriteriaIds || [])))
  const criteriaList = allCriteriaIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: allCriteriaIds } }, select: { id: true, label: true } })
    : []
  const criteriaMap = new Map(criteriaList.map(c => [c.id, c.label]))

  // Group by accountant, then by program
  const byAccountant = new Map<string, typeof matches>()
  for (const match of matches) {
    const accountantId = match.business.accountantId
    if (!accountantId) continue
    if (!byAccountant.has(accountantId)) byAccountant.set(accountantId, [])
    byAccountant.get(accountantId)!.push(match)
  }

  for (const [accountantId, accountantMatches] of Array.from(byAccountant)) {
    const accountant = await prisma.accountant.findUnique({
      where: { id: accountantId },
      select: { email: true, contactPerson: true },
    })
    if (!accountant) continue

    const byProgram = new Map<string, typeof matches>()
    for (const match of accountantMatches) {
      if (!byProgram.has(match.program.id)) byProgram.set(match.program.id, [])
      byProgram.get(match.program.id)!.push(match)
    }

    const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

    for (const [, programMatches] of Array.from(byProgram)) {
      const program = programMatches[0].program
      const count = programMatches.length

      await prisma.notification.create({
        data: {
          accountantId,
          type: 'NEW_MATCHES',
          title: `${count} πελάτ${count === 1 ? 'ης' : 'ες'} σας ταιριάζ${count === 1 ? 'ει' : 'ουν'} με το πρόγραμμα «${program.title}»`,
          body: `Βρέθηκαν νέες ευκαιρίες χρηματοδότησης για ${count} πελάτ${count === 1 ? 'η' : 'ες'} σας μέσω του προγράμματος «${program.title}».`,
          link: '/matches',
        },
      })

      const actionToken = await getOrCreateMatchActionToken(accountantId, program.id)
      const actionUrl = `${appUrl}/match-action/${actionToken}`

      const withContact = programMatches.filter(m => m.business.email || m.business.phone).length
      const withoutContact = count - withContact

      const clientRowsHtml = programMatches.map(m => {
        const hasContact = !!(m.business.email || m.business.phone)
        return `<tr>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${m.business.onomasia || '—'}</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">${m.business.afm}</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${hasContact ? '✅' : '⚠️ Λείπουν'}</td>
        </tr>`
      }).join('')

      const missingContactHtml = withoutContact > 0
        ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
             <p style="margin: 0 0 6px; color: #92400e; font-size: 14px; font-weight: bold;">⚠️ ${withoutContact} πελάτ${withoutContact === 1 ? 'ης' : 'ες'} χωρίς στοιχεία επικοινωνίας</p>
             <p style="margin: 0; color: #92400e; font-size: 14px;">Για να τους ενημερώσει η I-MENTOR χρειάζεται email ή κινητό τηλέφωνο. Μπορείτε να τα προσθέσετε <strong>μαζικά με Excel</strong> μέσω της <a href="${appUrl}/businesses?action=enrich" style="color: #92400e; font-weight: bold;">σελίδας εμπλουτισμού επαφών</a> — ή ένα-ένα απευθείας στη σελίδα ανάθεσης.</p>
           </div>`
        : ''

      const programInfoHtml = buildProgramInfoHtml(program)

      const criteriaLabels = (program.extraCriteriaIds || []).map(id => criteriaMap.get(id)).filter(Boolean) as string[]
      const requirementsHtml = criteriaLabels.length
        ? `<div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; border-radius: 6px; margin: 20px 0;">
             <p style="margin: 0; color: #374151; font-size: 14px; font-weight: bold;">Πρόσθετες Προϋποθέσεις:</p>
             <ul style="margin: 8px 0 0; padding-left: 20px; color: #374151; font-size: 14px;">
               ${criteriaLabels.map(l => `<li>${l}</li>`).join('')}
             </ul>
           </div>`
        : ''

      await sendEmail({
        to: accountant.email,
        subject: `🎯 ${count} πελάτες σας ταιριάζουν με «${program.title}» — I-MENTOR`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
            <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px; line-height: 1.3;">Νέες Ευκαιρίες Χρηματοδότησης<br>για τους Πελάτες σας</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin: 0 0 12px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
              <p style="font-size: 15px; margin: 0 0 24px;">Το σύστημα I-MENTOR εντόπισε <strong style="color: #4f46e5;">${count} πελάτ${count === 1 ? 'η' : 'ες'} σας</strong> που είναι επιλέξιμοι για το πρόγραμμα <strong>«${program.title}»</strong>.</p>

              <div style="background: linear-gradient(135deg, #059669, #047857); border-radius: 12px; padding: 24px; margin: 0 0 24px; text-align: center;">
                <p style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 10px;">Αφήστε μας να χειριστούμε τα πάντα!</p>
                <p style="color: #d1fae5; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">Η I-MENTOR αναλαμβάνει να επικοινωνήσει με τους πελάτες σας, να τους ενημερώσει για το πρόγραμμα και — εφόσον εκφράσουν ενδιαφέρον — να προχωρήσει με τον φάκελό τους. Εσείς κρατάτε ευχαριστημένους τους πελάτες σας και κερδίζετε την προμήθειά σας!</p>
                <a href="${actionUrl}" style="background: white; color: #047857; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
                  Ανάθεση σε I-MENTOR &rarr;
                </a>
              </div>

              <p style="font-size: 14px; font-weight: bold; margin: 0 0 8px;">Επιλέξιμοι πελάτες σας (${count}):</p>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">Επωνυμία</th>
                    <th style="text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">ΑΦΜ</th>
                    <th style="text-align: center; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">Στοιχεία Επαφής</th>
                  </tr>
                </thead>
                <tbody>
                  ${clientRowsHtml}
                </tbody>
              </table>

              ${missingContactHtml}
              ${programInfoHtml}
              ${requirementsHtml}

              <div style="text-align: center; margin: 28px 0 8px;">
                <a href="${actionUrl}" style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Επιλέξτε πελάτες για ανάθεση &rarr;
                </a>
                <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">Ο σύνδεσμος ισχύει για 45 ημέρες και δεν απαιτεί σύνδεση.</p>
              </div>
            </div>
            <div style="padding: 16px 32px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">I-MENTOR Portal &middot; <a href="${appUrl}" style="color: #9ca3af; text-decoration: none;">logistis.i-mentor.gr</a></p>
            </div>
          </div>
        `,
      }).catch(() => {})
    }
  }

  await prisma.programMatch.updateMany({
    where: { businessId: { in: businessIds }, notified: false },
    data: { notified: true },
  })
}

// A FAILed extra criterion makes a match ineligible. Older records may
// predate this rule (status not synced when the check was recorded), so
// reconcile on read wherever matches are listed with their criterionChecks.
export async function reconcileMatchStatuses(matches: { id: string; status: string; criterionChecks: { value: string }[] }[]): Promise<void> {
  const toReject = matches.filter(m => m.status !== 'REJECTED' && m.criterionChecks.some(c => c.value === 'FAIL'))
  if (toReject.length === 0) return
  await prisma.programMatch.updateMany({
    where: { id: { in: toReject.map(m => m.id) } },
    data: { status: 'REJECTED' },
  })
  for (const m of toReject) m.status = 'REJECTED'
}
