// ============================================================
// Algorithm parameters — ΚΥΑ 13243/2024 (Πρόταση Β, Τράπεζες)
// Update EURIBOR_3M manually after each ECB announcement.
// ============================================================

export const EURIBOR_3M = 0.0216 // as of 2024 Q4

export const PARAMS_B = {
  label: 'Πρόταση Β — ΚΥΑ 13243/2024',

  // Promo period: first 36 months
  promoMonths: 36,

  // Promo interest rates
  promoRateSecured: 0.03,   // 3% — secured bank debt
  promoRateUnsecured: 0.04, // 4% — unsecured bank debt
  publicRate: 0.03,         // 3% flat forever — public creditors (no step-up)

  // Post-promo: Euribor + spread
  euribor3m: EURIBOR_3M,
  securedSpreadAfterPromo: 0.025,   // Euribor + 2.5%
  unsecuredSpreadAfterPromo: 0.03,  // Euribor + 3.0%

  // Maximum repayment duration (months)
  maxMonths: {
    fpSecured: 420,   // FP — secured bank
    fpUnsecured: 240, // FP — unsecured bank
    leSecured: 240,   // LE — secured bank
    leUnsecured: 180, // LE — unsecured bank
    publicMax: 240,   // All public creditors (Εφορία, ΕΦΚΑ)
  },

  // Age cap (physical persons only)
  ageCap: 85, // effective max = min(theoretical, max(12, (85 − youngest_age) × 12))

  // Write-off caps per creditor category
  recovery: {
    bankPrincipalMin: 0.20,       // banks must recover ≥ 20% of principal
    bankInterestWriteoffMax: 1.00, // 100% of interest/surcharges can be waived
    publicPrincipalMin: 0.25,     // public must recover ≥ 25% of principal
    publicInterestWriteoffMax: 0.85, // 85% of interest/surcharges can be waived
  },

  // Minimum monthly installment floors
  minInstallment: {
    securedPerContract: 50,     // per individual secured contract
    unsecuredPerCreditor: 50,   // total unsecured per creditor
    publicTotal: 50,            // total public per creditor type
  },

  // Partially-secured rule (ΚΥΑ art. on partly-covered debts)
  partiallySecuredThreshold: 0.20, // if net_collateral / debt > 20%
  collateralFactor: 0.97,          // net collateral = property_value × 0.97

  // FP rent cap (ΚΥΑ Παράρτημα παρ. δ) — monthly €, applied before ×12
  rentCapBase: 350,       // base monthly cap for single-member household
  rentCapPerMember: 50,   // +€50 per additional member
  rentCapMax: 550,        // absolute monthly ceiling

  // FP exempt savings (not counted as available asset for coverage)
  fpExemptSavingsBase: 2000,
  fpExemptSavingsPerMember: 1000,
  fpExemptSavingsMax: 5000,
  fpSavingsIncomeRate: 0.95, // 95% of excess savings added to annual disposable

  // Per-category write-off rates for public debts (used when pubCategories present)
  pubCategoryRates: {
    nonErasableBasic: 0.00,       // Βασική παρακρατούμενων/επιρριπτ. (ΦΠΑ, ΦΜΥ) & παρακρατ. εισφορών ΕΦΚΑ
    nonErasableSurcharges: 0.85,  // Προσαυξ./τόκοι ΜΗ ΔΙΑΓΡ. βασικής — ακολουθεί γενικό κανόνα 85%
    otherBasic: 0.75,             // Λοιπές βασικές ΑΑΔΕ (εισόδημα, ΕΝΦΙΑ, ΓΕΜΗ) + εργοδοτ. εισφορές ΕΦΚΑ
    otherSurcharges: 0.85,        // Προσαυξ./τόκοι ΔΙΑΓΡ. βασικής — ΑΑΔΕ + ΕΦΚΑ
    fines: 0.95,                  // Πρόστιμα φορολογικής διοίκησης — ΑΑΔΕ only
  },

  // LE income calculation
  leTurnoverThreshold: 2500000, // "small LE" if turnover < 2.5M
  leIncomeFloorPct: 0.10,       // floor = 10% of turnover for small LE
  leDepositRate: 0.95,          // 95% of deposits counted as income

  // FP Επιτηδευματίας (sole trader / self-employed) — ΦΕΚ Β' 2499/2021 §9 + ΦΕΚ Β' 2896/2021 §7.1/4
  fpSelfEmployedFloorPct: 0.10, // default "εύλογο ποσοστό" — overridable per case via fp_eulogo_pct field
}

// Conservative scenario factors — empirical, not statutory.
// Simulate likely intervention by the Coordinator Creditor (ΚΥΑ 77697/2021 §3.4)
// which typically reduces Proposal B write-offs before the voting phase.
// Update after each batch of ~20 closed cases with known outcomes.
// Last updated: 2026-04-28
export const CONSERVATIVE_FACTORS = {
  PUBLIC: 1.00,             // Δημόσιο/ΦΚΑ — legally fixed, Coordinator cannot alter
  PRIVATE_SECURED: 0.65,   // Secured bank: conservative retains 65% of computed write-off
  PRIVATE_UNSECURED: 0.75, // Unsecured bank: conservative retains 75% of computed write-off
}
