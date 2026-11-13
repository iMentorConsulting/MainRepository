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
  description: 'Records a short, sectioned questionnaire for a business applying to the Ταμείο Μικροπιστώσεων program, tailored to its specific activity.',
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
1. Στοιχεία Δραστηριότητας (ΜΟΝΟ ό,τι δεν γνωρίζουμε ήδη: γεωγραφική περιοχή δραστηριότητας αν διαφέρει από την έδρα, προσωπικό, επαγγελματικός χώρος, εποχικότητα — ΟΧΙ έναρξη/νομική μορφή. ΠΑΝΤΑ συμπεριέλαβε μία ερώτηση αν ο χώρος λειτουργίας/επένδυσης διαφέρει από την έδρα και, αν ναι, να δοθεί η ακριβής διεύθυνση — οδός, αριθμός, περιοχή.)
2. Παρεχόμενες Υπηρεσίες/Προϊόντα (checklist προσαρμοσμένο στη δραστηριότητα — τι ακριβώς κάνει/πουλάει, ποιο είναι το κύριο)
3. Πελατολόγιο (τύποι πελατών, πώς τους βρίσκει — ΠΑΝΤΑ συμπεριέλαβε και τις δύο: πόσους πελάτες εξυπηρετεί κατά μέσο όρο ημερησίως/μηνιαίως, και ποιο είναι το μέσο έσοδο ανά πελάτη)
4. Εξοπλισμός (τι βασικό εξοπλισμό διαθέτει — ζήτα τη λίστα ως σύντομα bullet-items, π.χ. "Ψυγεία / ψυκτικοί θάλαμοι", όχι μία γενική πρόταση· αν χρειάζεται αναβάθμιση)
5. Λειτουργικά Έξοδα & Συνεργασίες (checklist βασικών κατηγοριών λειτουργικών εξόδων προσαρμοσμένο στη δραστηριότητα, π.χ. αγορές εμπορευμάτων, μισθοδοσία/αμοιβές συνεργατών, ενοίκιο/λειτουργικά εγκαταστάσεων, αναλώσιμα, λοιπά· ΚΑΙ ερώτηση για 1-2 βασικούς προμηθευτές/συνεργάτες — να αναφερθούν οι επωνυμίες τους)
6. Διαδικτυακή Παρουσία (διαθέτει ιστοσελίδα/επαγγελματικούς λογαριασμούς σε μέσα κοινωνικής δικτύωσης· πραγματοποιεί πωλήσεις μέσω διαδικτύου/πλατφορμών delivery)
7. Χρήση Χρηματοδότησης (€3.000 – €25.000) — ζήτα ΑΝΑΛΥΤΙΚΟ διαχωρισμό του αιτούμενου ποσού σε δύο ξεχωριστές ερωτήσεις με bold=true: (α) ποσό για πάγιο εξοπλισμό σε €, (β) ποσό για λειτουργικές δαπάνες/κεφάλαιο κίνησης σε € — ΟΧΙ ένα ενιαίο ποσό με checklist κατηγοριών όπως πριν. Πρόσθεσε και ανοιχτή ερώτηση πώς θα βοηθήσει συγκεκριμένα η χρηματοδότηση τη λειτουργία της επιχείρησης.

ΜΗΝ συμπεριλάβεις ενότητα "Σχέδιο Ανάπτυξης" (στόχος ανάπτυξης/ανταγωνιστικό πλεονέκτημα) — αφαιρέθηκε οριστικά, το γραφείο τη συντάσσει μόνο του.

Για την ενότητα 7 (Χρήση Χρηματοδότησης), ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ πλαίσιο (για τη δική σου κρίση, όχι για να το γράψεις στον πελάτη): στην πράξη, το ~90% των αιτήσεων γραφείου καλύπτει ΑΠΟΚΛΕΙΣΤΙΚΑ ΛΕΙΤΟΥΡΓΙΚΕΣ ΔΑΠΑΝΕΣ (κεφάλαιο κίνησης) — ΟΧΙ πάγια/εξοπλισμό/ανακαινίσεις/επενδυτικού τύπου δαπάνες, και μόνο όταν δεν υπάρχουν αρκετές λειτουργικές ανάγκες ορίζεται ποσό παγίων. Δαπάνες μισθοδοσίας συγγενών α΄/β΄ βαθμού δεν είναι επιλέξιμες και δεν πρέπει να υπάρξει μείωση προσωπικού — μην ρωτάς τον πελάτη γι' αυτά, απλώς μην τα προτείνεις ως κατηγορία δαπάνης στην ενότητα 5.

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
  operatingExpenseBreakdown?: ExpenseBreakdown | null
  fixedAssetItems?: FixedAssetItem[] | null
  consultantNotes?: string | null
}

