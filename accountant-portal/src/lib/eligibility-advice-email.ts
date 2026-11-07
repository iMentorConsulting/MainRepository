import { computeInvestmentFees } from './investment-pricing'
import { buildBankAccountsHtml } from './imentor-bank-accounts'

// "Ενημέρωση & Επόμενα Βήματα" — a short, friendly advisory email an
// admin/consultant sends to a prospect right after confirming eligibility
// (distinct from the full program-info dump in eligibility-email.ts).
// Structure requested by the office:
//   Section A — inform/advise: why they're eligible, how much the grant is
//     worth, what expenses qualify, how the funding process actually works.
//   Section B — ask the client to reply with their own investment idea, a
//     rough cost estimate, and any questions.
// Only meaningful for subsidy programs (ΕΣΠΑ/LEADER/ΔΥΠΑ) — ΤΑΜΕΙΟ
// ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ (a loan, not a grant) has its own separate email.

export interface AdviceProgram {
  title: string
  category: string
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  subsidyNote: string | null
  minInvestment: number | null
  maxInvestment: number | null
  monthlyAmount: string | null
  subsidyMonths: string | null
  totalBenefit: string | null
  expenseCategories: unknown
  investmentPricingBrackets: unknown
}

function fmtEur0(n: number): string {
  return n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export function buildEligibilityAdviceSubject(businessName: string | null, programTitle: string): string {
  const name = businessName || 'Η επιχείρησή σας'
  return `${name} — Ενημέρωση & επόμενα βήματα για «${programTitle}»`
}

// Best-effort scan of the Ερμής chat transcript (client's own messages
// only) for a euro amount the client mentioned, e.g. "50.000€", "50000
// ευρώ", "γύρω στις 80 χιλιάδες". Deliberately conservative — only amounts
// of at least 1.000€ count, to avoid matching stray small numbers (dates,
// ΚΑΔ codes, etc). Used as a soft hint surfaced to the consultant before
// sending, never inserted without the preview being reviewed first.
export function extractDiscussedAmount(chatLog: unknown): number | null {
  if (!Array.isArray(chatLog)) return null
  const userText = chatLog
    .filter((m: any) => m && m.role === 'user' && typeof m.text === 'string')
    .map((m: any) => m.text as string)
    .join(' \n ')
  if (!userText) return null

  const found: number[] = []
  const euroRegex = /(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:€|ευρώ)/gi
  let match: RegExpExecArray | null
  while ((match = euroRegex.exec(userText))) {
    const raw = match[1].replace(/[.,]/g, '')
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 1000) found.push(n)
  }
  const kiloRegex = /(\d{1,4}(?:[.,]\d+)?)\s*(?:χιλιάδ\w*|κ€|k€)/gi
  while ((match = kiloRegex.exec(userText))) {
    const n = Number(match[1].replace(',', '.')) * 1000
    if (Number.isFinite(n) && n >= 1000) found.push(n)
  }
  if (found.length === 0) return null
  // Most recent mention is the most likely to still be current.
  return found[found.length - 1]
}

function section(title: string, bodyHtml: string): string {
  return `<div style="margin:0 0 20px;">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">${title}</p>
    ${bodyHtml}
  </div>`
}

