// Ταμείο Μικροπιστώσεων — two-step business-plan tooling:
//   1. generateMicrocreditsQuestionnaire(): an AI-tailored questionnaire built
//      around the specific ΚΑΔ the consultant picked as the application's
//      focus (not just whichever ΚΑΔ happened to match the program), styled
//      after the office's own hand-written examples (10 numbered sections,
//      bold financial questions, bullet checklists, fill-in-the-blank lines).
//   2. generateBusinessPlanSections(): once the client answers, drafts the
//      three narrative sections (1.1, 2.1, 2.2) of the official Word
//      template as a draft for the consultant to review before download.
//   3. computeProjections(): pure arithmetic for the 3-year forecast table —
//      no AI involved, so the numbers are always exactly reproducible.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const MAX_RESPONSE_TOKENS = 8_000

export interface QuestionnaireQuestion {
  id: string
  section: number
  sectionTitle: string
  text: string
  bold: boolean
}

const questionnaireSchema = z.object({
  sections: z.array(z.object({
    section: z.number(),
    sectionTitle: z.string(),
    questions: z.array(z.object({
      text: z.string(),
      bold: z.boolean().default(false),
    })),
  })),
})

const QUESTIONNAIRE_TOOL_SCHEMA = {
  name: 'build_questionnaire',
  description: 'Records a 10-section questionnaire for a business applying to the Ταμείο Μικροπιστώσεων program, tailored to its specific activity.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section: { type: 'integer', description: '1-10, matching the fixed section order' },
            sectionTitle: { type: 'string', description: 'Greek section title, e.g. "Στοιχεία Επιχείρησης"' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'The question text in Greek. May include bullet checklist options or fill-in-the-blank lines (e.g. "______€/τ.μ.") as separate lines within the same string, exactly like the office\'s own examples.' },
                  bold: { type: 'boolean', description: 'true for key quantitative/financial questions (amounts, percentages, counts) that matter most for the business plan numbers' },
                },
                required: ['text', 'bold'],
              },
            },
          },
          required: ['section', 'sectionTitle', 'questions'],
        },
      },
    },
    required: ['sections'],
  },
}

const QUESTIONNAIRE_SYSTEM_PROMPT = `Είσαι βοηθός που συντάσσει ερωτηματολόγια για πελάτες του Ταμείου Μικροπιστώσεων (ΤΕΠΙΧ ΙΙΙ), στο ύφος που ήδη χρησιμοποιεί το γραφείο I-MENTOR.

ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ — κράτα το ΣΥΝΤΟΜΟ: ο πελάτης πρέπει να το συμπληρώνει σε λίγα λεπτά, όχι να κουράζεται. ΣΥΝΟΛΙΚΑ σε όλο το ερωτηματολόγιο, όχι περισσότερες από 18-22 ερωτήσεις. Κάθε ερώτηση σύντομη, μία γραμμή όπου γίνεται. Μην ρωτάς το ίδιο πράγμα με διαφορετική διατύπωση σε διαφορετικές ενότητες.

ΠΟΤΕ μην ρωτάς για στοιχεία που το γραφείο ήδη γνωρίζει και σου δίνονται παρακάτω (ημερομηνία ίδρυσης, νομική μορφή, ΚΑΔ, διεύθυνση, στοιχεία επικοινωνίας) — αυτά ΔΕΝ μπαίνουν καθόλου στο ερωτηματολόγιο.

ΠΟΤΕ μην ρωτάς για οικονομικά/αριθμητικά στοιχεία απόδοσης της επιχείρησης σε € (κύκλος εργασιών, τζίρος, κέρδη, εξέλιξη εσόδων ανά έτος, λειτουργικό κόστος σε €) — αυτά τα αντλεί το γραφείο απευθείας από τα λογιστικά στοιχεία που ήδη τηρεί για τον πελάτη, όχι από τον ίδιο. Ποσοστιαίες (%) κατανομές εσόδων ανά κατηγορία προϊόντος/υπηρεσίας επιτρέπονται (δεν είναι απόλυτο ποσό), αλλά μόνο αν είναι πραγματικά χρήσιμες για τη δραστηριότητα — μην τις συμπεριλαμβάνεις απλώς και μόνο επειδή υπήρχαν σε παλιότερο παράδειγμα.

Το ερωτηματολόγιο έχει ΠΑΝΤΑ αυτές τις ενότητες, με αυτή τη σειρά — αλλά ΠΑΡΑΛΕΙΨΕ οποιαδήποτε ενότητα δεν έχει καμία ουσιαστική, μη-οικονομική ερώτηση να προσφέρει για τη συγκεκριμένη δραστηριότητα:
1. Στοιχεία Δραστηριότητας (ΜΟΝΟ ό,τι δεν γνωρίζουμε ήδη: γεωγραφική περιοχή δραστηριότητας αν διαφέρει από την έδρα, προσωπικό, επαγγελματικός χώρος, εποχικότητα — ΟΧΙ έναρξη/νομική μορφή)
2. Παρεχόμενες Υπηρεσίες/Προϊόντα (checklist προσαρμοσμένο στη δραστηριότητα — τι ακριβώς κάνει/πουλάει, ποιο είναι το κύριο)
3. Πελατολόγιο (τύποι πελατών, πώς τους βρίσκει)
4. Εξοπλισμός (τι βασικό εξοπλισμό διαθέτει, αν χρειάζεται αναβάθμιση)
5. Σχέδιο Ανάπτυξης (1-2 σύντομες ερωτήσεις: στόχος, ανταγωνιστικό πλεονέκτημα)
6. Χρήση Χρηματοδότησης (€3.000 – €25.000) (ποσό, σε ποιες κατηγορίες δαπανών προσαρμοσμένες στον κλάδο, πώς θα βοηθήσει)

Οι ερωτήσεις πρέπει να είναι ΣΥΓΚΕΚΡΙΜΕΝΕΣ για τη δραστηριότητα που σου δίνεται (ΚΑΔ + τυχόν σημείωση συμβούλου) — όχι γενικές.

Μορφή: κάθε ενότητα έχει μια λίστα ερωτήσεων. Μέσα στο "text" μιας ερώτησης μπορείς να συμπεριλάβεις bullet επιλογές σε ξεχωριστές γραμμές (με \\n) όταν βοηθάει (π.χ. "Ποιες ακριβώς υπηρεσίες παρέχει η επιχείρηση;\\n- Επιλογή Α\\n- Επιλογή Β"). Σήμανε bold=true μόνο στις 2-3 πιο καθοριστικές ερωτήσεις ανά ενότητα.

Κάλεσε το εργαλείο "build_questionnaire".`

