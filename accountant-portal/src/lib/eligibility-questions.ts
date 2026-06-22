import { LEGAL_FORMS } from './legal-forms'
import { GREEK_REGIONS } from './greek-regions'

export interface ProgramEligibilityCriteria {
  title: string
  kadRules: string[]
  regionRules: string[]
  zipCodeRules: string[]
  excludedLegalForms: string[]
  minRegdate: string | null
  maxRegdate: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  requireTags: string[]
  excludeTags: string[]
}

export type EligibilityQuestion =
  | { id: string; kind: 'select'; label: string; options: string[] }
  | { id: string; kind: 'multiselect'; label: string; options: string[] }
  | { id: string; kind: 'date'; label: string }
  | { id: string; kind: 'number'; label: string }
  | { id: string; kind: 'checkboxes'; label: string; options: string[] }

export interface EligibilityAnswers {
  legalForm?: string
  kad?: string
  region?: string
  zipCode?: string
  regdate?: string
  investment?: number
  tags?: string[]
}

export interface EligibilityCheckResult {
  eligible: boolean
  criteria: { label: string; pass: boolean; reason: string }[]
}

// Builds a fixed checkbox/select questionnaire from a program's already
// extracted/approved structured fields — no LLM call involved.
export function buildEligibilityQuestions(
  program: ProgramEligibilityCriteria,
  labelOverrides: Record<string, string> = {}
): EligibilityQuestion[] {
  const questions: EligibilityQuestion[] = []

  questions.push({
    id: 'legalForm',
    kind: 'select',
    label: 'Ποια είναι η νομική μορφή της επιχείρησης;',
    options: LEGAL_FORMS.map(f => f.value),
  })

  if (program.kadRules.length > 0) {
    questions.push({
      id: 'kad',
      kind: 'select',
      label: 'Ποιος είναι ο κύριος ΚΑΔ της επιχείρησης;',
      options: program.kadRules,
    })
  }

  if (program.regionRules.length > 0) {
    questions.push({
      id: 'region',
      kind: 'select',
      label: 'Σε ποια περιφέρεια εδρεύει η επιχείρηση;',
      options: GREEK_REGIONS as unknown as string[],
    })
  }

  if (program.zipCodeRules.length > 0) {
    questions.push({ id: 'zipCode', kind: 'number', label: 'Ποιος είναι ο ταχυδρομικός κώδικας της επιχείρησης;' })
  }

  if (program.minRegdate || program.maxRegdate) {
    questions.push({ id: 'regdate', kind: 'date', label: 'Πότε ιδρύθηκε η επιχείρηση;' })
  }

  if (program.minInvestment != null || program.maxInvestment != null) {
    questions.push({ id: 'investment', kind: 'number', label: 'Ποιο είναι το ύψος της επένδυσης (€);' })
  }

  if (program.requireTags.length > 0 || program.excludeTags.length > 0) {
    questions.push({
      id: 'tags',
      kind: 'checkboxes',
      label: 'Ποιες από τις παρακάτω συνθήκες ισχύουν για την επιχείρηση;',
      options: Array.from(new Set([...program.requireTags, ...program.excludeTags])),
    })
  }

  return questions.map(q => labelOverrides[q.id] ? { ...q, label: labelOverrides[q.id] } : q)
}

// Pure rule evaluation against the program's stored eligibility fields —
// mirrors the logic in src/lib/matching.ts but operates on form answers
// instead of a full Business record, so the two never diverge on intent.
export function evaluateEligibility(program: ProgramEligibilityCriteria, answers: EligibilityAnswers): EligibilityCheckResult {
  const criteria: { label: string; pass: boolean; reason: string }[] = []

  if (program.excludedLegalForms.length > 0) {
    const pass = !answers.legalForm || !program.excludedLegalForms.includes(answers.legalForm)
    criteria.push({ label: 'Νομική μορφή', pass, reason: pass ? 'Επιτρεπτή νομική μορφή' : 'Η νομική μορφή εξαιρείται από το πρόγραμμα' })
  }

  if (program.kadRules.length > 0) {
    const pass = !!answers.kad && program.kadRules.some(rule => answers.kad!.startsWith(rule) || answers.kad === rule)
    criteria.push({ label: 'ΚΑΔ', pass, reason: pass ? 'Επιλέξιμος ΚΑΔ' : 'Ο ΚΑΔ δεν ταιριάζει με τα κριτήρια του προγράμματος' })
  }

  if (program.regionRules.length > 0) {
    const pass = !!answers.region && program.regionRules.includes(answers.region)
    criteria.push({ label: 'Περιφέρεια', pass, reason: pass ? 'Επιλέξιμη περιφέρεια' : 'Η περιφέρεια δεν περιλαμβάνεται στο πρόγραμμα' })
  }

  if (program.zipCodeRules.length > 0) {
    const pass = !!answers.zipCode && program.zipCodeRules.some(z => answers.zipCode!.startsWith(z))
    criteria.push({ label: 'Ταχυδρομικός Κώδικας', pass, reason: pass ? 'Επιλέξιμος ΤΚ' : 'Ο ΤΚ δεν περιλαμβάνεται στο πρόγραμμα' })
  }

  if (program.minRegdate || program.maxRegdate) {
    const date = answers.regdate ? new Date(answers.regdate) : null
    let pass = !!date
    if (date && program.minRegdate && date < new Date(program.minRegdate)) pass = false
    if (date && program.maxRegdate && date > new Date(program.maxRegdate)) pass = false
    criteria.push({ label: 'Ημερομηνία Ίδρυσης', pass, reason: pass ? 'Εντός επιτρεπτού εύρους ίδρυσης' : 'Εκτός επιτρεπτού εύρους ημερομηνίας ίδρυσης' })
  }

  if (program.minInvestment != null || program.maxInvestment != null) {
    const value = answers.investment
    let pass = value != null
    if (value != null && program.minInvestment != null && value < program.minInvestment) pass = false
    if (value != null && program.maxInvestment != null && value > program.maxInvestment) pass = false
    criteria.push({ label: 'Ύψος Επένδυσης', pass, reason: pass ? 'Εντός επιτρεπτού εύρους επένδυσης' : 'Εκτός επιτρεπτού εύρους επένδυσης' })
  }

  if (program.excludeTags.length > 0) {
    const pass = !(answers.tags || []).some(t => program.excludeTags.includes(t))
    criteria.push({ label: 'Αποκλειόμενες Συνθήκες', pass, reason: pass ? 'Καμία αποκλειόμενη συνθήκη' : 'Ισχύει αποκλειόμενη συνθήκη' })
  }

  if (program.requireTags.length > 0) {
    const pass = (answers.tags || []).some(t => program.requireTags.includes(t))
    criteria.push({ label: 'Απαιτούμενες Συνθήκες', pass, reason: pass ? 'Ισχύει απαιτούμενη συνθήκη' : 'Δεν ισχύει καμία απαιτούμενη συνθήκη' })
  }

  return { eligible: criteria.every(c => c.pass), criteria }
}
