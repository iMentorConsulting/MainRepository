// "ΑΝΑΛΥΣΗ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ" email for ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ — mirrors the
// consultant's existing manual Word template exactly (structure, section
// order, fixed boilerplate paragraphs, bank accounts), but generated from
// real business/program data instead of filled in by hand, and extended
// with a full per-ΚΑΔ eligibility breakdown.
import { buildBankAccountsHtml } from './imentor-bank-accounts'

export interface MicrocreditsKadRow {
  code: string
  descr: string | null
  isMain: boolean
  eligible: boolean
}

export function buildMicrocreditsEmailSubject(businessName: string | null): string {
  return `Ανάλυση Επιλεξιμότητας – ${businessName || 'Επιχείρηση'} – Ταμείο Μικροπιστώσεων`
}

export function buildMicrocreditsEmailHtml(params: {
  businessName: string | null
  afm: string
  legalStatusDescr: string | null
  legalFormEligible: boolean
  kadRows: MicrocreditsKadRow[]
  income: number
  profit: number
  proposedAmount: number
  consultantName: string
  customMessage?: string | null
  imentorLogoUrl?: string | null
}): string {
  const { businessName, afm, legalStatusDescr, legalFormEligible, kadRows, income, profit, proposedAmount, consultantName, customMessage, imentorLogoUrl } = params
  const name = businessName || 'Η επιχείρησή σας'
  const mainKad = kadRows.find(k => k.isMain) || kadRows[0]
  const fmtEur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
  const netMarginPct = income > 0 ? ((profit / income) * 100).toFixed(2) : null

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:60px;width:auto;max-width:220px;object-fit:contain;" />`
    : `<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:20px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;width:35%;">${label}</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${value}</td>
    </tr>`

  const infoTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13.5px;margin-bottom:20px;">
      ${row('Επωνυμία', name)}
      ${row('ΑΦΜ', afm)}
      ${row('Νομική μορφή', `${legalStatusDescr || '—'} – ${legalFormEligible ? 'Επιλέξιμη νομική μορφή' : 'Μη επιλέξιμη νομική μορφή'}`)}
      ${row('ΚΑΔ κύριας δραστηριότητας', mainKad ? `${mainKad.code} – ${mainKad.descr || ''} – ${mainKad.eligible ? 'Επιλέξιμος' : 'Μη επιλέξιμος'}` : '—')}
      ${row('Έσοδα', fmtEur(income))}
      ${row('Καθαρά Κέρδη', fmtEur(profit))}
    </table>`

  const kadListTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12.5px;margin-bottom:20px;">
      <tr style="background:#f3f4f6;">
        <td style="padding:6px 10px;font-weight:700;color:#374151;border:1px solid #e5e7eb;">ΚΑΔ</td>
        <td style="padding:6px 10px;font-weight:700;color:#374151;border:1px solid #e5e7eb;">Περιγραφή</td>
        <td style="padding:6px 10px;font-weight:700;color:#374151;border:1px solid #e5e7eb;">Επιλεξιμότητα</td>
      </tr>
      ${kadRows.map(k => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#4b5563;">${k.code}${k.isMain ? ' <span style="color:#9ca3af;">(κύριος)</span>' : ''}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#4b5563;">${k.descr || ''}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;color:${k.eligible ? '#15803d' : '#b91c1c'};">${k.eligible ? '✔ Επιλέξιμος' : '✘ Μη επιλέξιμος'}</td>
        </tr>`).join('')}
    </table>`

  const analysisBullets = [
    `Κύκλος εργασιών ${fmtEur(income)}.`,
    netMarginPct
      ? `Καθαρά κέρδη ${fmtEur(profit)}, με περιθώριο καθαρού κέρδους περίπου ${netMarginPct}%.`
      : `Καθαρά κέρδη ${fmtEur(profit)}.`,
    mainKad
      ? `Ο ΚΑΔ ${mainKad.code} είναι ${mainKad.eligible ? 'επιλέξιμος' : 'μη επιλέξιμος'}, σύμφωνα με τα παρεχόμενα στοιχεία.`
      : '',
  ].filter(Boolean)

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
      <tr><td bgcolor="#1e3a8a" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:22px 26px;">
        ${brandLeft}
        <h1 style="margin:16px 0 0;color:#fff;font-size:18px;">Ανάλυση Επιλεξιμότητας – ${name}</h1>
        <p style="margin:4px 0 0;color:#dbeafe;font-size:13px;">Ταμείο Μικροπιστώσεων</p>
      </td></tr>
      </table>
      <div style="background:#ffffff;padding:24px 26px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:15px;">Αγαπητέ/ή ${name},</p>
        <p style="margin:0 0 18px;font-size:14px;color:#4b5563;line-height:1.6;">
          Σας αποστέλλουμε την ανάλυση επιλεξιμότητάς σας για το Ταμείο Μικροπιστώσεων.
        </p>
        ${customMessage ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px 14px;margin:0 0 18px;">
          <p style="margin:0;font-size:13.5px;color:#3730a3;line-height:1.7;white-space:pre-line;">${customMessage}</p>
        </div>` : ''}

        ${infoTable}

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">ΚΑΔ Επιχείρησης</p>
        ${kadListTable}

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">Εκτίμηση &amp; Ανάλυση</p>
        <ul style="margin:0 0 20px;padding-left:18px;">
          ${analysisBullets.map(b => `<li style="font-size:13.5px;color:#374151;line-height:1.8;">${b}</li>`).join('')}
        </ul>

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">Πρόταση Αιτήματος</p>
        <p style="margin:0 0 20px;font-size:14px;color:#111827;font-weight:600;">Προτείνεται αίτημα έως ${fmtEur(proposedAmount)}.</p>

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">Βασικές Προϋποθέσεις</p>
        <ul style="margin:0 0 20px;padding-left:18px;">
          <li style="font-size:13.5px;color:#374151;line-height:1.8;">Φορολογική &amp; Ασφαλιστική Ενημερότητα.</li>
          <li style="font-size:13.5px;color:#374151;line-height:1.8;">Απουσία δυσμενών εγγραφών στον Τειρεσία της εταιρείας και των προσώπων που ελέγχονται κατά την πιστοδοτική αξιολόγηση.</li>
          <li style="font-size:13.5px;color:#374151;line-height:1.8;">Θετική τραπεζική συμπεριφορά.</li>
          <li style="font-size:13.5px;color:#374151;line-height:1.8;">Δεν απαιτείται έκδοση ενημεροτήτων τώρα· αρκεί να μπορούν να εκδοθούν όταν ζητηθούν.</li>
        </ul>

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">Επόμενο Βήμα – Ενεργοποίηση Διαδικασίας</p>
        <p style="margin:0 0 10px;font-size:13.5px;color:#374151;line-height:1.7;">
          Για να προχωρήσουμε σε υποβολή απαιτείται η πληρωμή κόστους υποβολής (150€ + ΦΠΑ = 186€).<br/>
          Σε περίπτωση αποδοχής της αίτησης, το τελικό κόστος ολοκλήρωσης ανέρχεται σε 250€ + ΦΠΑ = 310€.
        </p>

        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e3a8a;">Τραπεζικοί Λογαριασμοί Κατάθεσης</p>
        <div style="margin:0 0 20px;">${buildBankAccountsHtml()}</div>

        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Με εκτίμηση,<br/><strong>${consultantName}</strong><br/>I-MENTOR Consulting</p>
      </div>
    </div>`
}
