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
  { minAmount: 0, maxAmount: 70000, applicationFee: 800, implementationFee: 3000 },
  { minAmount: 70001, maxAmount: 90000, applicationFee: 800, implementationFee: 3600 },
  { minAmount: 90001, maxAmount: 110000, applicationFee: 880, implementationFee: 4400 },
  { minAmount: 110001, maxAmount: 130000, applicationFee: 1040, implementationFee: 5200 },
  { minAmount: 130001, maxAmount: 150000, applicationFee: 1200, implementationFee: 6000 },
  { minAmount: 150001, maxAmount: 170000, applicationFee: 1360, implementationFee: 6800 },
  { minAmount: 170001, maxAmount: 190000, applicationFee: 1520, implementationFee: 7600 },
  { minAmount: 190001, maxAmount: 210000, applicationFee: 1680, implementationFee: 8000 },
  { minAmount: 210001, maxAmount: 230000, applicationFee: 1840, implementationFee: 8000 },
  { minAmount: 230001, maxAmount: 250000, applicationFee: 2000, implementationFee: 8000 },
  { minAmount: 250001, maxAmount: null, applicationFee: 2000, implementationFee: 8000 },
]

export interface InvestmentFees {
  applicationFee: number
  implementationFee: number
}

// Returns null if no bracket covers the amount (e.g. a negative number, or
// gaps left by a custom table that doesn't fully cover the range) — the
// caller decides how to handle "no price for this amount" rather than this
// function guessing a fallback.
export function computeInvestmentFees(investmentAmount: number, brackets?: PricingBracket[] | null): InvestmentFees | null {
  const list = brackets && brackets.length > 0 ? brackets : DEFAULT_INVESTMENT_PRICING_BRACKETS
  const bracket = list.find(b => investmentAmount >= b.minAmount && (b.maxAmount == null || investmentAmount <= b.maxAmount))
  return bracket ? { applicationFee: bracket.applicationFee, implementationFee: bracket.implementationFee } : null
}
