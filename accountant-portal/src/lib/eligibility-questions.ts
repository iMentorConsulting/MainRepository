// Rule-based, no-LLM Ερμής eligibility logic.
//
// Structured facts (ΚΑΔ, περιφέρεια, νομική μορφή, ημερομηνία ίδρυσης) are
// already known from the Business record and already evaluated once by
// src/lib/matching.ts when the match was created — re-asking the business to
// retype them is redundant and feels robotic. Ερμής instead displays those as
// already-confirmed facts (via the stored ProgramMatch.matchReason) and only
// asks about what genuinely can't be known from our data: the program's
// free-text "Άλλες Προϋποθέσεις" and any manual extra eligibility criteria.

export interface ProgramPitchInfo {
  title: string
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
}

function formatEur(n: number): string {
  return `${n.toLocaleString('el-GR')}€`
}

function formatPct(n: number): string {
  return Number.isInteger(n) ? `${n}%` : `${n.toLocaleString('el-GR')}%`
}

// Builds a single human, conversational opening line that leads with the
// money — what the business actually cares about — instead of bureaucratic
// criteria. e.g. "ΞΕΚΙΝΩ ΕΠΙΧΕΙΡΗΜΑΤΙΚΑ — Σας ενδιαφέρει επένδυση από 20.000€
// (ελάχιστο) έως 200.000€ (μέγιστο), με επιχορήγηση 50%;"
export function buildPitch(program: ProgramPitchInfo): string {
  const parts: string[] = []

  if (program.minInvestment != null && program.maxInvestment != null) {
    parts.push(`επένδυση από ${formatEur(program.minInvestment)} (ελάχιστο) έως ${formatEur(program.maxInvestment)} (μέγιστο)`)
  } else if (program.maxInvestment != null) {
    parts.push(`επένδυση έως ${formatEur(program.maxInvestment)}`)
  } else if (program.minInvestment != null) {
    parts.push(`επένδυση από ${formatEur(program.minInvestment)}`)
  }

  if (program.minSubsidyPct != null && program.maxSubsidyPct != null) {
    parts.push(program.minSubsidyPct === program.maxSubsidyPct
      ? `επιχορήγηση ${formatPct(program.minSubsidyPct)}`
      : `επιχορήγηση από ${formatPct(program.minSubsidyPct)} έως ${formatPct(program.maxSubsidyPct)}`)
  } else if (program.maxSubsidyPct != null) {
    parts.push(`επιχορήγηση έως ${formatPct(program.maxSubsidyPct)}`)
  } else if (program.minSubsidyPct != null) {
    parts.push(`επιχορήγηση από ${formatPct(program.minSubsidyPct)}`)
  }

  if (program.minInterestRate != null || program.maxInterestRate != null) {
    const rate = program.minInterestRate != null && program.maxInterestRate != null && program.minInterestRate !== program.maxInterestRate
      ? `από ${formatPct(program.minInterestRate)} έως ${formatPct(program.maxInterestRate)}`
      : formatPct(program.minInterestRate ?? program.maxInterestRate ?? 0)
    parts.push(`επιτόκιο ${rate}`)
  }

  if (parts.length === 0) {
    return `${program.title} — Σας ενδιαφέρει να μάθετε αν είστε επιλέξιμοι;`
  }

  return `${program.title} — Σας ενδιαφέρει ${parts.join(', ')};`
}

export interface EligibilityQuestion {
  id: string
  label: string
}

export interface ProgramQualitativeCriteria {
  otherRequirements: string | null
  extraCriteriaLabels: { id: string; label: string }[]
}

// Only the qualitative, not-already-known criteria become questions: each
// numbered line of "Άλλες Προϋποθέσεις" plus any manually defined extra
// eligibility criterion. Admins can override the wording per-question.
export function buildEligibilityQuestions(
  program: ProgramQualitativeCriteria,
  labelOverrides: Record<string, string> = {}
): EligibilityQuestion[] {
  const questions: EligibilityQuestion[] = []

  const otherRequirementItems = program.otherRequirements
    ? program.otherRequirements.split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : []

  otherRequirementItems.forEach((item, i) => {
    const id = `req-${i}`
    questions.push({ id, label: labelOverrides[id] || item })
  })

  program.extraCriteriaLabels.forEach(c => {
    const id = `criterion-${c.id}`
    questions.push({ id, label: labelOverrides[id] || c.label })
  })

  return questions
}

export function evaluateQualitativeAnswers(
  questions: EligibilityQuestion[],
  answers: Record<string, boolean>
): { eligible: boolean; results: { id: string; label: string; pass: boolean }[] } {
  const results = questions.map(q => ({ id: q.id, label: q.label, pass: answers[q.id] === true }))
  return { eligible: results.every(r => r.pass), results }
}
