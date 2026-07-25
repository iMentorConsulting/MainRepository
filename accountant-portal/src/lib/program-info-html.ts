type ProgramInfoInput = {
  category: string
  monthlyAmount?: string | null
  subsidyMonths?: string | null
  totalBenefit?: string | null
  minInvestment?: number | null
  maxInvestment?: number | null
  minSubsidyPct?: number | null
  maxSubsidyPct?: number | null
  minInterestRate?: number | null
  maxInterestRate?: number | null
}

function eur(n: number) {
  return n.toLocaleString('el-GR') + '€'
}

function pct(n: number) {
  return n % 1 === 0 ? `${n}%` : `${n}%`
}

function cell(label: string, value: string) {
  return `<td style="padding: 0 24px 0 0; vertical-align: top; min-width: 110px;">
    <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280;">${label}</p>
    <p style="margin: 0; font-size: 20px; font-weight: 700; color: #4f46e5;">${value}</p>
  </td>`
}

export function buildProgramInfoHtml(program: ProgramInfoInput): string {
  const cells: string[] = []

  if (program.category === 'DYPA') {
    if (program.monthlyAmount) cells.push(cell('Μηνιαία Επιχορήγηση', program.monthlyAmount))
    if (program.subsidyMonths) cells.push(cell('Μήνες Επιχορήγησης', program.subsidyMonths))
    if (program.totalBenefit) cells.push(cell('Συνολικό Όφελος', program.totalBenefit))
  } else if (program.category === 'ESPA') {
    if (program.minInvestment != null || program.maxInvestment != null) {
      const min = program.minInvestment != null ? eur(program.minInvestment) : null
      const max = program.maxInvestment != null ? eur(program.maxInvestment) : null
      const range = [min, max].filter(Boolean).join(' — ')
      if (range) cells.push(cell('Ποσό Επένδυσης', range))
    }
    if (program.minSubsidyPct != null || program.maxSubsidyPct != null) {
      const min = program.minSubsidyPct != null ? pct(program.minSubsidyPct) : null
      const max = program.maxSubsidyPct != null ? pct(program.maxSubsidyPct) : null
      const range = [min, max].filter(Boolean).join(' — ')
      if (range) cells.push(cell('% Επιχορήγησης', range))
    }
  } else if (program.category === 'MICROCREDITS') {
    if (program.minInvestment != null || program.maxInvestment != null) {
      const min = program.minInvestment != null ? eur(program.minInvestment) : null
      const max = program.maxInvestment != null ? eur(program.maxInvestment) : null
      const range = [min, max].filter(Boolean).join(' — ')
      if (range) cells.push(cell('Ποσό Δανείου', range))
    }
    if (program.minInterestRate != null || program.maxInterestRate != null) {
      const min = program.minInterestRate != null ? pct(program.minInterestRate) : null
      const max = program.maxInterestRate != null ? pct(program.maxInterestRate) : null
      const range = [min, max].filter(Boolean).join(' — ')
      if (range) cells.push(cell('Επιτόκιο', range))
    }
  }

  if (cells.length === 0) return ''

  return `<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
    <table style="border-collapse: collapse;"><tr>${cells.join('')}</tr></table>
  </div>`
}
