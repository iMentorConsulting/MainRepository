// One-time, admin-triggered LLM pass that classifies each line of a
// program's "Άλλες Προϋποθέσεις" (and any manual extra criteria) into:
//  - "ask": genuinely answerable by the business owner in casual
//    conversation -> rewritten into a short, plain-language Ναι/Όχι question.
//  - "skip_accountant": only the accountant has the underlying data (e.g.
//    revenue-by-ΚΑΔ percentage, ΕΜΕ/employee-month counts) -> excluded from
//    the business-facing questionnaire, flagged with a reason for the admin.
//  - "skip_obligation": not an eligibility criterion at all, but a
//    post-approval obligation/penalty/refund clause -> dropped, flagged with
//    a reason for the admin.
//
// This runs ONCE per program (admin clicks "Δημιουργία με AI"), never per
// business and never per chat turn — the per-business questionnaire itself
// stays pure rule evaluation (src/lib/eligibility-questions.ts), with zero
// LLM cost. The admin reviews/edits every proposal before it goes live.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const MAX_RESPONSE_TOKENS = 4_000

const classificationSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    action: z.enum(['ask', 'skip_accountant', 'skip_obligation']),
    question: z.string().nullable().default(null),
    reason: z.string().nullable().default(null),
  })),
})

export interface RequirementClassification {
  id: string
  originalText: string
  action: 'ask' | 'skip_accountant' | 'skip_obligation'
  question: string | null
  reason: string | null
}

const TOOL_SCHEMA = {
  name: 'classify_requirements',
  description: 'Records, for each numbered eligibility requirement, whether the business owner can answer it directly and how to phrase it as a plain question, or why it should be skipped.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Same id given in the input for this requirement' },
            action: {
              type: 'string',
              enum: ['ask', 'skip_accountant', 'skip_obligation'],
              description: '"ask" if a business owner can answer this in casual conversation; "skip_accountant" if it needs data only the accountant has (revenue breakdowns, ΕΜΕ/employee counts, financial ratios); "skip_obligation" if it is a post-approval obligation/penalty/refund clause, not an eligibility criterion',
            },
            question: { type: ['string', 'null'], description: 'Required when action is "ask": a short, plain-language Ναι/Όχι question a business owner would understand, in Greek. Explain any jargon (e.g. ΕΜΕ) in plain words instead of using the term.' },
            reason: { type: ['string', 'null'], description: 'Required when action is "skip_accountant" or "skip_obligation": a short note for the admin/accountant explaining why this was skipped' },
          },
          required: ['id', 'action'],
        },
      },
    },
    required: ['items'],
  },
}

const SYSTEM_PROMPT = `Είσαι βοηθός που μετατρέπει τους όρους επιλεξιμότητας ενός προγράμματος χρηματοδότησης (ΕΣΠΑ/ΔΥΠΑ) σε ερωτήσεις που μπορεί να απαντήσει ο ίδιος ο επιχειρηματίας σε μια χαλαρή συνομιλία με τον ψηφιακό σύμβουλο "Ερμής".

Θα σου δοθεί μια λίστα από απαιτήσεις, καθεμία με ένα id. Για ΚΑΘΕ μία, ταξινόμησέ την σε ΜΙΑ από τις τρεις κατηγορίες:

1. "ask" — Ο επιχειρηματίας μπορεί να την απαντήσει ο ίδιος, αμέσως, χωρίς να ψάξει αρχεία ή τον λογιστή του (π.χ. αν η επιχείρηση είναι νεοσύστατη, αν έχει συγκεκριμένη πιστοποίηση, αν δραστηριοποιείται σε συγκεκριμένο τομέα). Γράψε ΣΥΝΤΟΜΗ, απλή ερώτηση Ναι/Όχι στα ελληνικά, σε φυσική γλώσσα, ΧΩΡΙΣ νομική/γραφειοκρατική διατύπωση. Αν η απαίτηση αναφέρεται σε προσωπικό/ΕΜΕ (Ετήσιες Μονάδες Εργασίας), ΜΗΝ χρησιμοποιήσεις τον όρο "ΕΜΕ" — εξήγησέ το σε απλά λόγια: 1 ΕΜΕ = 1 εργαζόμενος πλήρους απασχόλησης για 12 μήνες (ή το ισοδύναμο, π.χ. 2 εργαζόμενοι για 6 μήνες έκαστος). Διατύπωσε την ερώτηση με βάση αυτή την εξήγηση, π.χ. αντί για "Διατηρείτε τουλάχιστον 2 ΕΜΕ;" γράψε "Απασχολείτε προσωπικό που αντιστοιχεί σε τουλάχιστον 2 εργαζομένους πλήρους απασχόλησης όλο τον χρόνο (ή ισοδύναμο, π.χ. 4 εργαζόμενοι με μισή απασχόληση);".

2. "skip_accountant" — Η απαίτηση χρειάζεται συγκεκριμένα οικονομικά/λογιστικά στοιχεία που μόνο ο λογιστής της επιχείρησης γνωρίζει ή μπορεί να υπολογίσει με ακρίβεια (π.χ. ποσοστό κύκλου εργασιών ανά ΚΑΔ, ακριβής αριθμός ΕΜΕ από μισθοδοσία, χρηματοοικονομικοί δείκτες, στοιχεία ισολογισμού). Αυτές ΔΕΝ ρωτιούνται στον επιχειρηματία σε συνομιλία chat — γράψε reason εξηγώντας γιατί, ώστε ο λογιστής να το ελέγξει ο ίδιος αργότερα.

3. "skip_obligation" — Η γραμμή δεν είναι κριτήριο επιλεξιμότητας αλλά υποχρέωση/όρος ΜΕΤΑ την έγκριση (π.χ. ρήτρα επιστροφής επιχορήγησης, ποινή, υποχρέωση διατήρησης επένδυσης για Χ χρόνια μετά την ολοκλήρωση, λοιπές συμβατικές υποχρεώσεις). Δεν ελέγχεται πριν την υποβολή — γράψε reason εξηγώντας ότι είναι μεταγενέστερη υποχρέωση, όχι κριτήριο επιλεξιμότητας.

ΠΟΤΕ δεν ξαναρωτάς για στοιχεία που είναι ήδη γνωστά από τα στοιχεία της επιχείρησης (ΚΑΔ, περιφέρεια, νομική μορφή, ημερομηνία ίδρυσης) — αυτά δεν εμφανίζονται καθόλου σε αυτή τη λίστα, αλλά αν κάποια γραμμή απλά επαναλαμβάνει κάτι τέτοιο, ταξινόμησέ τη ως "skip_accountant" με σχετικό reason, μην τη μετατρέψεις σε ερώτηση.

Κάλεσε το εργαλείο "classify_requirements" με μία εγγραφή ανά id, με την ΙΔΙΑ σειρά/ids που δόθηκαν.`

export async function classifyEligibilityRequirements(
  items: { id: string; text: string }[]
): Promise<RequirementClassification[]> {
  if (items.length === 0) return []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  const anthropic = new Anthropic({ apiKey })
  const userContent = items.map(it => `[${it.id}] ${it.text}`).join('\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: MAX_RESPONSE_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'classify_requirements' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Το μοντέλο δεν επέστρεψε δομημένη ταξινόμηση.')

  const parsed = classificationSchema.parse(toolUse.input)

  return items.map(it => {
    const match = parsed.items.find(p => p.id === it.id)
    return {
      id: it.id,
      originalText: it.text,
      action: match?.action ?? 'ask',
      question: match?.question ?? null,
      reason: match?.reason ?? null,
    }
  })
}
