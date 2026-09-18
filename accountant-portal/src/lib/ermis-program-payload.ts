// Builds the per-program fields sent to the Case Management app inside the
// ermis.business_ready webhook's `matchedPrograms` array — the CM category
// label and a client-facing description combining the program's ΠΕΡΙΓΡΑΦΗ
// with the category-specific numbers shown on the public program page
// (investment/subsidy % for most programs, ΔΥΠΑ hiring-subsidy figures for
// ΔΥΠΑ, investment/interest-rate for μικροπιστώσεις).
import { type AadeBusinessDetails, buildAadeBusinessDetailsCardHtml } from './business-profile'

// Logistis' internal ProgramCategory enum values don't match CM's category
// vocabulary 1:1 (e.g. "MICROCREDITS" vs "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ").
export const CM_CATEGORY_LABEL: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ',
  ANAPTYXIAKOS: 'ΑΝΑΠΤΥΞΙΑΚΟΣ',
  RENOVATION: 'ΑΝΑΚΑΙΝΙΖΩ',
  EXTRAJUDICIAL: 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ',
  OTHER: 'ΑΛΛΟ',
}

function formatEuroRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => `${n.toLocaleString('el-GR')}€`
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`
  return fmt((min ?? max) as number)
}

function formatPctRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => `${n}%`
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`
  return fmt((min ?? max) as number)
}

export interface ProgramDescriptionInput {
  category: string
  description: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  monthlyAmount: string | null
  subsidyMonths: string | null
  totalBenefit: string | null
}

// Mirrors the public program page's "ΠΕΡΙΓΡΑΦΗ" card plus whichever
// category-specific figure card applies (investment/subsidy %, ΔΥΠΑ hiring
// subsidy, or investment/interest rate), joined as lines for the client
// message.
export interface ErmisViberProgramEntry {
  title: string
  chatUrl: string | null
}

const MAX_VIBER_PROGRAMS = 4
const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

// Client-facing Viber sent right after ermis.business_ready is built — the
// immediate "here's what you're eligible for" notification (the reminder
// cron's Viber is a separate, later, "still there?" nudge). Only pass
// already-eligible, primary-first-ordered entries.
export function buildErmisViberMessage(params: {
  businessName: string
  eligiblePrograms: ErmisViberProgramEntry[]
  consultant?: string | null
}): string {
  const { businessName, eligiblePrograms, consultant } = params
  const shown = eligiblePrograms.slice(0, MAX_VIBER_PROGRAMS)
  const extra = eligiblePrograms.length - shown.length

  const lines: string[] = [`Αγαπητέ/ή ${businessName},`, '']

  if (shown.length <= 1) {
    const program = shown[0]
    lines.push('🔍 Ελέγξαμε την επιχείρησή σας και έχουμε καλά νέα! Βρήκαμε πρόγραμμα επιχορήγησης για το οποίο πιθανώς είστε επιλέξιμοι:')
    lines.push('')
    lines.push(`🎯 «${program.title}»`)
    lines.push('')
    lines.push('🤖 Μιλήστε τώρα με τον «Ερμή» μας για ΔΩΡΕΑΝ έλεγχο (~2 λεπτά):')
    lines.push(program.chatUrl || '')
  } else {
    lines.push(`🔍 Ελέγξαμε την επιχείρησή σας και έχουμε καλά νέα! Βρήκαμε ${eligiblePrograms.length} προγράμματα επιχορήγησης για τα οποία πιθανώς είστε επιλέξιμοι:`)
    lines.push('')
    shown.forEach((program, i) => {
      lines.push(`${NUMBER_EMOJI[i] || `${i + 1}.`} «${program.title}»`)
      lines.push(program.chatUrl || '')
      lines.push('')
    })
    if (extra > 0) lines.push(`...και ${extra} ακόμη!`, '')
    lines.push('🤖 Μιλήστε με τον «Ερμή» μας — ΔΩΡΕΑΝ έλεγχος (~2 λεπτά) για κάθε πρόγραμμα!')
  }

  if (consultant) {
    lines.push('', `Σύμβουλός σας: ${consultant}`)
  }

  return lines.join('\n')
}

// Correction message: sent when a program's criteria change after CM was
// already told a business is eligible, and re-matching drops it. Deliberately
// plain/neutral — no celebratory icons — since this is a "we were wrong"
// message, not good news.
export function buildIneligibleViberMessage(params: {
  businessName: string
  programTitle: string
  consultant?: string | null
}): string {
  const { businessName, programTitle, consultant } = params
  const lines = [
    `Αγαπητέ/ή ${businessName},`,
    '',
    'Μετά από επανεξέταση των στοιχείων σας, διαπιστώσαμε ότι τελικά δεν πληροίτε τις προϋποθέσεις του προγράμματος:',
    '',
    `«${programTitle}»`,
    '',
    'Θα χαρούμε να σας ενημερώσουμε αν προκύψει νέο πρόγραμμα που να ταιριάζει στην επιχείρησή σας.',
  ]
  if (consultant) lines.push('', `Σύμβουλός σας: ${consultant}`)
  return lines.join('\n')
}

