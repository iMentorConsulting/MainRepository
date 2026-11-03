import { buildProgramDescription, formatEuroRange, formatPctRange } from './ermis-program-payload'
import type { EligibilityProgramResult, EligibilityBusinessDetails } from './eligibility-check-core'
import { buildAadeBusinessDetailsCardHtml } from './business-profile'

// When mode === 'accountant' and the business has an assigned accountant,
// the message frames this as a joint effort with their accountant's office
// instead of I-MENTOR reaching out alone. Null/omitted means the admin chose
// (or the business has no accountant) to send it as a direct I-MENTOR message.
export interface AccountantMentionInfo {
  officeName: string
  contactPerson?: string | null
  logoUrl?: string | null
}

// Sent when a website/Moosend signup turns out to be eligible for one or
// more programs — lists every eligible program with its own "chat with
// Ermis" link, same underlying data the on-page widget already shows live,
// just delivered as an email for signups that happen off-page. When sent on
// an accountant's behalf, their office name leads the subject so it stands
// out in the inbox instead of being buried in the body.
export function buildEligibilitySubject(businessName: string | null, programCount: number, accountantInfo?: AccountantMentionInfo | null): string {
  const name = businessName || 'Η επιχείρησή σας'
  const base = programCount === 1
    ? `${name} — Βρέθηκε πρόγραμμα επιχορήγησης για εσάς`
    : `${name} — Βρέθηκαν ${programCount} προγράμματα επιχορήγησης για εσάς`
  return accountantInfo?.officeName ? `${accountantInfo.officeName} × I-MENTOR: ${base}` : base
}

