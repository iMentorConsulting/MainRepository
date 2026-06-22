import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { prisma } from './prisma'

// Hard cap on input size sent to Claude — protects against runaway token cost
// from oversized PDF text. ~400k chars ≈ ~100k tokens, enough for large
// multi-page announcement PDFs while still well short of Claude's 1M context.
export const MAX_SOURCE_TEXT_CHARS = 400_000

// Small, fixed ceiling on the model's response — the structured tool-call
// output is always short, so this also limits cost per call.
const MAX_RESPONSE_TOKENS = 2_000

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
    },
    required: ['kadRules', 'regionRules', 'zipCodeRules', 'excludedLegalForms', 'keyPoints'],
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

  const systemPrompt = `Είσαι ειδικός στην ανάγνωση ελληνικών προκηρύξεων προγραμμάτων χρηματοδότησης (ΕΣΠΑ/ΔΥΠΑ). Διάβασε το κείμενο και κάλεσε το εργαλείο "record_extraction" με τα δομημένα κριτήρια επιλεξιμότητας. Χρησιμοποίησε τα παρακάτω διορθωμένα παραδείγματα ως οδηγό ύφους/ακρίβειας:\n\n${fewShotBlock}`

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
