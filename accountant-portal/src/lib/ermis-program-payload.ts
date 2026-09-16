// Builds the per-program fields sent to the Case Management app inside the
// ermis.business_ready webhook's `matchedPrograms` array — the CM category
// label and a client-facing description combining the program's ΠΕΡΙΓΡΑΦΗ
// with the category-specific numbers shown on the public program page
// (investment/subsidy % for most programs, ΔΥΠΑ hiring-subsidy figures for
// ΔΥΠΑ, investment/interest-rate for μικροπιστώσεις).

// Logistis' internal ProgramCategory enum values don't match CM's category
// vocabulary 1:1 (e.g. "MICROCREDITS" vs "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ").
export const CM_CATEGORY_LABEL: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ',
  ANAPTYXIAKOS: 'ΑΝΑΠΤΥΞΙΑΚΟΣ',
  RENOVATION: 'ΑΝΑΚΑΙΝΙΖΩ',
  EXTRAJUDICIAL: 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ',
  OTHER: 'ΑΛΛΟ',
}

function formatEuroRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => `${n.toLocaleString('el-GR')}€`
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`
  return fmt((min ?? max) as number)
}

function formatPctRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => `${n}%`
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`
  return fmt((min ?? max) as number)
}

export interface ProgramDescriptionInput {
  category: string
  description: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  monthlyAmount: string | null
  subsidyMonths: string | null
  totalBenefit: string | null
}

// Mirrors the public program page's "ΠΕΡΙΓΡΑΦΗ" card plus whichever
// category-specific figure card applies (investment/subsidy %, ΔΥΠΑ hiring
// subsidy, or investment/interest rate), joined as lines for the client
// message.
export function buildProgramDescription(program: ProgramDescriptionInput): string {
  const parts: string[] = []
  if (program.description) parts.push(program.description.trim())

  if (program.category === 'DYPA') {
    if (program.monthlyAmount) parts.push(`Μηνιαία επιχορήγηση: ${program.monthlyAmount}`)
    if (program.subsidyMonths) parts.push(`Μήνες επιχορήγησης: ${program.subsidyMonths}`)
    if (program.totalBenefit) parts.push(`Συνολικό όφελος: ${program.totalBenefit}`)
  } else if (program.category === 'MICROCREDITS') {
    const invest = formatEuroRange(program.minInvestment, program.maxInvestment)
    if (invest) parts.push(`Ποσό επένδυσης: ${invest}`)
    const rate = formatPctRange(program.minInterestRate, program.maxInterestRate)
    if (rate) parts.push(`Επιτόκιο: ${rate}`)
  } else {
    const invest = formatEuroRange(program.minInvestment, program.maxInvestment)
    if (invest) parts.push(`Ποσό επένδυσης: ${invest}`)
    const subsidy = formatPctRange(program.minSubsidyPct, program.maxSubsidyPct)
    if (subsidy) parts.push(`% Επιχορήγησης: ${subsidy}`)
  }

  return parts.join('\n')
}
