import { buildProgramDescription } from './ermis-program-payload'
import type { EligibilityProgramResult } from './eligibility-check-core'

// Sent when a website/Moosend signup turns out to be eligible for one or
// more programs — lists every eligible program with its own "chat with
// Ermis" link, same underlying data the on-page widget already shows live,
// just delivered as an email for signups that happen off-page.
export function buildEligibilitySubject(businessName: string | null, programCount: number): string {
  const name = businessName || 'Η επιχείρησή σας'
  return programCount === 1
    ? `${name} — Βρέθηκε πρόγραμμα επιχορήγησης για εσάς`
    : `${name} — Βρέθηκαν ${programCount} προγράμματα επιχορήγησης για εσάς`
}

export function buildEligibilityEmailHtml(params: {
  businessName: string | null
  programs: EligibilityProgramResult[]
}): string {
  const { businessName, programs } = params
  const name = businessName || 'Αγαπητέ/ή πελάτη'

  const cards = programs.map(p => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${p.title}</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4b5563;line-height:1.6;white-space:pre-line;">${buildProgramDescription(p)}</p>
      <a href="${p.ermisUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 26px;border-radius:8px;">
        🤖 Μιλήστε με τον «Ερμή» — ΔΩΡΕΑΝ έλεγχος
      </a>
    </div>`).join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;padding:24px 28px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:19px;">✅ Βρέθηκαν διαθέσιμα προγράμματα</h1>
      </div>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${name},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
          Ελέγξαμε τα στοιχεία της επιχείρησής σας και εντοπίσαμε ${programs.length === 1 ? 'το παρακάτω πρόγραμμα' : `τα παρακάτω ${programs.length} προγράμματα`} για τα οποία είστε πιθανώς επιλέξιμοι:
        </p>
        ${cards}
        <p style="margin:20px 0 0;font-size:12.5px;color:#9ca3af;">iMentor Consulting</p>
      </div>
    </div>`
}
