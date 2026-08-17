import { GREEK_REGIONS, type GreekRegion } from '@/lib/greek-regions'

// Maps ESPA's genitive-case region phrasing (e.g. "Περιφέρεια Στερεάς Ελλάδας")
// to the app's canonical nominative-case region names.
const ESPA_REGION_PHRASES: Record<string, GreekRegion[]> = {
  'αττικής': ['Αττική'],
  'κεντρικής μακεδονίας': ['Κεντρική Μακεδονία'],
  'θεσσαλίας': ['Θεσσαλία'],
  'ανατολικής μακεδονίας και θράκης': ['Ανατολική Μακεδονία και Θράκη'],
  'ηπείρου': ['Ήπειρος'],
  'δυτικής μακεδονίας': ['Δυτική Μακεδονία'],
  'ιονίων νήσων': ['Ιόνια Νησιά'],
  'δυτικής ελλάδας': ['Δυτική Ελλάδα'],
  'στερεάς ελλάδας': ['Στερεά Ελλάδα'],
  'πελοποννήσου': ['Πελοπόννησος'],
  'βορείου αιγαίου': ['Βόρειο Αιγαίο'],
  'νοτίου αιγαίου': ['Νότιο Αιγαίο'],
  'κρήτης': ['Κρήτη'],
}

export function parseRegionsFromApplicationArea(applicationArea: string | null): GreekRegion[] {
  if (!applicationArea) return []
  const text = applicationArea.toLowerCase()
  if (text.includes('όλη η ελλάδα') || text.includes('όλη την ελλάδα') || text.includes('σύνολο της χώρας')) {
    return [...GREEK_REGIONS]
  }
  const found = new Set<GreekRegion>()
  for (const [phrase, regions] of Object.entries(ESPA_REGION_PHRASES)) {
    if (text.includes(phrase)) regions.forEach(r => found.add(r))
  }
  return Array.from(found)
}

// Parses Greek-formatted currency amounts like "30.000€" or "30.000,50 €" into a number.
function parseGreekAmount(raw: string): number {
  return Number(raw.replace(/\./g, '').replace(',', '.'))
}

export interface BudgetRange {
  min?: number
  max?: number
}

// Extracts a min/max investment range from free-form budget text, e.g.
// "από 30.000€ έως 400.000€" or "30.000 - 400.000 €". Returns {} if no
// clean range pattern is found (never guesses a single-sided value).
export function parseBudgetRange(budget: string | null): BudgetRange {
  if (!budget) return {}
  const amount = '[\\d.,]+\\s*€?'
  const rangeRe = new RegExp(`(?:από\\s*)?(${amount})\\s*(?:€\\s*)?(?:έως|-|–|ως)\\s*(${amount})`, 'i')
  const match = budget.match(rangeRe)
  if (!match) return {}
  const min = parseGreekAmount(match[1].replace('€', '').trim())
  const max = parseGreekAmount(match[2].replace('€', '').trim())
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) return {}
  return { min, max }
}

export interface DateRange {
  startDate?: string
  endDate?: string
}

// Extracts start/end ISO dates from text like "από 18/5/2026 έως 18/9/2026".
function toIsoDate(day: string, month: string, year: string): string {
  const d = day.padStart(2, '0')
  const m = month.padStart(2, '0')
  return `${year}-${m}-${d}`
}

export function parseSubmissionPeriod(submissionPeriod: string | null): DateRange {
  if (!submissionPeriod) return {}
  const dateRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g
  const matches = Array.from(submissionPeriod.matchAll(dateRe))
  if (matches.length === 0) return {}
  const [first, second] = matches
  const result: DateRange = {}
  if (first) result.startDate = toIsoDate(first[1], first[2], first[3])
  if (second) result.endDate = toIsoDate(second[1], second[2], second[3])
  return result
}