export interface ExpenseBreakdown {
  emporeumata: number
  analosima: number
  deko: number
  enoikia: number
  loipa: number
}

export interface FixedAssetItem {
  description: string
  amount: number
}

export interface BusinessPlanSections {
  section1_1: string[]
  section2_1: string[]
}

const sectionsSchema = z.object({
  section1_1: z.array(z.string()),
  section2_1: z.array(z.string()),
})

const SECTIONS_TOOL_SCHEMA = {
  name: 'draft_business_plan_sections',
  description: 'Records the two AI-drafted narrative sections of a Ταμείο Μικροπιστώσεων business plan. The spending-breakdown section (2.2) and the timeline point (2.1-E) are NOT drafted here — built deterministically elsewhere from exact consultant-supplied figures.',
  input_schema: {
    type: 'object' as const,
    properties: {
      section1_1: {
        type: 'array', items: { type: 'string' },
        description: 'ΣΥΝΟΠΤΙΚΗ ΠΑΡΟΥΣΙΑΣΗ ΤΗΣ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ — exactly 6 entries, one per letter A-F. Each string is formatted as "<Γράμμα>. <Τίτλος>\\n<σώμα κειμένου>" — the label ALWAYS on its own line before the "\\n", never on the same line as the body text. A. Σύντομο Ιστορικό (state how many years the business has operated, computed from the founding date given, and connect its location to who it actually serves — locals, plus visitors too if seasonality/tourism comes up in the answers; mention family/sole-proprietor staffing if relevant). B. Αντικείμενο δραστηριότητας (name the ACTUAL product/service categories from the questionnaire answers verbatim — never a vague "πλήρη γκάμα κατηγοριών" generality — plus the sales-mix % if given). C. Υφιστάμενος εξοπλισμός (after the opening sentence, add another "\\n" then list the actual equipment items from the answers as short bullet lines, each on its own "\\n", e.g. "- Ψυγεία / ψυκτικοί θάλαμοι\\n- Ράφια / προθήκες" — never a vague generality with no items). D. Παραγωγική δυναμικότητα (must cite the exact current revenue/EBITDA/net profit/margin figures given, using the LITERAL year number given — never the phrase "τρέχον έτος"; state the average customers served and average revenue per customer if those answers were given; state concretely how the working-capital amount will help operations, tied to what the client said it would fund, not an abstract "ενίσχυση ρευστότητας"). E. Ανάλυση πελατών/προμηθευτών (name the 1-2 actual supplier/partner names from the answers if given). F. Ανάλυση αγοράς (qualitative, as before).',
      },
      section2_1: {
        type: 'array', items: { type: 'string' },
        description: 'ΓΕΝΙΚΗ ΠΕΡΙΓΡΑΦΗ επένδυσης — exactly 4 entries, one per letter A-D (NEVER a 5th "Ε. Χρονοδιάγραμμα" entry — appended automatically afterward), same "<Γράμμα>. <Τίτλος>\\n<σώμα>" format. A. Στόχος, B. Φυσικό αντικείμενο (qualitative, as before). C. Σχέδιο διαχείρισης κεφαλαίου κίνησης/εκτίμηση αναγκών (must cite the exact loan amount and κεφάλαιο κίνησης/πάγια split given, AND must name — in prose, not amounts — which spending categories it covers, e.g. "...θα διατεθεί για αγορά εμπορευμάτων, αναλώσιμα, πάγιες λειτουργικές δαπάνες (ΔΕΚΟ, ενοίκιο) κ.λπ." using the real category names given; the exact euro amounts per category appear separately in 2.2, so don\'t restate the table here). D. Στρατηγικός σχεδιασμός/marketing (qualitative, as before).',
      },
    },
    required: ['section1_1', 'section2_1'],
  },
}

