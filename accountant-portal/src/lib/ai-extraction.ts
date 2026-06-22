import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { prisma } from './prisma'

// Hard cap on input size sent to Claude — protects against runaway token cost.
// Applied AFTER stripIrrelevantAnnexes() trims away unrelated annexes, so a
// 200-500 page announcement (which is mostly boilerplate annexes) still fits.
// ~600k chars ≈ ~150k tokens.
export const MAX_SOURCE_TEXT_CHARS = 600_000

// Same pattern used by src/app/api/programs/parse-kad-pdf/route.ts to spot
// ΚΑΔ codes like "47.11.10.01" inside the eligible-activities annex.
const KAD_CODE_REGEX = /\b\d{1,2}(?:\.\d{1,2}){1,4}\b/g

// Greek announcement PDFs are typically: main body (tens of pages) followed
// by several ΠΑΡΑΡΤΗΜΑ (annex) sections, only one of which — the eligible
// ΚΑΔ/activities list — matters for extraction. The rest (legal text,
// declaration templates, scoring grids, etc.) is noise that wastes tokens
// and dilutes the model's attention on a 200-500 page PDF. Keep the main
// body plus whichever annex looks most like a ΚΑΔ list (by code density).
function stripIrrelevantAnnexes(fullText: string): string {
  const headingRegex = /ΠΑΡΑΡΤΗΜΑ/g
  const headingIndexes: number[] = []
  let m: RegExpExecArray | null
  while ((m = headingRegex.exec(fullText)) !== null) headingIndexes.push(m.index)
  if (headingIndexes.length === 0) return fullText

  const mainBody = fullText.slice(0, headingIndexes[0])
  const boundaries = [...headingIndexes, fullText.length]

  let bestChunk = ''
  let bestScore = 0
  for (let i = 0; i < boundaries.length - 1; i++) {
    const chunk = fullText.slice(boundaries[i], boundaries[i + 1])
    const score = (chunk.match(KAD_CODE_REGEX) || []).length
    if (score > bestScore) {
      bestScore = score
      bestChunk = chunk
    }
  }

  // Only keep an annex if it plausibly is the ΚΑΔ/eligible-activities list —
  // otherwise the main body alone (which usually states the headline KAD
  // rules too) is safer than guessing.
  return bestScore >= 10 ? `${mainBody}\n\n${bestChunk}` : mainBody
}

// Ceiling on the model's response — large announcements can have dozens of
// expense-category rows and funded actions, so this is generous but bounded.
const MAX_RESPONSE_TOKENS = 8_000

// How many past corrected examples to inject as few-shot context.
const FEW_SHOT_EXAMPLES = 5

const extractionSchema = z.object({
  kadRules: z.array(z.string()).default([]),
  regionRules: z.array(z.string()).default([]),
  zipCodeRules: z.array(z.string()).default([]),
  excludedLegalForms: z.array(z.string()).default([]),
  minRegdate: z.string().nullable().default(null),
  maxRegdate: z.string().nullable().default(null),
  minInvestment: z.number().nullable().default(null),
  maxInvestment: z.number().nullable().default(null),
  minSubsidyPct: z.number().nullable().default(null),
  maxSubsidyPct: z.number().nullable().default(null),
  subsidyNote: z.string().nullable().default(null),
  minInterestRate: z.number().nullable().default(null),
  maxInterestRate: z.number().nullable().default(null),
  otherRequirements: z.array(z.string()).default([]),
  totalBudgetEur: z.number().nullable().default(null),
  implementationMonths: z.number().nullable().default(null),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  requireTags: z.array(z.string()).default([]),
  excludeTags: z.array(z.string()).default([]),
  keyPoints: z.array(z.string()).default([]),
  fundedActions: z.array(z.object({
    title: z.string(),
    description: z.string().default(''),
  })).default([]),
  expenseCategories: z.array(z.object({
    code: z.string().default(''),
    category: z.string().default(''),
    expense: z.string().default(''),
    limit: z.string().default(''),
  })).default([]),
})

export type ExtractionResult = z.infer<typeof extractionSchema>