export function buildEligibilityAdviceEmailHtml(params: {
  businessName: string | null
  program: AdviceProgram
  matchReasons: string[]
  ermisDiscussedAmount?: number | null
  investmentAmount?: number | null
  customMessage?: string | null
  imentorLogoUrl?: string | null
}): string {
  const { businessName, program, matchReasons, ermisDiscussedAmount, investmentAmount, customMessage, imentorLogoUrl } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'
  const isDypa = program.category === 'DYPA'

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:72px;width:auto;max-width:260px;object-fit:contain;" />`
    : `<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:22px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  // A.1 — why they're eligible
  const reasonsHtml = matchReasons.length > 0
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 18px;">
         <ul style="margin:0;padding-left:18px;">
           ${matchReasons.map(r => `<li style="font-size:13.5px;color:#166534;line-height:1.8;">${r}</li>`).join('')}
         </ul>
       </div>`
    : `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">Η επιχείρησή σας πληροί τις βασικές προϋποθέσεις του προγράμματος.</p>`
  const sectionA1 = section('1. Είστε επιλέξιμοι — οι λόγοι', reasonsHtml)

  // A.2 — how much the grant is worth
  let sectionA2 = ''
  if (isDypa) {
    const rows: string[] = []
    if (program.monthlyAmount) rows.push(`<tr><td style="padding:4px 0;color:#6b7280;width:55%;">Μηνιαία επιχορήγηση</td><td style="padding:4px 0;color:#111827;font-weight:600;">${program.monthlyAmount}</td></tr>`)
    if (program.subsidyMonths) rows.push(`<tr><td style="padding:4px 0;color:#6b7280;">Διάρκεια επιχορήγησης</td><td style="padding:4px 0;color:#111827;font-weight:600;">${program.subsidyMonths}</td></tr>`)
    if (program.totalBenefit) rows.push(`<tr><td style="padding:4px 0;color:#6b7280;">Συνολικό όφελος</td><td style="padding:4px 0;color:#111827;font-weight:600;">${program.totalBenefit}</td></tr>`)
    if (rows.length > 0) {
      sectionA2 = section('2. Πόσο αξίζει η επιχορήγηση', `
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;">${rows.join('')}</table>`)
    }
  } else {
    const pctHeadline = program.minSubsidyPct ?? program.maxSubsidyPct
    const showMaxNote = program.maxSubsidyPct != null && program.minSubsidyPct != null && program.maxSubsidyPct > program.minSubsidyPct
    if (pctHeadline != null || program.maxInvestment != null) {
      sectionA2 = section('2. Πόσο αξίζει η επιχορήγηση', `
        <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.7;">
          Το πρόγραμμα προσφέρει επιχορήγηση${program.maxInvestment != null ? ` έως <strong>${fmtEur0(program.maxInvestment)}</strong> επί του επενδυτικού σας σχεδίου` : ''}${pctHeadline != null ? `, με ποσοστό επιχορήγησης <strong>${pctHeadline}%</strong>` : ''}.
        </p>
        ${showMaxNote ? `<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Σε ορισμένες περιπτώσεις, ανάλογα με τα χαρακτηριστικά της επιχείρησης και της επένδυσης, το ποσοστό επιχορήγησης μπορεί να φτάσει έως ${program.maxSubsidyPct}%.</p>` : ''}`)
    }
  }

  // A.3 — what expenses qualify
  let sectionA3 = ''
  if (!isDypa) {
    const expenseCategories = Array.isArray(program.expenseCategories)
      ? program.expenseCategories as { category?: string; expense?: string }[]
      : []
    const listHtml = expenseCategories.length > 0
      ? `<ul style="margin:0 0 10px;padding-left:18px;">
           ${expenseCategories.map(c => `<li style="font-size:13.5px;color:#374151;line-height:1.8;">${[c.category, c.expense].filter(Boolean).join(' — ')}</li>`).join('')}
         </ul>`
      : `<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.7;">Επιχορηγούνται δαπάνες που σχετίζονται άμεσα με την υλοποίηση του επενδυτικού σας σχεδίου (π.χ. εξοπλισμός, κτιριακές παρεμβάσεις, ψηφιακός εκσυγχρονισμός, ανάλογα με το πρόγραμμα).</p>`
    sectionA3 = section('3. Ποιες δαπάνες μπορείτε να κάνετε', `
      ${listHtml}
      <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;">⚠️ Σε καμία περίπτωση δεν επιχορηγούνται οχήματα συμβατικών καυσίμων (βενζίνη/πετρέλαιο).</p>`)
  }

  // A.4 — how the process actually works
  const processText = isDypa
    ? 'Η διαδικασία έχει ως εξής: πρώτα υποβάλλουμε την αίτηση για την πρόσληψη, η οποία στη συνέχεια αξιολογείται και εγκρίνεται (η έγκριση δεν είναι δεδομένη εκ των προτέρων). Μετά την έγκριση και την πρόσληψη του ωφελούμενου, η επιχορήγηση καταβάλλεται σταδιακά, μήνα με τον μήνα, για όσο διάστημα προβλέπει το πρόγραμμα.'
    : 'Η διαδικασία έχει ως εξής: πρώτα υποβάλλουμε την αίτηση στο πρόγραμμα, η οποία στη συνέχεια αξιολογείται και εγκρίνεται (η έγκριση δεν είναι δεδομένη εκ των προτέρων). Μόνο μετά την έγκριση ξεκινά η υλοποίηση — η επιχείρηση πραγματοποιεί η ίδια τις δαπάνες της επένδυσης, και η επιχορήγηση δεν προκαταβάλλεται: αποδίδεται σταδιακά, σύμφωνα με την πρόοδο υλοποίησης και τις εκταμιεύσεις του προγράμματος.'
  const sectionA4 = section('4. Πώς λειτουργεί η διαδικασία', `
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${processText}</p>`)

  // Optional — only rendered when the consultant entered an investment
  // amount: looks up this program's own bracket table (or the standard
  // default — see investment-pricing.ts) and shows our own cost for it.
  let sectionCost = ''
  if (investmentAmount && investmentAmount > 0 && !isDypa) {
    const fees = computeInvestmentFees(investmentAmount, program.investmentPricingBrackets as any)
    if (fees) {
      const fmtEurVat = (n: number) => `${fmtEur0(n)} + ΦΠΑ = ${fmtEur0(Math.round(n * 1.24))}`
      sectionCost = section('Το Κοστολόγιό μας (ενδεικτικά, για ύψος επένδυσης ' + fmtEur0(investmentAmount) + ')', `
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;margin-bottom:10px;">
          <tr><td style="padding:4px 0;color:#6b7280;width:55%;">Κόστος υποβολής αίτησης</td><td style="padding:4px 0;color:#111827;font-weight:600;">${fmtEurVat(fees.applicationFee)}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Αμοιβή παρακολούθησης υλοποίησης</td><td style="padding:4px 0;color:#111827;font-weight:600;">${fmtEurVat(fees.implementationFee)}</td></tr>
        </table>
        <p style="margin:0 0 10px;font-size:13px;color:#4b5563;line-height:1.7;">
          Το κόστος υποβολής αίτησης καταβάλλεται εκ των προτέρων, για την υποβολή της αίτησης στο πρόγραμμα. Η αμοιβή παρακολούθησης καταβάλλεται μόνο μετά την έγκριση, σταδιακά, ταυτόχρονα με την υλοποίηση του προγράμματος και τις εκταμιεύσεις της επιχορήγησης.
        </p>
        <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;line-height:1.6;">Το κόστος αυτό αντιστοιχεί στο παραπάνω ποσό επένδυσης — διαφοροποιείται (προς τα πάνω ή κάτω) αν το τελικό ποσό της επένδυσής σας αλλάξει.</p>
        ${buildBankAccountsHtml()}`)
    }
  }

  const ermisNote = ermisDiscussedAmount
    ? `<p style="margin:0 0 14px;font-size:13.5px;color:#4b5563;line-height:1.7;">
         Από τη συζήτησή σας με τον 🤖 Ερμή καταλάβαμε ότι σκέφτεστε επένδυση ύψους περίπου <strong>${fmtEur0(ermisDiscussedAmount)}</strong> — θα θέλαμε να το επιβεβαιώσουμε μαζί σας παρακάτω.
       </p>`
    : ''

  const sectionB = `
    <div style="background:#eef2ff;border:2px solid #4f46e5;border-radius:12px;padding:20px 22px;margin-top:4px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#3730a3;">📩 Πατήστε «Απάντηση» σε αυτό το email και γράψτε μας:</p>
      <p style="margin:0 0 14px;font-size:12.5px;color:#4338ca;">(αρκεί να απαντήσετε στα 3 παρακάτω σημεία, όσο σύντομα θέλετε)</p>
      ${ermisNote}
      <div style="background:#ffffff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;">
        <p style="margin:0 0 10px;font-size:14px;color:#1f2937;line-height:1.7;">
          1️⃣ <strong>Τι επένδυση σκέφτομαι:</strong> ______________________________
        </p>
        <p style="margin:0 0 10px;font-size:14px;color:#1f2937;line-height:1.7;">
          2️⃣ <strong>Κατά προσέγγιση κόστος:</strong> ____________ €
        </p>
        <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.7;">
          3️⃣ <strong>Ερωτήσεις μου (αν έχω):</strong> ______________________________
        </p>
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:#6b7280;line-height:1.6;">
        Π.χ. «1) Καινούργιος εξοπλισμός κουζίνας 2) Γύρω στις 50.000€ 3) Καμία, προχωράμε».
      </p>
    </div>`

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;border-radius:12px 12px 0 0;">
        ${brandLeft}
        <h1 style="margin:18px 0 0;color:#fff;font-size:19px;">✅ Ενημέρωση & επόμενα βήματα — ${program.title}</h1>
      </div>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${name},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
          Θα θέλαμε να σας ενημερώσουμε αναλυτικά για το πρόγραμμα «${program.title}» και τι σημαίνει αυτό για την επιχείρησή σας.
        </p>
        ${customMessage ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7;white-space:pre-line;">${customMessage}</p>
        </div>` : ''}
        ${sectionA1}
        ${sectionA2}
        ${sectionA3}
        ${sectionA4}
        ${sectionCost}
        ${sectionB}
        <p style="margin:20px 0 0;font-size:12.5px;color:#9ca3af;">iMentor Consulting</p>
      </div>
    </div>`
}
