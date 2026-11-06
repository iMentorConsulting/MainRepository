// I-MENTOR's standard fee schedule for an investment-based program: the
// application fee (paid upfront, before submission) and the implementation/
// monitoring fee (paid in stages, alongside the program's own disbursements,
// only after approval) are each a clamped percentage of the investment
// amount. Mirrors the consultant's pricing spreadsheet exactly — a straight
// MIN(MAX(pct% * investment, min), max) per fee, continuous in the
// investment amount (the spreadsheet's 20.000€ row steps are just how it's
// displayed, not how it's computed).
export interface InvestmentPricingConfig {
  feeApplicationPct: number
  feeApplicationMin: number
  feeApplicationMax: number
  feeImplementationPct: number
  feeImplementationMin: number
  feeImplementationMax: number
}

export interface InvestmentFees {
  applicationFee: number
  implementationFee: number
}

function clampPct(investmentAmount: number, pct: number, min: number, max: number): number {
  return Math.min(Math.max((pct / 100) * investmentAmount, min), max)
}

export function computeInvestmentFees(investmentAmount: number, program: InvestmentPricingConfig): InvestmentFees {
  return {
    applicationFee: clampPct(investmentAmount, program.feeApplicationPct, program.feeApplicationMin, program.feeApplicationMax),
    implementationFee: clampPct(investmentAmount, program.feeImplementationPct, program.feeImplementationMin, program.feeImplementationMax),
  }
}