export function buildEligibilityEmailHtml(params: {
  businessName: string | null
  programs: EligibilityProgramResult[]
  businessDetails?: EligibilityBusinessDetails
  accountantInfo?: AccountantMentionInfo | null
  imentorLogoUrl?: string | null
}): string {
  const { businessName, programs, businessDetails, accountantInfo, imentorLogoUrl } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'

  const cards = programs.map(p => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${p.title}</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4b5563;line-height:1.6;white-space:pre-line;">${buildProgramDescription(p)}</p>
      <a href="${p.ermisUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 26px;border-radius:8px;">
        🤖 Μιλήστε με τον «Ερμή» — ΔΩΡΕΑΝ έλεγχος
      </a>
    </div>`).join('')

  // Single blue banner carries both brands side by side — I-MENTOR on the
  // left, the accountant's office on the right — same co-branding layout
  // used in campaign emails (src/lib/email.ts renderCampaignEmailHtml), so
  // an accountant-branded send looks consistent with every other I-MENTOR
  // email instead of bolting on a separate white logo strip above it.
  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:72px;width:auto;max-width:260px;object-fit:contain;" />`
    : `<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:22px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const brandRight = accountantInfo
    ? (accountantInfo.logoUrl
        ? `<img src="${accountantInfo.logoUrl}" alt="${accountantInfo.officeName}" style="display:block;height:90px;width:auto;max-width:300px;object-fit:contain;margin-left:auto;" />`
        : `<span style="font-weight:800;color:#ffffff;font-size:20px;text-align:right;display:block;">${accountantInfo.officeName}</span>`)
    : ''

  const accountantNote = accountantInfo
    ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
         Η ενημέρωση αυτή σας αποστέλλεται σε συνεργασία με το λογιστικό σας γραφείο <strong>${accountantInfo.officeName}</strong>.
       </p>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;border-radius:12px 12px 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle" align="left" style="padding-right:12px;">${brandLeft}</td>
          ${brandRight ? `<td valign="middle" align="right" style="padding-left:12px;">${brandRight}</td>` : ''}
        </tr></table>
        <h1 style="margin:18px 0 0;color:#fff;font-size:19px;">✅ Βρέθηκαν διαθέσιμα προγράμματα</h1>
      </div>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${name},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
          Ελέγξαμε τα στοιχεία της επιχείρησής σας και εντοπίσαμε ${programs.length === 1 ? 'το παρακάτω πρόγραμμα' : `τα παρακάτω ${programs.length} προγράμματα`} για τα οποία είστε πιθανώς επιλέξιμοι:
        </p>
        ${accountantNote}
        ${buildAadeBusinessDetailsCardHtml(businessDetails)}
        ${cards}
        <p style="margin:20px 0 0;font-size:12.5px;color:#9ca3af;">iMentor Consulting</p>
      </div>
    </div>`
}

// Sent by an admin/consultant directly to a prospect they're actively
// talking to, about ONE specific program — not the multi-program "we scanned
// your ΑΦΜ" blast above. Leads with the business's own AADE data and the
// *specific* reasons this business qualifies (its actual ΚΑΔ/region/ΤΚ/
// founding date, pulled from the stored ProgramMatch.matchReason), never the
// program's full eligible-ΚΑΔ/ΤΚ/legal-form rule lists.
export function buildProspectProgramEmailSubject(businessName: string | null, programTitle: string): string {
  const name = businessName || 'Η επιχείρησή σας'
  return `${name} — Είστε επιλέξιμοι για το πρόγραμμα «${programTitle}»`
}

interface ProspectProgramFull {
  title: string
  category: string
  description: string | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  subsidyNote: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  monthlyAmount: string | null
  subsidyMonths: string | null
  totalBenefit: string | null
  beneficiaries: string | null
  regions: string | null
  otherRequirements: string | null
  totalBudgetEur: number | null
  implementationMonths: number | null
  keyPoints: string[]
  fundedActions: unknown
  expenseCategories: unknown
  pricingNote: string | null
  websiteUrl: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
  videoUrls: string[]
  internalNotes: string | null
  startDate: Date | string | null
  endDate: Date | string | null
}

// Greek typographic convention drops the tonos (accent) when a word is
// written in all caps — CSS text-transform:uppercase does NOT do this (it
// keeps the accented capital per the Unicode casing algorithm), so section
// titles are pre-uppercased with accents stripped here instead of relying
// on CSS.
function greekCaps(str: string): string {
  return str.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
}

function section(title: string, bodyHtml: string): string {
  return `<div style="margin:0 0 18px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1e3a8a;letter-spacing:.3px;">${greekCaps(title)}</p>
    ${bodyHtml}
  </div>`
}

function formatProspectDate(date: Date | string | null): string | null {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// When a program has no fixed endDate, each category closes differently in
// practice — reflect that instead of showing a bare "-".
function deadlineFallbackByCategory(category: string): string | null {
  switch (category) {
    case 'MICROCREDITS':
    case 'ESPA':
    case 'LEADER':
      return 'έως εξάντληση των κονδυλίων'
    case 'DYPA':
      return 'έως κάλυψη των θέσεων'
    default:
      return null
  }
}

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  SELF_SERVICE: 'Αυτοεξυπηρέτηση',
  VIA_ACCOUNTANT: 'Μέσω λογιστή',
}

export function buildProspectProgramEmailHtml(params: {
  businessName: string | null
  businessDetails?: EligibilityBusinessDetails
  program: ProspectProgramFull
  matchReasons: string[]
  extraCriteriaLabels?: string[]
  requiredDocuments?: { name: string; category: string; instructions: string | null }[]
  customMessage?: string | null
  imentorLogoUrl?: string | null
}): string {
  const { businessName, businessDetails, program, matchReasons, extraCriteriaLabels = [], requiredDocuments = [], customMessage, imentorLogoUrl } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:72px;width:auto;max-width:260px;object-fit:contain;" />`
    : `<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:22px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const reasonsBlock = matchReasons.length > 0
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
         <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;">✔️ Γιατί είστε επιλέξιμοι</p>
         <ul style="margin:0;padding-left:18px;">
           ${matchReasons.map(r => `<li style="font-size:13.5px;color:#166534;line-height:1.8;">${r}</li>`).join('')}
         </ul>
       </div>`
    : ''

  // Every program-specific figure/section we have, laid out so each category
  // (ΔΥΠΑ / ΕΣΠΑ-ΛΕΑΝΤΕΡ-Αναπτυξιακός / Μικροπιστώσεις) shows what's
  // actually relevant to it — never the raw matching-rule lists (eligible
  // ΚΑΔ/ΤΚ/νομικές μορφές), only human-readable program content.
  const sections: string[] = []

  if (program.description) {
    sections.push(section('Περιγραφή', `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${program.description}</p>`))
  }

  const figureRows: Array<[string, string]> = []
  if (program.category === 'DYPA') {
    if (program.monthlyAmount) figureRows.push(['Μηνιαία επιχορήγηση', program.monthlyAmount])
    if (program.subsidyMonths) figureRows.push(['Μήνες επιχορήγησης', program.subsidyMonths])
    if (program.totalBenefit) figureRows.push(['Συνολικό όφελος', program.totalBenefit])
  } else {
    const invest = formatEuroRange(program.minInvestment, program.maxInvestment)
    if (invest) figureRows.push(['Ποσό επένδυσης', invest])
    if (program.category === 'MICROCREDITS') {
      const rate = formatPctRange(program.minInterestRate, program.maxInterestRate)
      if (rate) figureRows.push(['Επιτόκιο', rate])
    } else {
      const subsidy = formatPctRange(program.minSubsidyPct, program.maxSubsidyPct)
      if (subsidy) figureRows.push(['% Επιχορήγησης', subsidy + (program.subsidyNote ? ` (${program.subsidyNote})` : '')])
    }
  }
  if (program.totalBudgetEur) figureRows.push(['Συνολικός προϋπολογισμός προγράμματος', formatEuroRange(program.totalBudgetEur, program.totalBudgetEur) || ''])
  if (program.implementationMonths) figureRows.push(['Διάρκεια υλοποίησης', `${program.implementationMonths} μήνες`])
  if (program.regions) figureRows.push(['Περιοχές', program.regions])
  if (figureRows.length > 0) {
    sections.push(section('Βασικά Στοιχεία', `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;">
        ${figureRows.map(([k, v]) => `<tr><td style="padding:4px 0;color:#6b7280;width:55%;">${k}</td><td style="padding:4px 0;color:#111827;font-weight:600;">${v}</td></tr>`).join('')}
      </table>`))
  }

  const deadlineRows: Array<[string, string]> = []
  const startStr = formatProspectDate(program.startDate)
  if (startStr) deadlineRows.push(['Υποβολή αιτήσεων από', startStr])
  const endStr = formatProspectDate(program.endDate) || deadlineFallbackByCategory(program.category)
  if (endStr) deadlineRows.push(['Προθεσμία υποβολής αιτήσεων', endStr])
  if (deadlineRows.length > 0) {
    sections.push(section('Προθεσμίες', `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;">
        ${deadlineRows.map(([k, v]) => `<tr><td style="padding:4px 0;color:#6b7280;width:55%;">${k}</td><td style="padding:4px 0;color:#111827;font-weight:600;">${v}</td></tr>`).join('')}
      </table>`))
  }

  if (extraCriteriaLabels.length > 0) {
    sections.push(section('Πρόσθετες Προϋποθέσεις', `
      <p style="margin:0;">
        ${extraCriteriaLabels.map(label => `<span style="display:inline-block;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin:0 6px 6px 0;">${label}</span>`).join('')}
      </p>`))
  }

  if (program.beneficiaries) {
    sections.push(section('Ποιους αφορά', `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${program.beneficiaries}</p>`))
  }

  if (program.keyPoints?.length > 0) {
    sections.push(section('Σημεία που ξεχωρίζουν', `
      <ul style="margin:0;padding-left:18px;">
        ${program.keyPoints.map(p => `<li style="font-size:13.5px;color:#374151;line-height:1.8;">${p}</li>`).join('')}
      </ul>`))
  }

  const fundedActions = Array.isArray(program.fundedActions) ? program.fundedActions as { title?: string; description?: string }[] : []
  if (fundedActions.length > 0) {
    sections.push(section('Τι χρηματοδοτείται', `
      <ul style="margin:0;padding-left:18px;">
        ${fundedActions.map(a => `<li style="font-size:13.5px;color:#374151;line-height:1.8;"><strong>${a.title || ''}</strong>${a.description ? ` — ${a.description}` : ''}</li>`).join('')}
      </ul>`))
  }

  const expenseCategories = Array.isArray(program.expenseCategories)
    ? program.expenseCategories as { code?: string; category?: string; expense?: string; limit?: string }[]
    : []
  if (expenseCategories.length > 0) {
    sections.push(section('Επιλέξιμες Κατηγορίες Δαπανών', `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12.5px;border-collapse:collapse;">
        <tr style="background:#f3f4f6;">
          <td style="padding:6px 8px;font-weight:700;color:#374151;">Κωδικός</td>
          <td style="padding:6px 8px;font-weight:700;color:#374151;">Κατηγορία</td>
          <td style="padding:6px 8px;font-weight:700;color:#374151;">Δαπάνη</td>
          <td style="padding:6px 8px;font-weight:700;color:#374151;">Όριο</td>
        </tr>
        ${expenseCategories.map(c => `<tr style="border-top:1px solid #e5e7eb;">
          <td style="padding:6px 8px;color:#4b5563;">${c.code || ''}</td>
          <td style="padding:6px 8px;color:#4b5563;">${c.category || ''}</td>
          <td style="padding:6px 8px;color:#4b5563;">${c.expense || ''}</td>
          <td style="padding:6px 8px;color:#4b5563;">${c.limit || ''}</td>
        </tr>`).join('')}
      </table>`))
  }

  if (program.otherRequirements) {
    sections.push(section('Λοιπές Προϋποθέσεις', `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${program.otherRequirements}</p>`))
  }

  if (requiredDocuments.length > 0) {
    sections.push(section('Απαιτούμενα Έγγραφα', `
      <ul style="margin:0;padding-left:18px;">
        ${requiredDocuments.map(d => `<li style="font-size:13.5px;color:#374151;line-height:1.8;">
          <strong>${d.name}</strong>
          ${DOCUMENT_CATEGORY_LABELS[d.category] ? ` <span style="color:#9ca3af;">(${DOCUMENT_CATEGORY_LABELS[d.category]})</span>` : ''}
          ${d.instructions ? `<br/><span style="color:#6b7280;">${d.instructions}</span>` : ''}
        </li>`).join('')}
      </ul>`))
  }

  // Service cost — shown here because this email goes straight to a
  // prospect an admin/consultant is actively talking to, not the generic
  // public page (pricingNote is otherwise chat-agent-only, see schema).
  if (program.pricingNote) {
    sections.push(section('Κόστος Υπηρεσίας I-MENTOR', `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
        <p style="margin:0;font-size:13.5px;color:#92400e;line-height:1.7;white-space:pre-line;">${program.pricingNote}</p>
      </div>`))
  }

  if (program.internalNotes) {
    sections.push(section('Εσωτερικές Σημειώσεις', `<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${program.internalNotes}</p>`))
  }

  // Only real hosted URLs belong in an email link — a data: URI (a file
  // stored as inline base64 instead of being uploaded somewhere) can be
  // hundreds of KB, which pushes the whole message over Gmail's ~102KB clip
  // threshold and breaks the HTML mid-tag until the recipient clicks "View
  // entire message". Any such attachment is silently skipped here instead.
  const isEmailSafeUrl = (url: string) => /^https?:\/\//i.test(url)

  const links: string[] = []
  if (program.websiteUrl) links.push(`<a href="${program.websiteUrl}" style="color:#4f46e5;text-decoration:underline;">Σελίδα προγράμματος</a>`)
  program.attachmentUrls.forEach((url, i) => {
    if (!isEmailSafeUrl(url)) return
    const docName = program.attachmentNames[i] || `Έγγραφο ${i + 1}`
    links.push(`<a href="${url}" style="color:#4f46e5;text-decoration:underline;">${docName}</a>`)
  })
  program.videoUrls.forEach((url, i) => {
    if (!isEmailSafeUrl(url)) return
    links.push(`<a href="${url}" style="color:#4f46e5;text-decoration:underline;">Βίντεο ${i + 1}</a>`)
  })
  if (links.length > 0) {
    sections.push(section('Χρήσιμοι Σύνδεσμοι', `<p style="margin:0;font-size:13.5px;line-height:2;">${links.join(' &nbsp;·&nbsp; ')}</p>`))
  }

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;border-radius:12px 12px 0 0;">
        ${brandLeft}
        <h1 style="margin:18px 0 0;color:#fff;font-size:19px;">✅ Είστε επιλέξιμοι για επιχορήγηση</h1>
      </div>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${name},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
          Χάρηκα για τη συζήτησή μας — ελέγξαμε τα στοιχεία της επιχείρησής σας και είστε επιλέξιμοι για το παρακάτω πρόγραμμα. Σας παραθέτω όλες τις διαθέσιμες πληροφορίες:
        </p>
        ${customMessage ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#3730a3;line-height:1.7;white-space:pre-line;">${customMessage}</p>
        </div>` : ''}
        ${buildAadeBusinessDetailsCardHtml(businessDetails)}
        ${reasonsBlock}
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:22px 24px;margin-bottom:16px;">
          <p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#111827;">${program.title}</p>
          ${sections.join('')}
        </div>
        <p style="margin:20px 0 0;font-size:12.5px;color:#9ca3af;">iMentor Consulting</p>
      </div>
    </div>`
}

// Condensed, link-based plain-text version for Viber — no HTML/buttons.
export function buildEligibilityViberText(params: {
  businessName: string | null
  programs: EligibilityProgramResult[]
  accountantInfo?: AccountantMentionInfo | null
}): string {
  const { businessName, programs, accountantInfo } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'

  const intro = programs.length === 1
    ? `${name}, εντοπίσαμε 1 πρόγραμμα επιχορήγησης για το οποίο είστε πιθανώς επιλέξιμοι:`
    : `${name}, εντοπίσαμε ${programs.length} προγράμματα επιχορήγησης για τα οποία είστε πιθανώς επιλέξιμοι:`

  // Viber (via Chatwoot) supports simple *bold* markup, same convention as
  // WhatsApp — used here for program titles and the accountant's office name
  // so they stand out in a plain-text message. The office name leads the
  // whole message (not a parenthetical further down) when accountant-branded,
  // matching the email's logo-first header — Viber has no image support, so
  // the bolded name is the only way to make the branding stand out there.
  const lines: string[] = []
  if (accountantInfo?.officeName) {
    lines.push(`🏢 *${accountantInfo.officeName}* × I-MENTOR`, '')
  }
  lines.push(`🎯 ${intro}`, '')
  programs.forEach((p, i) => {
    lines.push(`${i + 1}. *${p.title}*`)
    lines.push(`🤖 Δωρεάν έλεγχος με τον Ερμή: ${p.ermisUrl}`, '')
  })
  lines.push('iMentor Consulting')

  return lines.join('\n')
}