const SECTIONS_SYSTEM_PROMPT = `Είσαι έμπειρος σύμβουλος που συντάσσει επιχειρηματικά σχέδια (business plans) για ένταξη στο Πρόγραμμα «Ταμείο Μικροπιστώσεων ΤΕΠΙΧ ΙΙΙ», στο ακριβές ύφος που ήδη χρησιμοποιεί το γραφείο I-MENTOR.

Ύφος: επίσημη, τρίτο πρόσωπο ("Η επιχείρηση..."), συγκεκριμένοι αριθμοί (όχι γενικόλογες διατυπώσεις), σύντομες έως μεσαίες παράγραφοι. ΚΑΘΕ παράγραφος είναι ένα string με τη μορφή "<Γράμμα>. <Τίτλος>\\n<κείμενο>" — η ετικέτα ΠΑΝΤΑ σε δική της γραμμή πριν το "\\n", ποτέ στην ίδια γραμμή με το κείμενο, ΑΚΡΙΒΩΣ όπως στα παραδείγματα του γραφείου.

Χρησιμοποίησε ΠΑΝΤΑ τους ακριβείς αριθμούς (κύκλος εργασιών, EBITDA, κέρδη μετά φόρων, ποσό δανείου, split κεφαλαίου κίνησης/παγίων, τρέχον έτος) που σου δίνονται — ποτέ μην τους στρογγυλοποιήσεις διαφορετικά, μην τους αλλάξεις, και ΠΟΤΕ μη γράψεις τη φράση "τρέχον έτος" — γράψε πάντα τον ίδιο τον αριθμό του έτους. Υπολόγισε και ανέφερε το ποσοστό που αντιστοιχεί το αιτούμενο δάνειο επί του κύκλου εργασιών, ακριβώς όπως κάνουν τα παραδείγματα (π.χ. "αντιστοιχεί σε περίπου X% του κύκλου εργασιών").

Άντλησε τις πληροφορίες δραστηριότητας, πελατολογίου, εξοπλισμού, προμηθευτών και εξόδων ΑΠΟ ΤΙΣ ΑΠΑΝΤΗΣΕΙΣ του ερωτηματολογίου που σου δίνονται, κυριολεκτικά (ονόματα προϊόντων/εξοπλισμού/προμηθευτών όπως ακριβώς δόθηκαν) — μην επινοείς στοιχεία που δεν υποστηρίζονται από αυτές, και μην τα γενικεύεις σε κάτι αόριστο. Αν μια απάντηση λείπει, παράλειψε την αναφορά χωρίς να εφεύρεις κάτι.

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
  const currentYear = new Date().getFullYear()

  const categoryLabels: Record<keyof ExpenseBreakdown, string> = {
    emporeumata: 'αγορά εμπορευμάτων', analosima: 'αναλώσιμα', deko: 'ΔΕΚΟ', enoikia: 'ενοίκιο', loipa: 'λοιπά λειτουργικά έξοδα',
  }
  const activeCategories = input.operatingExpenseBreakdown
    ? (Object.keys(categoryLabels) as (keyof ExpenseBreakdown)[])
        .filter(k => (input.operatingExpenseBreakdown![k] || 0) > 0)
        .map(k => categoryLabels[k])
    : []
  const fixedAssetNames = (input.fixedAssetItems || []).map(i => i.description).filter(Boolean)

  const userContent = `Επιχείρηση: ${input.businessName}${input.legalForm ? ` (${input.legalForm})` : ''}${input.foundingDate ? `, ίδρυση ${input.foundingDate}` : ''}
Επιλεγμένοι ΚΑΔ επένδυσης:
${kadLines}
${input.activityNote ? `Σημείωση συμβούλου για την πραγματική δραστηριότητα: ${input.activityNote}\n` : ''}
Τρέχον έτος (γράψε τον αριθμό, ποτέ τη φράση "τρέχον έτος"): ${currentYear}
Τρέχοντα οικονομικά στοιχεία (έτος ${currentYear}):
- Κύκλος εργασιών: ${input.currentRevenue.toLocaleString('el-GR')} €
- EBITDA: ${input.currentEbitda.toLocaleString('el-GR')} €
- Κέρδη μετά φόρων: ${input.currentNetProfit.toLocaleString('el-GR')} €

Αιτούμενη χρηματοδότηση:
- Ποσό: ${input.loanAmount.toLocaleString('el-GR')} €
- Κεφάλαιο κίνησης: ${input.workingCapitalAmount.toLocaleString('el-GR')} € (${workingCapitalPct}%)${activeCategories.length > 0 ? ` — κατηγορίες: ${activeCategories.join(', ')}` : ''}
- Πάγια: ${input.fixedAssetsAmount.toLocaleString('el-GR')} € (${fixedAssetsPct}%)${fixedAssetNames.length > 0 ? ` — είδη: ${fixedAssetNames.join(', ')}` : ''}

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

// ─── Deterministic sections (no AI — exact consultant-supplied figures) ────

// Section 2.1's Ε. Χρονοδιάγραμμα point — kept as a short, fixed sentence
// rather than AI-authored, which tended to add speculative claims the
// consultant didn't want (e.g. guessing when results would show up).
export function buildTimelineSentence(months: number): string {
  return `Ε. Χρονοδιάγραμμα\nΗ υλοποίηση της επένδυσης προβλέπεται να ολοκληρωθεί εντός ${months} μηνών από την εκταμίευση της χρηματοδότησης.`
}

function eur(n: number): string {
  return `${n.toLocaleString('el-GR')} €`
}

