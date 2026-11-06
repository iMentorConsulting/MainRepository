// I-MENTOR's deposit accounts for service fees — shared by every email that
// quotes a cost (ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ analysis, investment-based program
// application/implementation fees), so they never drift apart.
export const IMENTOR_BANK_ACCOUNTS: { bank: string; iban: string }[] = [
  { bank: 'Τράπεζα Πειραιώς', iban: 'GR4501714330006433164381388' },
  { bank: 'Alpha Bank', iban: 'GR2401407750775002330002138' },
  { bank: 'Eurobank', iban: 'GR5802601680000060201330648' },
  { bank: 'Εθνική', iban: 'GR9101102050000091023497604' },
]

export function buildBankAccountsHtml(): string {
  return `
    <p style="margin:0;font-size:13.5px;color:#374151;line-height:1.8;">
      Δικαιούχος: I MENTOR IKE<br/>
      ${IMENTOR_BANK_ACCOUNTS.map(a => `${a.bank}: ${a.iban}`).join('<br/>')}
    </p>`
}
