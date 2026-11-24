// I-MENTOR's fee schedule for an investment-based program (ΕΣΠΑ/LEADER/
// ΔΥΠΑ): a flat lookup table of investment-amount brackets, each with its
// own fixed application fee and implementation/monitoring fee — set
// directly per bracket, not computed from a percentage formula. The
// application fee is paid upfront, before submission; the implementation/
// monitoring fee is paid in stages, alongside the program's own
// disbursements, only after approval.
export interface PricingBracket {
  minAmount: number
  // null = no upper bound (open-ended top bracket)
  maxAmount: number | null
  applicationFee: number
  implementationFee: number
}

// Transcribed directly from the consultant's standard pricing spreadsheet
// (each bracket's fee = the spreadsheet's value at that bracket's upper
// investment amount) — the default for every program that hasn't been
// given its own custom bracket table.
export const DEFAULT_INVESTMENT_PRICING_BRACKETS: PricingBracket[] = [
  // Minimum fee (new price list, Nov 2026): 1.200€ application + 4.000€ monitoring,
  // for every investment up to 80.000€ — the first row covers everything below 70.000€ too.
  { minAmount: 0, maxAmount: 69999, applicationFee: 1200, implementationFee: 4000 },
  // New price list (Nov 2026): application fee +70€ and monitoring fee +250€ per 10.000€ step.
  { minAmount: 70000, maxAmount: 80000, applicationFee: 1200, implementationFee: 4000 },
  { minAmount: 80001, maxAmount: 90000, applicationFee: 1270, implementationFee: 4250 },
  { minAmount: 90001, maxAmount: 100000, applicationFee: 1340, implementationFee: 4500 },
  { minAmount: 100001, maxAmount: 110000, applicationFee: 1410, implementationFee: 4750 },
  { minAmount: 110001, maxAmount: 120000, applicationFee: 1480, implementationFee: 5000 },
  { minAmount: 120001, maxAmount: 130000, applicationFee: 1550, implementationFee: 5250 },
  { minAmount: 130001, maxAmount: 140000, applicationFee: 1620, implementationFee: 5500 },
  { minAmount: 140001, maxAmount: 150000, applicationFee: 1690, implementationFee: 5750 },
  { minAmount: 150001, maxAmount: 160000, applicationFee: 1760, implementationFee: 6000 },
  { minAmount: 160001, maxAmount: 170000, applicationFee: 1830, implementationFee: 6250 },
  { minAmount: 170001, maxAmount: 180000, applicationFee: 1900, implementationFee: 6500 },
  { minAmount: 180001, maxAmount: 190000, applicationFee: 1970, implementationFee: 6750 },
  { minAmount: 190001, maxAmount: 200000, applicationFee: 2040, implementationFee: 7000 },
  { minAmount: 200001, maxAmount: 210000, applicationFee: 2110, implementationFee: 7250 },
  { minAmount: 210001, maxAmount: 220000, applicationFee: 2180, implementationFee: 7500 },
  { minAmount: 220001, maxAmount: 230000, applicationFee: 2250, implementationFee: 7750 },
  { minAmount: 230001, maxAmount: 240000, applicationFee: 2320, implementationFee: 8000 },
  { minAmount: 240001, maxAmount: 250000, applicationFee: 2390, implementationFee: 8250 },
  // The list ends at 400.000€; kept open-ended so larger investments still get a price.
  { minAmount: 250001, maxAmount: null, applicationFee: 2460, implementationFee: 8500 },
]

export interface InvestmentFees {
  applicationFee: number
  implementationFee: number
}

// Returns null if no bracket covers the amount (e.g. a negative number, or
// gaps left by a custom table that doesn't fully cover the range) — the
// caller decides how to handle "no price for this amount" rather than this
// function guessing a fallback.
//
// brackets: null/undefined → the standard table above; an EMPTY array → the
// admin deliberately removed this program's table (no fees are quoted for it).
export function computeInvestmentFees(investmentAmount: number, brackets?: PricingBracket[] | null): InvestmentFees | null {
  const list = brackets == null ? DEFAULT_INVESTMENT_PRICING_BRACKETS : brackets
  const bracket = list.find(b => investmentAmount >= b.minAmount && (b.maxAmount == null || investmentAmount <= b.maxAmount))
  return bracket ? { applicationFee: bracket.applicationFee, implementationFee: bracket.implementationFee } : null
}