// Section 2.2 (ΠΙΝΑΚΑΣ ΔΑΠΑΝΩΝ) — a precise, bulleted breakdown by category
// instead of AI prose, so the euro figures are always exactly what the
// consultant entered. Returns one array entry per Word paragraph: a summary
// sentence, "ΛΕΙΤΟΥΡΓΙΚΑ ΕΞΟΔΑ (Χ%)" with its category bullets, "ΠΑΓΙΑ (Χ%)"
// with its itemized bullets (only if any fixed-asset amount is given), and a
// closing sentence.
export function buildExpenseBreakdownParagraphs(params: {
  loanAmount: number
  workingCapitalAmount: number
  fixedAssetsAmount: number
  breakdown: ExpenseBreakdown
  fixedAssetItems: FixedAssetItem[]
}): string[] {
  const { loanAmount, workingCapitalAmount, fixedAssetsAmount, breakdown, fixedAssetItems } = params
  const workingCapitalPct = loanAmount > 0 ? Math.round((workingCapitalAmount / loanAmount) * 100) : 0
  const fixedAssetsPct = loanAmount > 0 ? Math.round((fixedAssetsAmount / loanAmount) * 100) : 0

  const paragraphs: string[] = [
    `Ο συνολικός προϋπολογισμός της επένδυσης ανέρχεται σε ${eur(loanAmount)}, εκ των οποίων τα ${eur(workingCapitalAmount)} (${workingCapitalPct}%) αφορούν σε κεφάλαιο κίνησης και τα ${eur(fixedAssetsAmount)} (${fixedAssetsPct}%) σε πάγια.`,
    `Ο προϋπολογισμός κατανέμεται ως εξής:`,
  ]

  const categoryLabels: [keyof ExpenseBreakdown, string][] = [
    ['emporeumata', 'Εμπορεύματα'], ['analosima', 'Αναλώσιμα'], ['deko', 'ΔΕΚΟ'], ['enoikia', 'Ενοίκια'], ['loipa', 'Λοιπά λειτουργικά'],
  ]
  const activeCategoryLines = categoryLabels
    .filter(([key]) => (breakdown[key] || 0) > 0)
    .map(([key, label]) => `- ${label}: ${eur(breakdown[key])}`)
  if (activeCategoryLines.length > 0) {
    paragraphs.push([`ΛΕΙΤΟΥΡΓΙΚΑ ΕΞΟΔΑ (${workingCapitalPct}%)`, ...activeCategoryLines].join('\n'))
  }

  const fixedAssetLines = fixedAssetItems.filter(i => i.amount > 0).map(i => `- ${i.description}: ${eur(i.amount)}`)
  if (fixedAssetLines.length > 0) {
    paragraphs.push([`ΠΑΓΙΑ (${fixedAssetsPct}%)`, ...fixedAssetLines].join('\n'))
  }

  paragraphs.push('Στόχος της κατανομής αυτής είναι η ενίσχυση της ρευστότητας και η είσοδος της επιχείρησης σε νέες αγορές.')
  return paragraphs
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
// Shared by the initial send (questionnaire/route.ts) and the manual resend
// action (questionnaire/resend/route.ts) so the client always gets the exact
// same email regardless of which action triggered it.
export function buildQuestionnaireEmailHtml(params: { businessName: string; formUrl: string; logoHtml: string }): string {
  const { businessName, formUrl, logoHtml } = params
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
    <tr><td bgcolor="#1e3a8a" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
      ${logoHtml}
      <h1 style="color:#ffffff;margin:0;font-size:19px;">📋 Ερωτηματολόγιο Επιχειρηματικού Σχεδίου</h1>
    </td></tr>
    </table>
    <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 16px;font-size:15px;">Αγαπητέ/ή <strong>${businessName}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">
        Για να προχωρήσουμε με την αίτησή σας στο <strong>Ταμείο Μικροπιστώσεων (ΤΕΠΙΧ ΙΙΙ)</strong>, χρειαζόμαστε λίγες ακόμη πληροφορίες για την επιχείρησή σας. Παρακαλούμε απαντήστε <strong>πολύ επιγραμματικά</strong> στις παρακάτω ερωτήσεις, ώστε να προχωρήσουμε στη σύνταξη του επιχειρηματικού σχεδίου.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">
        Σε περίπτωση που υπάρχουν ερωτήματα στα οποία δεν είστε σε θέση να απαντήσετε αυτή τη στιγμή, μπορείτε απλώς να τα παραλείψετε και να στείλετε το υπόλοιπο ερωτηματολόγιο.
      </p>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="${formUrl}" style="display:inline-block;background:#1e3a8a;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">Συμπλήρωση Ερωτηματολογίου →</a>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;">Για οποιαδήποτε απορία, επικοινωνήστε μαζί μας.</p>
    </div>
  </div>`
}

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
