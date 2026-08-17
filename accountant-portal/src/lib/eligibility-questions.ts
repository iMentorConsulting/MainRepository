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
  // MICROCREDITS programs are loans, not investment subsidies — the amount
  // is a "ύψος δανείου", not a "ύψος επένδυσης". Affects wording only.
  isLoan?: boolean
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
  const amountNoun = program.isLoan ? 'δάνειο' : 'επένδυση'

  if (program.minInvestment != null && program.maxInvestment != null) {
    parts.push(`${amountNoun} από ${formatEur(program.minInvestment)} (ελάχιστο) έως ${formatEur(program.maxInvestment)} (μέγιστο)`)
  } else if (program.maxInvestment != null) {
    parts.push(`${amountNoun} έως ${formatEur(program.maxInvestment)}`)
  } else if (program.minInvestment != null) {
    parts.push(`${amountNoun} από ${formatEur(program.minInvestment)}`)
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
  type: 'boolean' | 'number'
  // Which answer keeps the business eligible. Most criteria are phrased
  // positively ("Διατηρείτε ενεργό τραπεζικό λογαριασμό;") where Ναι passes
  // — but disqualifying conditions are often phrased the other way
  // ("Έχετε λάβει επιχορήγηση για τις ίδιες δαπάνες;") where Όχι is the
  // correct, eligible answer. Defaults to true (Ναι passes) unless an
  // override or the AI classification says otherwise. Only used when
  // type === 'boolean'.
  expectedAnswer: boolean
  // Only used when type === 'number': the answer must fall within
  // [min, max] (inclusive, either bound optional) to pass. unit is a
  // display suffix, e.g. "€".
  min?: number | null
  max?: number | null
  unit?: string
}

export interface ProgramQualitativeCriteria {
  otherRequirements: string | null
  extraCriteriaLabels: { id: string; label: string }[]
  // Investment range the program funds, if known — generates a numeric
  // "what's your planned investment?" question so Ερμής actually verifies
  // the customer's figure against the program instead of only announcing
  // the range (see buildPitch).
  minInvestment?: number | null
  maxInvestment?: number | null
  // See ProgramPitchInfo.isLoan — MICROCREDITS programs ask about the loan
  // amount, not an investment amount.
  isLoan?: boolean
}

// Per-question admin decision, optionally seeded from the AI classification
// pass (see src/lib/eligibility-ai.ts): an admin can override the wording, or
// mark a requirement as skipped (with a reason) when it's not something the
// business owner can answer in a casual conversation — e.g. it requires
// accountant-only data, or it's a post-approval obligation rather than an
// eligibility criterion.
export interface QuestionOverride {
  label?: string
  skip?: boolean
  skipReason?: string
  expectedAnswer?: boolean
}
export type QuestionOverrides = Record<string, QuestionOverride>

// A question the admin types in directly — not derived from any program
// field. Stored and edited in place (no separate override needed): editing
// or deleting a custom question just changes/removes its entry.
export interface CustomQuestion {
  id: string
  label: string
  type: 'boolean' | 'number'
  expectedAnswer?: boolean
  min?: number | null
  max?: number | null
  unit?: string
}

// Combined shape saved on Program.eligibilityQuestions (a Json? column —
// no schema change needed to add custom questions alongside overrides).
export interface EligibilityQuestionsStorage {
  overrides: QuestionOverrides
  custom: CustomQuestion[]
}

// Older saved data is a bare QuestionOverrides object (no "custom" key yet).
export function parseEligibilityStorage(raw: unknown): EligibilityQuestionsStorage {
  if (raw && typeof raw === 'object' && ('overrides' in raw || 'custom' in raw)) {
    const obj = raw as Partial<EligibilityQuestionsStorage>
    return { overrides: obj.overrides || {}, custom: obj.custom || [] }
  }
  return { overrides: (raw as QuestionOverrides) || {}, custom: [] }
}

// Only the qualitative, not-already-known criteria become questions: each
// numbered line of "Άλλες Προϋποθέσεις" plus any manually defined extra
// eligibility criterion, plus any admin-authored custom questions. Admins
// can override the wording of generated questions, or skip questions that
// aren't genuinely answerable by the business owner.
export function buildEligibilityQuestions(
  program: ProgramQualitativeCriteria,
  overrides: QuestionOverrides = {},
  custom: CustomQuestion[] = []
): EligibilityQuestion[] {
  const questions: EligibilityQuestion[] = []

  if (program.minInvestment != null || program.maxInvestment != null) {
    const id = 'investment-amount'
    const ov = overrides[id]
    if (!ov?.skip) {
      questions.push({
        id,
        type: 'number',
        label: ov?.label || (program.isLoan
          ? 'Ποιο είναι το ύψος του δανείου που σας ενδιαφέρει (σε ευρώ);'
          : 'Ποιο είναι το προβλεπόμενο ύψος της επένδυσής σας (σε ευρώ);'),
        expectedAnswer: true,
        min: program.minInvestment ?? null,
        max: program.maxInvestment ?? null,
        unit: '€',
      })
    }
  }

  const otherRequirementItems = program.otherRequirements
    ? program.otherRequirements.split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : []

  otherRequirementItems.forEach((item, i) => {
    const id = `req-${i}`
    const ov = overrides[id]
    if (ov?.skip) return
    questions.push({ id, type: 'boolean', label: ov?.label || item, expectedAnswer: ov?.expectedAnswer ?? true })
  })

  program.extraCriteriaLabels.forEach(c => {
    const id = `criterion-${c.id}`
    const ov = overrides[id]
    if (ov?.skip) return
    questions.push({ id, type: 'boolean', label: ov?.label || c.label, expectedAnswer: ov?.expectedAnswer ?? true })
  })

  custom.forEach(c => {
    const ov = overrides[c.id]
    if (ov?.skip) return
    questions.push({
      id: c.id,
      type: c.type,
      label: ov?.label || c.label,
      expectedAnswer: ov?.expectedAnswer ?? c.expectedAnswer ?? true,
      min: c.min ?? null,
      max: c.max ?? null,
      unit: c.unit,
    })
  })

  return questions
}

export function evaluateQualitativeAnswers(
  questions: EligibilityQuestion[],
  answers: Record<string, boolean | number>
): { eligible: boolean; results: { id: string; label: string; pass: boolean }[] } {
  const results = questions.map(q => {
    const answer = answers[q.id]
    if (q.type === 'number') {
      const value = typeof answer === 'number' ? answer : NaN
      const pass = !Number.isNaN(value) && (q.min == null || value >= q.min) && (q.max == null || value <= q.max)
      return { id: q.id, label: q.label, pass }
    }
    return { id: q.id, label: q.label, pass: answer === q.expectedAnswer }
  })
  return { eligible: results.every(r => r.pass), results }
}
