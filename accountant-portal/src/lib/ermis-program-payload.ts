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
  LEADER: 'LEADER',
  OTHER: 'ΑΛΛΟ',
}

export function formatEuroRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => `${n.toLocaleString('el-GR')}€`
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`
  return fmt((min ?? max) as number)
}

export function formatPctRange(min: number | null, max: number | null): string | null {
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
  businessName: string | null
  eligiblePrograms: ErmisViberProgramEntry[]
  // Programs the client ASKED about that the automatic matching did NOT rate
  // eligible. They still get the Ερμής link (it can assess by conversation),
  // but with neutral wording — never "you are eligible".
  requestedPrograms?: ErmisViberProgramEntry[]
  consultant?: string | null
}): string {
  const { businessName, eligiblePrograms, requestedPrograms = [], consultant } = params
  const shown = eligiblePrograms.slice(0, MAX_VIBER_PROGRAMS)
  const extra = eligiblePrograms.length - shown.length

  const lines: string[] = [`Αγαπητέ/ή ${clientDisplayName(businessName) || 'πελάτη'},`, '']

  if (eligiblePrograms.length === 0 && requestedPrograms.length > 0) {
    lines.push('Λάβαμε το αίτημά σας για το πρόγραμμα:')
    lines.push('')
    requestedPrograms.forEach(p => { lines.push(`🎯 «${p.title}»`); lines.push(p.chatUrl || ''); lines.push('') })
    lines.push('🤖 Μιλήστε με τον «Ερμή» μας για ΔΩΡΕΑΝ έλεγχο επιλεξιμότητας (~2 λεπτά).')
  } else if (shown.length <= 1) {
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

  if (eligiblePrograms.length > 0 && requestedPrograms.length > 0) {
    lines.push('', 'Για το πρόγραμμα που ζητήσατε, μπορείτε επίσης να κάνετε ΔΩΡΕΑΝ έλεγχο επιλεξιμότητας με τον «Ερμή»:')
    requestedPrograms.forEach(p => { lines.push(`«${p.title}»`); lines.push(p.chatUrl || '') })
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
// What a client is called in a message: never their ΑΦΜ (an ιδιώτης without
// AADE data has no name there — the code used to fall back to the ΑΦΜ).
export function clientDisplayName(name: string | null | undefined): string | null {
  const n = (name || '').trim()
  return n && !/^\d{9}$/.test(n) ? n : null
}

// True when the lead is a person who has NOT started a business yet and the
// program also accepts υπό ίδρυση businesses: no activities/start date on the
// business record (an ιδιώτης), or the lead's own context says so.
export function isNewBusinessLead(params: {
  acceptsNewBusiness?: boolean | null
  hasActivities: boolean
  hasRegdate: boolean
  contextText?: string | null
}): boolean {
  if (!params.acceptsNewBusiness) return false
  if (/νέα[_\s]+επιχείρηση|υπό[_\s]+ίδρυση|υπο[_\s]+ιδρυση/i.test(params.contextText || '')) return true
  return !params.hasActivities && !params.hasRegdate
}

export function buildErmisRequestSubject(name: string | null, programTitle: string): string {
  return `${name ? `${name} — ` : ''}Το αίτημά σας για «${programTitle}»`
}

export function buildErmisEligibilitySubject(businessName: string | null, programCount: number): string {
  const prefix = businessName ? `${businessName} — ` : ''
  return programCount === 1
    ? `${prefix}Βρέθηκε πρόγραμμα επιχορήγησης για εσάς`
    : `${prefix}Βρέθηκαν ${programCount} προγράμματα επιχορήγησης για εσάς`
}

export function buildErmisEligibilityEmailHtml(params: {
  businessName: string | null
  eligiblePrograms: ErmisEmailProgramEntry[]
  // Programs the client asked about that the automatic matching did not rate
  // eligible — neutral wording, same Ερμής link (see buildErmisViberMessage).
  requestedPrograms?: ErmisEmailProgramEntry[]
  consultant?: string | null
  businessDetails?: AadeBusinessDetails
  // Office logo (AppSetting.imentorLogoUrl); falls back to the text wordmark.
  imentorLogoUrl?: string | null
  // A person who has not started a business yet (see isNewBusinessLead): the
  // email says so, adds the program's new-business conditions, and callers
  // pass no businessDetails (nothing meaningful to show from AADE).
  newBusiness?: { note: string | null } | null
}): string {
  const { businessName, eligiblePrograms, requestedPrograms = [], consultant, businessDetails, imentorLogoUrl, newBusiness } = params
  const neutralOnly = eligiblePrograms.length === 0 && requestedPrograms.length > 0
  const all = [...eligiblePrograms, ...requestedPrograms]

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:72px;width:auto;max-width:260px;object-fit:contain;" />`
    : `<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:22px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const title = neutralOnly ? 'Το αίτημά σας για πρόγραμμα επιχορήγησης' : '✅ Βρέθηκαν διαθέσιμα προγράμματα'
  const intro = newBusiness
    ? 'Λάβαμε το αίτημά σας. Το παρακάτω πρόγραμμα απευθύνεται και σε υπό ίδρυση επιχειρήσεις — μπορείτε να ενταχθείτε εφόσον ξεκινήσετε νέα επιχείρηση.'
    : neutralOnly
    ? `Λάβαμε το αίτημά σας για ${requestedPrograms.length === 1 ? 'το παρακάτω πρόγραμμα' : 'τα παρακάτω προγράμματα'}.`
    : `Ελέγξαμε τα στοιχεία της επιχείρησής σας και εντοπίσαμε ${eligiblePrograms.length === 1 ? 'το παρακάτω πρόγραμμα' : `τα παρακάτω ${eligiblePrograms.length} προγράμματα`} για τα οποία είστε πιθανώς επιλέξιμοι.`

  // One prominent call-to-action block, right under the intro and ABOVE the
  // business-details card — one button per program (labelled with its title
  // when there are several).
  const buttons = all.filter(p => p.chatUrl).map(p => `
        <a href="${p.chatUrl}" style="display:block;margin:0 0 10px;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;text-align:center;padding:14px 22px;border-radius:10px;">🤖 ${all.length > 1 ? `Ερμής — ${p.title}` : 'Μιλήστε με τον «Ερμή» — ΔΩΡΕΑΝ έλεγχος'}</a>`).join('')
  const cta = `
        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px 22px;margin:0 0 20px;">
          <p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#3730a3;">🤖 Μιλήστε τώρα με τον «Ερμή»</p>
          <p style="margin:0 0 14px;font-size:13.5px;color:#4338ca;line-height:1.6;">Ο ψηφιακός μας σύμβουλος κάνει ΔΩΡΕΑΝ έλεγχο επιλεξιμότητας σε περίπου 2 λεπτά. Εκεί μπορείτε να του θέσετε και <strong>οποιαδήποτε ερώτηση έχετε</strong> για το πρόγραμμα.</p>
          ${buttons}
        </div>`

  // Program cards carry the information only — the buttons live in the CTA above.
  const cardOf = (p: ErmisEmailProgramEntry) => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${p.title}</p>
      <p style="margin:0;font-size:13.5px;color:#4b5563;line-height:1.6;white-space:pre-line;">${p.description}</p>
    </div>`

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
      <tr><td bgcolor="#1e3a8a" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
        ${brandLeft}
        <h1 style="margin:18px 0 0;color:#fff;font-size:19px;">${title}</h1>
      </td></tr>
      </table>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${clientDisplayName(businessName) || 'πελάτη'},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">${intro}</p>
        ${cta}
        ${newBusiness && newBusiness.note ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin:0 0 20px;"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1e40af;">ℹ️ Για υπό ίδρυση επιχειρήσεις</p><p style="margin:0;font-size:13.5px;color:#1e3a8a;line-height:1.7;white-space:pre-line;">${newBusiness.note}</p></div>` : ''}
        ${newBusiness ? '' : buildAadeBusinessDetailsCardHtml(businessDetails)}
        ${all.map(cardOf).join('')}
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