export async function generateMicrocreditsQuestionnaire(params: {
  businessName: string
  foundingDate: string | null
  legalForm: string | null
  selectedKad: { code: string; description: string }[]
  activityNote?: string | null
  // Free-text extra guidance from the consultant when regenerating a draft
  // after reviewing it (e.g. "αφαίρεσε τις ερωτήσεις για προσωπικό",
  // "πρόσθεσε κάτι για τις άδειες λειτουργίας").
  extraInstructions?: string | null
}): Promise<QuestionnaireQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  const anthropic = new Anthropic({ apiKey })

  const kadLines = params.selectedKad.map(k => `ΚΑΔ ${k.code}: ${k.description}`).join('\n')
  const userContent = `Επιχείρηση: ${params.businessName}
Ήδη γνωστά στοιχεία (ΜΗΝ τα ξαναρωτήσεις): ημερομηνία ίδρυσης ${params.foundingDate || '—'}, νομική μορφή ${params.legalForm || '—'}.
Επιλεγμένοι ΚΑΔ για την αίτηση:
${kadLines}
${params.activityNote ? `\nΣημείωση συμβούλου για την πραγματική δραστηριότητα (έχει προτεραιότητα έναντι της επίσημης περιγραφής ΚΑΔ αν διαφέρουν): ${params.activityNote}` : ''}
${params.extraInstructions ? `\nΠρόσθετες οδηγίες από τον σύμβουλο για αυτό το ερωτηματολόγιο (έχουν προτεραιότητα): ${params.extraInstructions}` : ''}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: MAX_RESPONSE_TOKENS,
    system: QUESTIONNAIRE_SYSTEM_PROMPT,
    tools: [QUESTIONNAIRE_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'build_questionnaire' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Το μοντέλο δεν επέστρεψε δομημένο ερωτηματολόγιο.')

  const parsed = questionnaireSchema.parse(toolUse.input)

  const questions: QuestionnaireQuestion[] = []
  let counter = 1
  for (const sec of parsed.sections) {
    for (const q of sec.questions) {
      questions.push({
        id: `q${counter++}`,
        section: sec.section,
        sectionTitle: sec.sectionTitle,
        text: q.text,
        bold: q.bold,
      })
    }
  }
  return questions
}

// ─── Business-plan narrative drafting ──────────────────────────────────────

export interface BusinessPlanInput {
  businessName: string
  legalForm: string | null
  foundingDate: string | null
  selectedKad: { code: string; description: string }[]
  activityNote?: string | null
  questions: QuestionnaireQuestion[]
  answers: Record<string, string>
  currentRevenue: number
  currentEbitda: number
  currentNetProfit: number
  loanAmount: number
  workingCapitalAmount: number
  fixedAssetsAmount: number
  consultantNotes?: string | null
}

export interface BusinessPlanSections {
  section1_1: string[]
  section2_1: string[]
  section2_2: string[]
}

const sectionsSchema = z.object({
  section1_1: z.array(z.string()),
  section2_1: z.array(z.string()),
  section2_2: z.array(z.string()),
})

const SECTIONS_TOOL_SCHEMA = {
  name: 'draft_business_plan_sections',
  description: 'Records the three narrative sections of a Ταμείο Μικροπιστώσεων business plan, each as an array of paragraphs.',
  input_schema: {
    type: 'object' as const,
    properties: {
      section1_1: {
        type: 'array', items: { type: 'string' },
        description: 'ΣΥΝΟΠΤΙΚΗ ΠΑΡΟΥΣΙΑΣΗ ΤΗΣ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ — one paragraph per letter (A., B., C., D., E., F.), each starting with "A. <τίτλος>" etc. exactly like the office examples: Σύντομο Ιστορικό, Αντικείμενο δραστηριότητας, Υφιστάμενος εξοπλισμός, Παραγωγική δυναμικότητα (must cite the exact current revenue/net profit/margin figures given), Ανάλυση πελατών/προμηθευτών, Ανάλυση αγοράς.',
      },
      section2_1: {
        type: 'array', items: { type: 'string' },
        description: 'ΓΕΝΙΚΗ ΠΕΡΙΓΡΑΦΗ επένδυσης — one paragraph per letter (A. Στόχος, B. Φυσικό αντικείμενο, C. Σχέδιο διαχείρισης κεφαλαίου κίνησης/εκτίμηση αναγκών — must cite the exact loan amount and split given, D. Στρατηγικός σχεδιασμός/marketing, E. Χρονοδιάγραμμα).',
      },
      section2_2: {
        type: 'array', items: { type: 'string' },
        description: 'ΠΙΝΑΚΑΣ ΔΑΠΑΝΩΝ — one paragraph per letter (A. Προϋπολογισμός — must cite the exact loan amount, working-capital/fixed-assets split and list the specific expense categories drawn from the questionnaire answers).',
      },
    },
    required: ['section1_1', 'section2_1', 'section2_2'],
  },
}

const SECTIONS_SYSTEM_PROMPT = `Είσαι έμπειρος σύμβουλος που συντάσσει επιχειρηματικά σχέδια (business plans) για ένταξη στο Πρόγραμμα «Ταμείο Μικροπιστώσεων ΤΕΠΙΧ ΙΙΙ», στο ακριβές ύφος που ήδη χρησιμοποιεί το γραφείο I-MENTOR.

