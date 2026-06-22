import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { prisma } from './prisma'

// Hard cap on input size sent to Claude — protects against runaway token cost
// from oversized PDF text. ~400k chars ≈ ~100k tokens, enough for large
// multi-page announcement PDFs while still well short of Claude's 1M context.
export const MAX_SOURCE_TEXT_CHARS = 400_000

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
  minInterestRate: z.number().nullable().default(null),
  maxInterestRate: z.number().nullable().default(null),
  otherRequirements: z.string().nullable().default(null),
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
      minRegdate: { type: ['string', 'null'], description: 'Earliest allowed business registration date (ISO)' },
      maxRegdate: { type: ['string', 'null'], description: 'Latest allowed business registration date (ISO)' },
      minInvestment: { type: ['number', 'null'] },
      maxInvestment: { type: ['number', 'null'] },
      minSubsidyPct: { type: ['number', 'null'] },
      maxSubsidyPct: { type: ['number', 'null'] },
      minInterestRate: { type: ['number', 'null'] },
      maxInterestRate: { type: ['number', 'null'] },
      otherRequirements: { type: ['string', 'null'], description: 'Free-text additional requirements' },
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
    required: ['kadRules', 'regionRules', 'zipCodeRules', 'excludedLegalForms', 'keyPoints', 'fundedActions', 'expenseCategories'],
  },
}

export class SourceTextTooLargeError extends Error {
  constructor() {
    super(`Το κείμενο υπερβαίνει το όριο των ${MAX_SOURCE_TEXT_CHARS} χαρακτήρων.`)
  }
}

export async function extractProgramFields(sourceText: string): Promise<ExtractionResult> {
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

  const systemPrompt = `Είσαι ειδικός στην ανάγνωση ελληνικών προκηρύξεων προγραμμάτων χρηματοδότησης (ΕΣΠΑ/ΔΥΠΑ). Διάβασε προσεκτικά ΟΛΟ το κείμενο (μπορεί να έχει πολλές σελίδες) και κάλεσε το εργαλείο "record_extraction" με τα δομημένα κριτήρια επιλεξιμότητας.

Δώσε ιδιαίτερη προσοχή στα παρακάτω, που συχνά παραλείπονται αν δεν τα ψάξεις ρητά:
- Ημερομηνίες έναρξης/λήξης ηλεκτρονικής υποβολής αιτήσεων (startDate/endDate) — αναζήτησε φράσεις όπως "ημερομηνία έναρξης ηλεκτρονικής υποβολής" και "καταληκτική ημερομηνία".
- fundedActions: όλες οι διακριτές ενέργειες/δράσεις που χρηματοδοτούνται (π.χ. "Εκσυγχρονισμός παραγωγής", "Τεχνολογική αναβάθμιση", "Πιστοποιήσεις και ποιότητα") — μία εγγραφή ανά ενέργεια με σύντομο τίτλο και την περιγραφή της.
- expenseCategories: αν υπάρχει πίνακας "ΕΠΙΛΕΞΙΜΕΣ ΚΑΤΗΓΟΡΙΕΣ ΔΑΠΑΝΩΝ" (κωδικοί ΟΠΣΚΕ όπως 02.20, 04.18 κ.λπ.), μετέγραψε ΚΑΘΕ γραμμή του πίνακα ως ξεχωριστή εγγραφή με code, category, expense, limit — μην τα συνοψίζεις σε ελεύθερο κείμενο.

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