const TOOL_SCHEMA = {
  name: 'record_extraction',
  description: 'Records the structured eligibility fields and key points extracted from a grant program announcement.',
  input_schema: {
    type: 'object' as const,
    properties: {
      kadRules: { type: 'array', items: { type: 'string' }, description: 'Eligible ΚΑΔ codes/prefixes' },
      regionRules: { type: 'array', items: { type: 'string' }, description: 'Eligible Greek regions (περιφέρειες)' },
      zipCodeRules: { type: 'array', items: { type: 'string' }, description: 'Eligible postal code prefixes' },
      excludedLegalForms: { type: 'array', items: { type: 'string' }, description: 'Legal forms explicitly excluded' },
      minRegdate: { type: ['string', 'null'], description: 'Earliest allowed business registration date (ISO). Almost always "1900-01-01" unless the text states an actual minimum founding date.' },
      maxRegdate: { type: ['string', 'null'], description: 'Latest allowed business registration date (ISO), derived from the number of required closed fiscal years (see system prompt rule).' },
      minInvestment: { type: ['number', 'null'] },
      maxInvestment: { type: ['number', 'null'] },
      minSubsidyPct: { type: ['number', 'null'] },
      maxSubsidyPct: { type: ['number', 'null'] },
      subsidyNote: { type: ['string', 'null'], description: 'Comment on the subsidy %, e.g. bonus/penalty conditions, that does not fit the plain min/max range (e.g. "δυνατότητα επιπλέον 5% (bonus ταχείας υλοποίησης) εφόσον...")' },
      minInterestRate: { type: ['number', 'null'] },
      maxInterestRate: { type: ['number', 'null'] },
      otherRequirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Discrete, numbered additional eligibility conditions (one requirement per entry), e.g. budget-vs-turnover caps, minimum self-assessment score, own-contribution percentage. Do NOT put these in keyPoints.',
      },
      totalBudgetEur: { type: ['number', 'null'], description: 'Total public-expenditure budget of the whole program/call, in euros (e.g. "Συνολικός προϋπολογισμός Δημόσιας Δαπάνης: 50.000.000€" -> 50000000)' },
      implementationMonths: { type: ['number', 'null'], description: 'Implementation duration allowed after final approval, in months (e.g. "έως 15 μήνες από την οριστική έγκριση" -> 15)' },
      startDate: { type: ['string', 'null'], description: 'Submission window start (ISO)' },
      endDate: { type: ['string', 'null'], description: 'Submission window end (ISO)' },
      requireTags: { type: 'array', items: { type: 'string' } },
      excludeTags: { type: 'array', items: { type: 'string' } },
      keyPoints: { type: 'array', items: { type: 'string' }, description: 'Important points that do not fit the other fields' },
      fundedActions: {
        type: 'array',
        description: 'Distinct funded actions/activities (e.g. "Εκσυγχρονισμός παραγωγής", "Τεχνολογική αναβάθμιση"), one entry per action with a short title and its description',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title of the funded action' },
            description: { type: 'string', description: 'What the action covers, in the announcement\'s own wording' },
          },
          required: ['title', 'description'],
        },
      },
      expenseCategories: {
        type: 'array',
        description: 'Rows of the eligible-expense-category table (ΕΠΙΛΕΞΙΜΕΣ ΚΑΤΗΓΟΡΙΕΣ ΔΑΠΑΝΩΝ), one entry per row',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'ΟΠΣΚΕ code, e.g. "02.20"' },
            category: { type: 'string', description: 'Category group, e.g. "02 Μηχανήματα – Εξοπλισμός"' },
            expense: { type: 'string', description: 'Expense description, e.g. "Παραγωγικός και Μηχανολογικός εξοπλισμός"' },
            limit: { type: 'string', description: 'Spending limit/percentage as stated, e.g. "Από 65% (τουλάχιστον) έως 90% του επιχορηγούμενου προϋπολογισμού"' },
          },
          required: ['code', 'category', 'expense', 'limit'],
        },
      },
    },
    required: ['kadRules', 'regionRules', 'zipCodeRules', 'excludedLegalForms', 'otherRequirements', 'keyPoints', 'fundedActions', 'expenseCategories'],
  },
}

export class SourceTextTooLargeError extends Error {
  constructor() {
    super(`Το κείμενο υπερβαίνει το όριο των ${MAX_SOURCE_TEXT_CHARS} χαρακτήρων.`)
  }
}

