// Client-safe pieces of the Ταμείο Μικροπιστώσεων questionnaire (no server SDKs),
// shared by the generator (server) and the consultant modal (browser).
export type QuestionKind = 'funding_amount' | 'funding_categories' | 'funding_distribution' | 'info'

export type ExpenseKey = 'emporeumata' | 'analosima' | 'deko' | 'enoikia' | 'loipa' | 'prwtesYles' | 'misthodosia' | 'efka'

export interface FundingQuestion {
  section: number
  sectionTitle: string
  text: string
  bold: boolean
  kind?: QuestionKind
  prefill?: string
}

// Fixed "Χρήση Χρηματοδότησης" section — deliberately NOT AI-written: it carries
// the office's standard guidance (steer the spend to documentable OPERATING
// expenses; business-expense proofs are due to the Fund within 2 years; payroll
// means staff can't be cut for those 2 years) and must read identically every time.
export const FUNDING_CATEGORY_LINES = [
  'Εμπορεύματα',
  'Πρώτες ύλες / αναλώσιμα',
  'Μισθοδοσία προσωπικού',
  'ΕΦΚΑ / ασφαλιστικές εισφορές',
  'ΔΕΚΟ (ρεύμα, νερό, θέρμανση, τηλεφωνία)',
  'Ενοίκιο',
  'Λοιπά λειτουργικά (αναφέρετε)',
]

export function buildFundingUseQuestions(sectionNumber: number): FundingQuestion[] {
  const sectionTitle = 'Χρήση Χρηματοδότησης (€3.000 – €25.000)'
  const base = { section: sectionNumber, sectionTitle }
  return [
    { ...base, kind: 'funding_amount', bold: true, text: 'Τι ποσό χρηματοδότησης εκτιμάτε ότι χρειάζεστε; ______€' },
    {
      ...base, kind: 'info', bold: false,
      text: 'ΣΗΜΑΝΤΙΚΗ ΕΝΗΜΕΡΩΣΗ:\n• Το Ταμείο δεν ελέγχει πού πήγαν τα συγκεκριμένα χρήματα. Ελέγχει ότι, μέσα σε 2 χρόνια, η επιχείρησή σας έχει κάνει και μπορεί να αποδείξει με παραστατικά επιχειρηματικές δαπάνες ίσες τουλάχιστον με το ποσό που πήρατε.\n• Σας συνιστούμε να δηλωθεί το ποσό σε ΛΕΙΤΟΥΡΓΙΚΑ ΕΞΟΔΑ (π.χ. εμπορεύματα, πρώτες ύλες, μισθοδοσία, ΕΦΚΑ, ΔΕΚΟ, ενοίκιο): έχουν μεγάλη ευελιξία και τεκμηριώνονται εύκολα.\n• Είναι δυνατό να δηλωθεί και εξοπλισμός ή κτιριακές εργασίες, αλλά το συστήνουμε μόνο αν είναι απολύτως απαραίτητο: σε αυτή την περίπτωση δεσμεύεστε να υλοποιήσετε ακριβώς ό,τι δηλώσετε και η τεκμηρίωση είναι πιο δύσκολη.\n• Αν συμπεριλάβετε μισθοδοσία προσωπικού, δεσμεύεστε να μη μειώσετε το προσωπικό σας για τα 2 αυτά έτη.',
    },
    {
      ...base, kind: 'funding_categories', bold: true,
      text: ['Σε ποιες κατηγορίες λειτουργικών εξόδων θα διατεθεί το ποσό; (σημειώστε όσες ισχύουν)', ...FUNDING_CATEGORY_LINES.map(l => `- ${l}`)].join('\n'),
    },
    {
      ...base, kind: 'funding_distribution', bold: false,
      text: 'Προαιρετικά: κατανείμετε ενδεικτικά το ποσό που θα δηλώσετε (π.χ. 25.000€) στις κατηγορίες που επιλέξατε. Αρκεί προσεγγιστικά.',
      prefill: FUNDING_CATEGORY_LINES.map(l => `${l.replace(/ \(.*\)$/, '')}: ____€`).join('\n'),
    },
    { ...base, bold: false, text: 'Πώς θα βοηθήσει συγκεκριμένα η χρηματοδότηση τη λειτουργία της επιχείρησής σας;' },
  ]
}

// Answer text that is still just the untouched template lines counts as unanswered.
export function isUnanswered(q: { prefill?: string; kind?: string }, answer: string | undefined): boolean {
  const a = (answer || '').trim()
  return !a || (!!q.prefill && a === q.prefill.trim()) || q.kind === 'info'
}

function parseGreekNumber(raw: string): number {
  return Number(raw.replace(/\./g, '').replace(',', '.')) || 0
}

// "Εμπορεύματα: 10.000€ / μισθοδοσία 8000" → { emporeumata: 10000, misthodosia: 8000 }.
// Best effort only — the consultant reviews/edits the prefilled numbers.
export function parseFundingDistribution(answer: string): Partial<Record<ExpenseKey, number>> {
  const patterns: [ExpenseKey, RegExp][] = [
    ['misthodosia', /μισθ/i],
    ['efka', /εφκα|ασφαλιστ/i],
    ['prwtesYles', /πρώτ|πρωτ/i],
    ['emporeumata', /εμπορ/i],
    ['analosima', /αναλώσ|αναλωσ/i],
    ['deko', /δεκο|δεκό|ρεύμα|ρευμα/i],
    ['enoikia', /ενοίκ|ενοικ/i],
    ['loipa', /λοιπ/i],
  ]
  const result: Partial<Record<ExpenseKey, number>> = {}
  for (const part of answer.split(/[\n;]+|,\s+(?=[^\d])/)) {
    const hit = patterns.find(([, re]) => re.test(part))
    if (!hit) continue
    const nums = Array.from(part.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?(\s*€)?/g))
    if (nums.length === 0) continue
    const withEuro = nums.filter(m => m[2])
    const chosen = (withEuro.length ? withEuro : nums).slice(-1)[0]
    const value = parseGreekNumber(chosen[0].replace(/\s*€$/, ''))
    if (value > 0) result[hit[0]] = (result[hit[0]] || 0) + value
  }
  return result
}

export function parseFundingAmount(answer: string): number | null {
  const m = answer.match(/(\d{1,3}(?:\.\d{3})+|\d{4,6})/)
  return m ? parseGreekNumber(m[0]) : null
}