Ύφος: επίσημη, τρίτο πρόσωπο ("Η επιχείρηση..."), συγκεκριμένοι αριθμοί (όχι γενικόλογες διατυπώσεις), σύντομες έως μεσαίες παράγραφοι. ΚΑΘΕ παράγραφος ξεκινάει με ένα γράμμα-ετικέτα ("A. <σύντομος τίτλος>", "B. <τίτλος>", κλπ.) ακολουθούμενο από το κείμενο, ΑΚΡΙΒΩΣ όπως στα παραδείγματα του γραφείου.

Χρησιμοποίησε ΠΑΝΤΑ τους ακριβείς αριθμούς (κύκλος εργασιών, EBITDA, κέρδη μετά φόρων, ποσό δανείου, split κεφαλαίου κίνησης/παγίων) που σου δίνονται — ποτέ μην τους στρογγυλοποιήσεις διαφορετικά ή μην τους αλλάξεις. Υπολόγισε και ανέφερε το ποσοστό που αντιστοιχεί το αιτούμενο δάνειο επί του κύκλου εργασιών, ακριβώς όπως κάνουν τα παραδείγματα (π.χ. "αντιστοιχεί σε περίπου X% του κύκλου εργασιών").

Άντλησε τις πληροφορίες δραστηριότητας, πελατολογίου, εξοπλισμού, τιμολόγησης, εξόδων και σχεδίων ανάπτυξης ΑΠΟ ΤΙΣ ΑΠΑΝΤΗΣΕΙΣ του ερωτηματολογίου που σου δίνονται — μην επινοείς στοιχεία που δεν υποστηρίζονται από αυτές. Αν μια απάντηση λείπει ή είναι αόριστη, διατύπωσε την πρόταση γενικά χωρίς να εφεύρεις συγκεκριμένο αριθμό.