export function buildIneligibleEmailHtml(params: {
  businessName: string
  programTitle: string
  consultant?: string | null
}): string {
  const { businessName, programTitle, consultant } = params
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6;">
      <p>Αγαπητέ/ή ${businessName},</p>
      <p>Μετά από επανεξέταση των στοιχείων σας, διαπιστώσαμε ότι τελικά δεν πληροίτε τις προϋποθέσεις του προγράμματος:</p>
      <p style="font-weight:700;">«${programTitle}»</p>
      <p>Θα χαρούμε να σας ενημερώσουμε αν προκύψει νέο πρόγραμμα που να ταιριάζει στην επιχείρησή σας.</p>
      ${consultant ? `<p>Σύμβουλός σας: ${consultant}</p>` : ''}
      <p style="color:#6b7280;font-size:13px;margin-top:24px;">iMentor Consulting</p>
    </div>`
}

export interface ErmisEmailProgramEntry {
  title: string
  chatUrl: string | null
  description: string
}

// Client-facing email sent alongside buildErmisViberMessage's Viber, right
// after ermis.business_ready — same "here's what you're eligible for" event,
// just as an email so clients without Viber (or who miss the Viber) still
// get told. Only pass already-eligible, primary-first-ordered entries.
export function buildErmisEligibilitySubject(businessName: string, programCount: number): string {
  return programCount === 1
    ? `${businessName} — Βρέθηκε πρόγραμμα επιχορήγησης για εσάς`
    : `${businessName} — Βρέθηκαν ${programCount} προγράμματα επιχορήγησης για εσάς`
}

export function buildErmisEligibilityEmailHtml(params: {
  businessName: string
  eligiblePrograms: ErmisEmailProgramEntry[]
  consultant?: string | null
  businessDetails?: AadeBusinessDetails
}): string {
  const { businessName, eligiblePrograms, consultant, businessDetails } = params

  const cards = eligiblePrograms.map(p => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${p.title}</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4b5563;line-height:1.6;white-space:pre-line;">${p.description}</p>
      ${p.chatUrl ? `<a href="${p.chatUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 26px;border-radius:8px;">🤖 Μιλήστε με τον «Ερμή» — ΔΩΡΕΑΝ έλεγχος</a>` : ''}
    </div>`).join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;padding:24px 28px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:19px;">✅ Βρέθηκαν διαθέσιμα προγράμματα</h1>
      </div>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${businessName},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
          Ελέγξαμε τα στοιχεία της επιχείρησής σας και εντοπίσαμε ${eligiblePrograms.length === 1 ? 'το παρακάτω πρόγραμμα' : `τα παρακάτω ${eligiblePrograms.length} προγράμματα`} για τα οποία είστε πιθανώς επιλέξιμοι:
        </p>
        ${buildAadeBusinessDetailsCardHtml(businessDetails)}
        ${cards}
        ${consultant ? `<p style="margin:20px 0 0;font-size:13px;color:#374151;">Σύμβουλός σας: ${consultant}</p>` : ''}
        <p style="margin:8px 0 0;font-size:12.5px;color:#9ca3af;">iMentor Consulting</p>
      </div>
    </div>`
}

export function buildProgramDescription(program: ProgramDescriptionInput): string {
  const parts: string[] = []
  if (program.description) parts.push(program.description.trim())

  if (program.category === 'DYPA') {
    if (program.monthlyAmount) parts.push(`Μηνιαία επιχορήγηση: ${program.monthlyAmount}`)
    if (program.subsidyMonths) parts.push(`Μήνες επιχορήγησης: ${program.subsidyMonths}`)
    if (program.totalBenefit) parts.push(`Συνολικό όφελος: ${program.totalBenefit}`)
  } else if (program.category === 'MICROCREDITS') {
    const invest = formatEuroRange(program.minInvestment, program.maxInvestment)
    if (invest) parts.push(`Ποσό επένδυσης: ${invest}`)
    const rate = formatPctRange(program.minInterestRate, program.maxInterestRate)
    if (rate) parts.push(`Επιτόκιο: ${rate}`)
  } else {
    const invest = formatEuroRange(program.minInvestment, program.maxInvestment)
    if (invest) parts.push(`Ποσό επένδυσης: ${invest}`)
    const subsidy = formatPctRange(program.minSubsidyPct, program.maxSubsidyPct)
    if (subsidy) parts.push(`% Επιχορήγησης: ${subsidy}`)
  }

  return parts.join('\n')
}