export async function extractProgramFields(rawSourceText: string): Promise<ExtractionResult> {
  const sourceText = stripIrrelevantAnnexes(rawSourceText)
  if (sourceText.length > MAX_SOURCE_TEXT_CHARS) throw new SourceTextTooLargeError()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  const examples = await prisma.aiExtractionExample.findMany({
    orderBy: { createdAt: 'desc' },
    take: FEW_SHOT_EXAMPLES,
    select: { sourceText: true, extractedJson: true },
  })

  const fewShotBlock = examples.length
    ? examples
        .map((ex, i) => `### Παράδειγμα ${i + 1}\nΚείμενο:\n${ex.sourceText.slice(0, 4000)}\n\nΣωστή εξαγωγή:\n${JSON.stringify(ex.extractedJson)}`)
        .join('\n\n')
    : 'Δεν υπάρχουν ακόμα αποθηκευμένα παραδείγματα.'

  const systemPrompt = `Είσαι ειδικός στην ανάγνωση ελληνικών προκηρύξεων προγραμμάτων χρηματοδότησης (ΕΣΠΑ/ΔΥΠΑ). Διάβασε προσεκτικά ΟΛΟ το κείμενο (μπορεί να έχει πολλές σελίδες) και κάλεσε το εργαλείο "record_extraction" με τα δομημένα κριτήρια επιλεξιμότητας. Κάθε πληροφορία πρέπει να μπει στο σωστό δομημένο πεδίο — ΠΟΤΕ σε ελεύθερο κείμενο (keyPoints) αν υπάρχει πιο συγκεκριμένο πεδίο.

Κανόνες ανά πεδίο:

1. minRegdate/maxRegdate (ημερομηνία ίδρυσης): αν η προκήρυξη απαιτεί αριθμό πλήρων/κλεισμένων διαχειριστικών χρήσεων πριν την υποβολή, υπολόγισε:
   - minRegdate = "1900-01-01" (πάντα, εκτός αν αναφέρεται ρητά διαφορετικό ελάχιστο).
   - maxRegdate = 1η Ιανουαρίου του (έτος ηλεκτρονικής υποβολής − Ν), όπου Ν ο αριθμός των απαιτούμενων πλήρων/κλεισμένων χρήσεων.
   Παράδειγμα: υποβολές ξεκινούν το 2026 και απαιτείται "τουλάχιστον 1 πλήρης χρήση" → maxRegdate = "2025-01-01". Αν απαιτούνται "2 κλεισμένες διαχειριστικές χρήσεις" → maxRegdate = "2024-01-01".

2. startDate/endDate: ημερομηνίες έναρξης/λήξης ηλεκτρονικής υποβολής αιτήσεων — αναζήτησε φράσεις όπως "ημερομηνία έναρξης ηλεκτρονικής υποβολής" και "καταληκτική ημερομηνία".

3. totalBudgetEur: ο συνολικός προϋπολογισμός Δημόσιας Δαπάνης του προγράμματος (π.χ. "Συνολικός προϋπολογισμός Δημόσιας Δαπάνης: 50.000.000€" → 50000000). Αυτό είναι το συνολικό κονδύλι του προγράμματος, όχι το όριο επένδυσης ανά επιχείρηση (minInvestment/maxInvestment).

4. minSubsidyPct/maxSubsidyPct/subsidyNote: το ελάχιστο/μέγιστο ποσοστό δημόσιας επιχορήγησης μπαίνει σε minSubsidyPct/maxSubsidyPct ως αριθμοί. Τυχόν επιπλέον όροι/bonus/penalty σχόλιο (π.χ. "δυνατότητα επιπλέον 5% bonus ταχείας υλοποίησης εφόσον υποβληθεί ΑΚΕ με δαπάνες ≥80% εντός 9 μηνών") μπαίνουν στο subsidyNote ως σχόλιο, ΟΧΙ σε keyPoints.

5. implementationMonths: η διάρκεια υλοποίησης σε μήνες ως αριθμός (π.χ. "Διάρκεια υλοποίησης: έως 15 μήνες από την οριστική έγκριση" → 15), ΟΧΙ σε keyPoints.

6. otherRequirements: λίστα από ΞΕΧΩΡΙΣΤΕΣ, διακριτές πρόσθετες προϋποθέσεις επιλεξιμότητας που δεν καλύπτονται από άλλο πεδίο — μία πρόταση ανά εγγραφή πίνακα (π.χ. όριο επιχορηγούμενου Π/Υ έναντι κύκλου εργασιών, ελάχιστη βαθμολογία αυτοαξιολόγησης, ελάχιστο ποσοστό ίδιας συμμετοχής). ΟΧΙ σε keyPoints.

7. fundedActions: όλες οι διακριτές ενέργειες/δράσεις που χρηματοδοτούνται (π.χ. "Εκσυγχρονισμός παραγωγής", "Τεχνολογική αναβάθμιση", "Πιστοποιήσεις και ποιότητα") — μία εγγραφή ανά ενέργεια με σύντομο τίτλο και την περιγραφή της.

8. expenseCategories: αν υπάρχει πίνακας "ΕΠΙΛΕΞΙΜΕΣ ΚΑΤΗΓΟΡΙΕΣ ΔΑΠΑΝΩΝ" (κωδικοί ΟΠΣΚΕ όπως 02.20, 04.18 κ.λπ.), μετέγραψε ΚΑΘΕ γραμμή του πίνακα ως ξεχωριστή εγγραφή με code, category, expense, limit.

9. keyPoints: ΜΟΝΟ για πληροφορίες που πραγματικά δεν χωρούν σε κανένα από τα παραπάνω δομημένα πεδία.

Σημείωση: από το πλήρες έγγραφο έχει διατηρηθεί μόνο το κύριο σώμα της προκήρυξης και (αν εντοπίστηκε) το παράρτημα με τις επιλέξιμες δραστηριότητες/ΚΑΔ — τα υπόλοιπα παραρτήματα (υποδείγματα δηλώσεων, νομικό πλαίσιο, βαθμολογικοί πίνακες κ.λπ.) έχουν ήδη αφαιρεθεί, οπότε μην εκπλαγείς αν δεν τα βλέπεις.

Χρησιμοποίησε τα παρακάτω διορθωμένα παραδείγματα ως οδηγό ύφους/ακρίβειας:\n\n${fewShotBlock}`

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: MAX_RESPONSE_TOKENS,
    system: systemPrompt,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'record_extraction' },
    messages: [{ role: 'user', content: sourceText }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Το μοντέλο δεν επέστρεψε δομημένη εξαγωγή.')

  return extractionSchema.parse(toolUse.input)
}