Αν δίνεται σημείωση συμβούλου, ενσωμάτωσέ την με προτεραιότητα έναντι της επίσημης περιγραφής ΚΑΔ.

Κάλεσε το εργαλείο "draft_business_plan_sections".`

export async function generateBusinessPlanSections(input: BusinessPlanInput): Promise<BusinessPlanSections> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  const anthropic = new Anthropic({ apiKey })

  const kadLines = input.selectedKad.map(k => `ΚΑΔ ${k.code}: ${k.description}`).join('\n')
  const qaLines = input.questions
    .map(q => {
      const answer = input.answers[q.id]
      return answer ? `[${q.sectionTitle}] ${q.text.split('\n')[0]} → ${answer}` : null
    })
    .filter(Boolean)
    .join('\n')

  const workingCapitalPct = input.loanAmount > 0 ? Math.round((input.workingCapitalAmount / input.loanAmount) * 100) : 0
  const fixedAssetsPct = input.loanAmount > 0 ? Math.round((input.fixedAssetsAmount / input.loanAmount) * 100) : 0

  const userContent = `Επιχείρηση: ${input.businessName}${input.legalForm ? ` (${input.legalForm})` : ''}${input.foundingDate ? `, ίδρυση ${input.foundingDate}` : ''}
Επιλεγμένοι ΚΑΔ επένδυσης:
${kadLines}
${input.activityNote ? `Σημείωση συμβούλου για την πραγματική δραστηριότητα: ${input.activityNote}\n` : ''}
Τρέχοντα οικονομικά στοιχεία (τρέχον έτος):
- Κύκλος εργασιών: ${input.currentRevenue.toLocaleString('el-GR')} €
- EBITDA: ${input.currentEbitda.toLocaleString('el-GR')} €
- Κέρδη μετά φόρων: ${input.currentNetProfit.toLocaleString('el-GR')} €

Αιτούμενη χρηματοδότηση:
- Ποσό: ${input.loanAmount.toLocaleString('el-GR')} €
- Κεφάλαιο κίνησης: ${input.workingCapitalAmount.toLocaleString('el-GR')} € (${workingCapitalPct}%)
- Πάγια: ${input.fixedAssetsAmount.toLocaleString('el-GR')} € (${fixedAssetsPct}%)

${input.consultantNotes ? `Σημειώσεις συμβούλου: ${input.consultantNotes}\n` : ''}
Απαντήσεις ερωτηματολογίου πελάτη:
${qaLines || '(καμία απάντηση ακόμη)'}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: MAX_RESPONSE_TOKENS,
    system: SECTIONS_SYSTEM_PROMPT,
    tools: [SECTIONS_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'draft_business_plan_sections' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Το μοντέλο δεν επέστρεψε δομημένο επιχειρηματικό σχέδιο.')

  return sectionsSchema.parse(toolUse.input)
}

// ─── Financial projections (pure arithmetic, no AI) ────────────────────────

export interface Projections {
  revenue: [number, number, number]
  ebitda: [number, number, number]
  netProfit: [number, number, number]
  marginPct: [number, number, number]
}

// Compounds each year-1 baseline by the same annual % for 3 years (t+1..t+3),
// matching the office's own examples' convention of projecting from the
// first post-financing year, not the current (pre-financing) year.
export function computeProjections(params: {
  currentRevenue: number
  currentEbitda: number
  currentNetProfit: number
  annualGrowthPct: number
}): Projections {
  const factor = 1 + params.annualGrowthPct / 100
  const revenue: [number, number, number] = [
    Math.round(params.currentRevenue * factor),
    Math.round(params.currentRevenue * factor ** 2),
    Math.round(params.currentRevenue * factor ** 3),
  ]
  const ebitda: [number, number, number] = [
    Math.round(params.currentEbitda * factor),
    Math.round(params.currentEbitda * factor ** 2),
    Math.round(params.currentEbitda * factor ** 3),
  ]
  const netProfit: [number, number, number] = [
    Math.round(params.currentNetProfit * factor),
    Math.round(params.currentNetProfit * factor ** 2),
    Math.round(params.currentNetProfit * factor ** 3),
  ]
  const marginPct = netProfit.map((np, i) => revenue[i] > 0 ? Math.round((np / revenue[i]) * 100) : 0) as [number, number, number]
  return { revenue, ebitda, netProfit, marginPct }
}
