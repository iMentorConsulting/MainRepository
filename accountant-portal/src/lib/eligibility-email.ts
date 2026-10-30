import { buildProgramDescription } from './ermis-program-payload'
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
}): string {
  const { businessName, programs, businessDetails, accountantInfo } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'

  const cards = programs.map(p => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${p.title}</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4b5563;line-height:1.6;white-space:pre-line;">${buildProgramDescription(p)}</p>
      <a href="${p.ermisUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 26px;border-radius:8px;">
        🤖 Μιλήστε με τον «Ερμή» — ΔΩΡΕΑΝ έλεγχος
      </a>
    </div>`).join('')

  // Logo + office name lead the header itself (not just a footnote further
  // down) so the accountant's branding is the first thing seen, before any
  // I-MENTOR framing — this is explicitly what makes an accountant-branded
  // send feel like it's coming from their own office, not a generic blast.
  const accountantHeader = accountantInfo
    ? `<div style="background:#ffffff;padding:18px 28px;border:1px solid #e5e7eb;border-bottom:none;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:14px;">
         ${accountantInfo.logoUrl ? `<img src="${accountantInfo.logoUrl}" alt="${accountantInfo.officeName}" style="max-height:48px;max-width:160px;object-fit:contain;" />` : ''}
         <p style="margin:0;font-size:17px;font-weight:800;color:#111827;">${accountantInfo.officeName}</p>
       </div>`
    : ''

  const accountantNote = accountantInfo
    ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
         Η ενημέρωση αυτή σας αποστέλλεται σε συνεργασία με το λογιστικό σας γραφείο <strong>${accountantInfo.officeName}</strong>.
       </p>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      ${accountantHeader}
      <div style="background:#1e3a8a;padding:24px 28px;${accountantInfo ? '' : 'border-radius:12px 12px 0 0;'}">
        <h1 style="margin:0;color:#fff;font-size:19px;">✅ Βρέθηκαν διαθέσιμα προγράμματα</h1>
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
