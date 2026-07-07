// Conversational eligibility + intake agent ("Ερμής") for the public
// business-facing match page (/match/[token]). Replaces the old stateless
// Ναι/Όχι questionnaire with a real per-turn LLM conversation: smart but
// laconic, scoped to one business+program, with one tool to hand the case
// off to case management once eligibility looks confirmed.
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { sendEmail } from './email'
import { notifyCaseManagement } from './case-management-sync'
import { EligibilityQuestion } from './eligibility-questions'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from './business-profile'

const MAX_RESPONSE_TOKENS = 1_000

// Hard per-conversation token budget (input+output, cumulative across turns)
// to prevent runaway/abusive Claude spend on a single business+program chat.
export const MAX_CONVERSATION_TOKENS = 100_000

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const IMENTOR_BASICS = `Η I-MENTOR είναι σύμβουλος επιχειρήσεων που υποστηρίζει ελληνικές επιχειρήσεις στην ένταξη και υλοβολή προγραμμάτων ΕΣΠΑ/ΔΥΠΑ: σύνταξη φακέλου υποβολής, παρακολούθηση της αίτησης, και υποστήριξη μέχρι την εκταμίευση. Η επιχείρηση συνήθως εξυπηρετείται μέσω του λογιστικού γραφείου της (αν έχει συνεργασία με την I-MENTOR) ή απευθείας από σύμβουλο της I-MENTOR.`

const TOOL_SCHEMA = {
  name: 'assign_case',
  description: 'Καλείται όταν έχεις κάνει τον βασικό έλεγχο επιλεξιμότητας και η επιχείρηση φαίνεται επιλέξιμη, ΚΑΙ είτε (α) έχει ζητήσει ξεκάθαρα να προχωρήσει/ενδιαφέρεται να αναλάβει η I-MENTOR την υπόθεση, είτε (β) έχεις ήδη ρωτήσει ΜΙΑ φορά διευκρινιστικά αν θέλει σύμβουλο και η απάντηση παραμένει ασαφής/ελλιπής — σε αυτή την περίπτωση κάλεσε το εργαλείο ΚΑΙ ΠΑΛΙ (μην αφήσεις τη συζήτηση χωρίς ανάθεση) αλλά συμπλήρωσε το πεδίο "pendingItem" με την ακριβή εκκρεμότητα.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Σύντομη περίληψη (1-2 προτάσεις, ελληνικά) της συνομιλίας: τι ελέγχθηκε, αν φαίνεται επιλέξιμη η επιχείρηση, οποιαδήποτε επιφύλαξη.' },
      pendingItem: { type: 'string', description: 'ΜΟΝΟ αν η συζήτηση δεν ολοκληρώθηκε στο 100% (π.χ. ο πελάτης δεν απάντησε ξεκάθαρα αν θέλει να τον καλέσει σύμβουλος, μετά από μία διευκρινιστική ερώτηση). Περιγραφή της ακριβής εκκρεμότητας, ελληνικά. Άδειο/απουσιάζει αν η συζήτηση ολοκληρώθηκε κανονικά.' },
    },
    required: ['summary'],
  },
}

function buildSystemPrompt(program: {
  title: string
  description: string | null
  category?: string
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  subsidyNote: string | null
  minInterestRate: number | null
  maxInterestRate: number | null
  otherRequirements: string | null
  pricingNote: string | null
  internalNotes: string | null
  ermisInstructions: string | null
}, businessName: string, autoConfirmedReasons: string[], qualitativeQuestions: EligibilityQuestion[],
  contextSummary?: string | null, consultant?: string | null) {
  const isLoan = program.category === 'MICROCREDITS'
  const amountLabel = isLoan ? 'Ύψος δανείου' : 'Επένδυση'
  // Prefer the admin-curated/approved checklist (per-question wording overrides,
  // skipped questions removed) over the raw "Άλλες Προϋποθέσεις" text — it's
  // what the admin actually wants Ερμής to ask, phrased for a conversation
  // instead of bureaucratic legalese.
  const qualitativeChecklist = qualitativeQuestions.length
    ? qualitativeQuestions.map(q => {
        if (q.type === 'number') {
          const range = q.min != null && q.max != null
            ? `πρέπει να είναι μεταξύ ${q.min}${q.unit || ''} και ${q.max}${q.unit || ''}`
            : q.min != null
            ? `πρέπει να είναι τουλάχιστον ${q.min}${q.unit || ''}`
            : q.max != null
            ? `πρέπει να είναι έως ${q.max}${q.unit || ''}`
            : ''
          return `- ${q.label}${range ? ` (${range})` : ''}`
        }
        return `- ${q.label}${q.expectedAnswer ? '' : ' (η αναμενόμενη/επιλέξιμη απάντηση είναι ΟΧΙ)'}`
      }).join('\n')
    : program.otherRequirements || '(καμία επιπλέον)'
  return `Είσαι ο "Ερμής", ο ψηφιακός σύμβουλος επιλεξιμότητας της I-MENTOR. Μιλάς απευθείας με τον ιδιοκτήτη της επιχείρησης "${businessName}" σχετικά με ΕΝΑ συγκεκριμένο πρόγραμμα. Μίλα φυσικά, στα ελληνικά, σαν να μιλάει κανείς με το Claude — αλλά ΕΞΥΠΝΑ ΚΑΙ ΛΑΚΩΝΙΚΑ: σύντομες απαντήσεις (1-4 προτάσεις συνήθως), ΧΩΡΙΣ πλατειασμό, χωρίς να επαναλαμβάνεις πράγματα που ήδη ειπώθηκαν.

ΓΙΑ ΤΗΝ I-MENTOR:
${IMENTOR_BASICS}

ΣΤΟΙΧΕΙΑ ΠΡΟΓΡΑΜΜΑΤΟΣ "${program.title}":
${program.description || '(χωρίς περιγραφή)'}
${program.minInvestment || program.maxInvestment ? `${amountLabel}: ${program.minInvestment ?? '?'}–${program.maxInvestment ?? '?'}€` : ''}
${program.minSubsidyPct || program.maxSubsidyPct ? `Ποσοστό επιχορήγησης: ${program.minSubsidyPct ?? '?'}–${program.maxSubsidyPct ?? '?'}%${program.subsidyNote ? ` (${program.subsidyNote})` : ''}` : ''}
${program.minInterestRate || program.maxInterestRate ? `Επιτόκιο: ${program.minInterestRate ?? '?'}–${program.maxInterestRate ?? '?'}%` : ''}
Λοιπές προϋποθέσεις/όροι (ρώτα ΜΙΑ-ΜΙΑ, σε φυσική γλώσσα, όχι σαν λίστα στον πελάτη):
${qualitativeChecklist}

${contextSummary ? `ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΜΗΝ ξαναρωτήσεις κανένα από αυτά — η απάντηση είναι ήδη γνωστή):
${contextSummary}

Κανόνας ερμηνείας: Αν κάποιο στοιχείο έχει απάντηση "Ναι" → το θεωρείς επιβεβαιωμένο και ΠΡΟΧΩΡΑΣ. Αν έχει απάντηση "Όχι" ή "Οχι" → ΜΗΝ ξαναρωτήσεις, αλλά ενημέρωσε τον πελάτη ότι αυτό το σημείο σημαίνει ότι δεν πληροί την προϋπόθεση — και συνέχισε με βάση αυτό (π.χ. αν είναι κρίσιμο κριτήριο, πες ότι δεν είναι επιλέξιμος).

` : ''}ΗΔΗ ΕΠΙΒΕΒΑΙΩΜΕΝΑ ΑΠΟ ΑΥΤΟΜΑΤΗ ΑΝΤΙΣΤΟΙΧΙΣΗ (ΜΗΝ τα ξαναρωτήσεις): ${autoConfirmedReasons.length ? autoConfirmedReasons.join('· ') : '(τίποτα ακόμη)'}

ΚΟΣΤΟΣ (ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ, πες το ΜΟΝΟ αν ρωτηθείς ή όταν είναι φυσικό στο τέλος): ${program.pricingNote || 'Δεν υπάρχει σταθερή τιμή για αυτό το πρόγραμμα· πες ότι το κόστος εξαρτάται από την υπηρεσία και ότι ο σύμβουλος θα δώσει ακριβή προσφορά.'}
${program.internalNotes ? `\nΕΠΙΠΛΕΟΝ ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ (πες την ΜΟΝΟ αν η επιχείρηση φαίνεται ΕΠΙΛΕΞΙΜΗ — ΠΟΤΕ αν δεν είναι, ή πριν ολοκληρωθεί ο έλεγχος επιλεξιμότητας): ${program.internalNotes}` : ''}
${program.ermisInstructions ? `\nΕΙΔΙΚΕΣ ΟΔΗΓΙΕΣ ΓΙΑ ΑΥΤΟ ΤΟ ΠΡΟΓΡΑΜΜΑ (τήρησέ τις αυστηρά, υπερισχύουν των γενικών οδηγιών παρακάτω όπου υπάρχει αντίφαση): ${program.ermisInstructions}` : ''}

ΣΚΟΠΟΣ ΣΟΥ, με αυτή σειρά:
1. Κάνε τον βασικό έλεγχο επιλεξιμότητας — ρώτα ΜΟΝΟ ό,τι λείπει από τα "ήδη επιβεβαιωμένα" και είναι κρίσιμο, ΜΙΑ ερώτηση τη φορά, όχι λίστα ερωτήσεων μαζί.
2. Ενημέρωσε περίπου για το κόστος όταν ζητηθεί ή αφού κλείσει ο έλεγχος επιλεξιμότητας.
3. Αν η επιχείρηση φαίνεται επιλέξιμη ΚΑΙ θέλει να προχωρήσει, κάλεσε το εργαλείο "assign_case" για να αναλάβει σύμβουλος της I-MENTOR την υπόθεση. Μην το καλέσεις πρόωρα, πριν κάνεις τον βασικό έλεγχο.
4. Αν δεν φαίνεται επιλέξιμη, πες το ευθέως και ευγενικά, χωρίς να καλέσεις το εργαλείο.
5. Αν η επιχείρηση φαίνεται επιλέξιμη αλλά η απάντηση του πελάτη στο "θέλετε σύμβουλο;" είναι ασαφής, μη δεσμευτική, ή λείπει (π.χ. άλλαξε θέμα, απάντησε "δεν ξέρω", δεν απάντησε καθόλου): ΜΗΝ καλέσεις αμέσως το εργαλείο και ΜΗΝ αφήσεις τη συζήτηση να "κρεμαστεί" χωρίς ανάθεση. Κάνε ΠΡΩΤΑ ΜΙΑ ξεκάθαρη διευκρινιστική ερώτηση (π.χ. "Θέλετε να επικοινωνήσει μαζί σας σύμβουλος της I-MENTOR για να προχωρήσουμε;"). Αν και μετά από αυτή η απάντηση παραμείνει ασαφής/ελλιπής, κάλεσε ΚΑΙ ΠΑΛΙ το εργαλείο "assign_case" (μην το παραλείψεις) συμπληρώνοντας το πεδίο "pendingItem" με τη συγκεκριμένη εκκρεμότητα (π.χ. "Η επιχείρηση φαίνεται επιλέξιμη και ενημερώθηκε για το κόστος, αλλά δεν απάντησε ξεκάθαρα αν θέλει να την καλέσει σύμβουλος").

ΠΑΡΕ ΕΣΥ ΤΟΝ ΕΛΕΓΧΟ της συνομιλίας: ΜΗΝ ρωτήσεις ποτέ τον πελάτη "τι θέλεις να μάθεις" ή κάτι αντίστοιχο ανοιχτό.

ΔΟΜΗ ΑΝΟΙΓΜΑΤΟΣ (ακολούθησέ την πάντα, σε αυτή τη σειρά):
1. **Χαιρετισμός** — σύντομος και φιλικός (π.χ. "Γεια σας! Είμαι ο Ερμής, ο ψηφιακός σύμβουλος της I-MENTOR.").
2. **Παρουσίαση προγράμματος** — 1 πρόταση: το βασικό οικονομικό χαρακτηριστικό (επιτόκιο ή ποσοστό επιχορήγησης) μαζί με το ύψος ${isLoan ? 'δανείου' : 'επένδυσης/προϋπολογισμού'}.
3. **Ενημέρωση για ό,τι ήδη γνωρίζουμε** — πες ευθέως στον πελάτη τι έχει ήδη ελεγχθεί/επιβεβαιωθεί, ώστε να νιώθει ότι δεν ξεκινάμε από το μηδέν. Συγκεκριμένα:
   - Αν υπάρχουν επιβεβαιωμένα από αυτόματη αντιστοίχιση (π.χ. ΚΑΔ, Περιφέρεια, Ημερομηνία έναρξης): ανέφερέ τα ρητά ως "έχουμε ήδη ελέγξει και ✓".
   - Αν υπάρχουν γνωστά στοιχεία από τον σύμβουλο (contextSummary): ανέφερε τα πεδία με "Ναι"/"Όχι" που ήδη γνωρίζουμε, π.χ. "Γνωρίζουμε ήδη ότι: ΑΣΦ & ΦΟΡ ΕΝΗΜ: Ναι, ΚΕΡΔΟΦΟΡΙΑ: Ναι" — χωρίς να τα ξαναρωτήσεις.
   - Κράτα αυτό το μέρος σύντομο (2-4 γραμμές max) και θετικό.
4. **Επόμενο βήμα** — αμέσως μετά, ρώτα ΜΙΑ συγκεκριμένη ερώτηση που λείπει για τον έλεγχο επιλεξιμότητας.

Εσύ οδηγείς τη συζήτηση βήμα-βήμα μέχρι να καταλήξεις σε συμπέρασμα.

${isLoan ? 'ΣΗΜΑΝΤΙΚΟ: Αυτό το πρόγραμμα είναι ΔΑΝΕΙΟ, όχι επιχορήγηση επένδυσης — μίλα πάντα για "ύψος δανείου", ποτέ για "ύψος επένδυσης".' : ''}

Μην επαναλαμβάνεις τη λέξη "επιλέξιμος/επιλέξιμη" μπροστά από κάθε κριτήριο όταν παραθέτεις τα "ήδη επιβεβαιωμένα" (π.χ. γράψε "ΚΑΔ: ..., Περιφέρεια: ..." όχι "Επιλέξιμος ΚΑΔ: ..., Επιλέξιμη περιφέρεια: ...") — η λέξη "επιλέξιμος" χρησιμοποιείται μόνο για το τελικό συμπέρασμα.

Χρησιμοποίησε **διπλά αστερίσκια** γύρω από λέξεις/φράσεις που θέλεις να εμφανίζονται έντονα (bold) στον πελάτη — π.χ. αριθμούς, ΚΑΔ, ποσά, "επιλέξιμος"/"μη επιλέξιμος". Το frontend τα μετατρέπει αυτόματα σε έντονη γραφή.

ΑΝΑΦΟΡΑ ΣΕ ΣΥΜΒΟΥΛΟ:
- Αν η επιχείρηση είναι ΕΠΙΛΕΞΙΜΗ και ο πελάτης θέλει να προχωρήσει: αφού καλέσεις το εργαλείο assign_case, ενημέρωσε τον πελάτη ότι ${consultant ? `ο/η **${consultant}** από την I-MENTOR θα επικοινωνήσει σύντομα μαζί του/της` : '**ένας σύμβουλος της I-MENTOR** θα επικοινωνήσει σύντομα μαζί του/της'}.
- Αν η επιχείρηση ΔΕΝ είναι επιλέξιμη: πες το ευθέως και ευγενικά — ΜΗΝ αναφέρεις σύμβουλο ή επικοινωνία, μην δημιουργείς εσφαλμένες προσδοκίες.

ΩΡΑΡΙΟ ΕΞΥΠΗΡΕΤΗΣΗΣ:
Οι σύμβουλοι της I-MENTOR είναι διαθέσιμοι **Δευτέρα έως Παρασκευή, 08:00–16:30**. Αν ο πελάτης ζητήσει επικοινωνία εκτός αυτών των ωρών (απόγευμα μετά τις 16:30, Σαββατοκύριακο ή αργία), ενημέρωσέ τον ευγενικά ότι η επικοινωνία γίνεται εντός ωραρίου και ότι θα επικοινωνήσουμε μαζί του την επόμενη εργάσιμη μέρα.

Μην κάνεις ποτέ νομικές δεσμευτικές διαβεβαιώσεις — η τελική έγκριση είναι πάντα του φορέα διαχείρισης του προγράμματος.`
}

async function createPublicClientCase(params: {
  businessId: string
  programId: string
  programTitle: string
  businessName: string
  summary: string
  pendingItem?: string | null
}) {
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { accountantId: true, phone: true, email: true, ...BUSINESS_PROFILE_SELECT },
  })
  if (!business) throw new Error('Δεν βρέθηκε η επιχείρηση')
  const profile = await buildBusinessProfilePayload(business)

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  if (!adminUser) throw new Error('Δεν βρέθηκε χρήστης ADMIN για createdById')

  const pendingNote = params.pendingItem?.trim()
    ? `\n\n⚠️ Η συζήτηση με τον Ερμή ΔΕΝ ολοκληρώθηκε στο 100%. Εκκρεμότητα: ${params.pendingItem.trim()}`
    : ''
  const description = `${params.summary}${pendingNote}`

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId: business.accountantId || null,
      businessId: params.businessId,
      programId: params.programId,
      requestType: 'APPLICATION_SUPPORT',
      title: `${business.onomasia || business.afm} — ${params.programTitle}`,
      description,
      priority: 'NORMAL',
      status: 'NEW',
      createdById: adminUser.id,
      activities: {
        create: {
          type: 'CREATED',
          body: `Η υπόθεση δημιουργήθηκε αυτόματα από τον Ερμής (chat): ${description}`,
          authorId: adminUser.id,
          authorName: 'Ερμής (AI)',
          authorRole: 'ADMIN',
        },
      },
    },
    include: { accountant: { select: { officeName: true } } },
  })

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `${pendingNote ? '⚠️' : '🗂️'} Νέα Υπόθεση #${clientCase.caseNumber} από Ερμής — ${business.onomasia || business.afm}`,
      html: `<p>Ο Ερμής δημιούργησε νέα υπόθεση μετά από συνομιλία με τον πελάτη <strong>${business.onomasia || business.afm}</strong> για το πρόγραμμα <strong>${params.programTitle}</strong>:</p>
        <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${params.summary}</blockquote>
        ${pendingNote ? `<p style="color:#b45309"><strong>⚠️ Δεν ολοκληρώθηκε στο 100%:</strong> ${params.pendingItem!.trim()}</p>` : ''}
        <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${clientCase.id}">Δείτε την υπόθεση →</a></p>`,
    })
  } catch {}

  const webhookUrl = process.env.CASE_MGMT_WEBHOOK_URL
  const webhookKey = process.env.CASES_API_KEY
  console.log(`[ErmisCase] case #${clientCase.caseNumber} created. CASE_MGMT_WEBHOOK_URL=${webhookUrl ? 'set' : 'MISSING'} CASES_API_KEY=${webhookKey ? 'set' : 'MISSING'}`)
  notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: clientCase.caseType,
    description: clientCase.description,
    priority: clientCase.priority,
    programTitle: params.programTitle,
    ...profile,
  }).catch(err => console.error('[CaseManagement] notify failed:', err?.message))

  return clientCase.id
}

export async function runErmisTurn(params: {
  businessId: string
  programId: string
  businessName: string
  program: {
    title: string
    description: string | null
    category?: string
    minInvestment: number | null
    maxInvestment: number | null
    minSubsidyPct: number | null
    maxSubsidyPct: number | null
    subsidyNote: string | null
    minInterestRate: number | null
    maxInterestRate: number | null
    otherRequirements: string | null
    pricingNote: string | null
    internalNotes: string | null
    ermisInstructions: string | null
  }
  autoConfirmedReasons: string[]
  qualitativeQuestions?: EligibilityQuestion[]
  history: ChatMessage[]
  alreadyAssigned: boolean
  // True only for the very first turn of a conversation, before the customer has
  // said anything: asks Ερμής to open the conversation itself (lead with what it
  // already knows + the first missing question) instead of waiting to be asked.
  isKickoff?: boolean
  tokensUsedSoFar: number
  // CM-provided context: pre-known lead facts and assigned consultant name
  contextSummary?: string | null
  consultant?: string | null
}): Promise<{ reply: string; caseId: string | null; tokensUsed: number; tokensUsedInput: number; tokensUsedOutput: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  if (params.tokensUsedSoFar >= MAX_CONVERSATION_TOKENS) {
    return {
      reply: 'Έχουμε φτάσει στο όριο αυτής της συζήτησης. Επικοινωνήστε απευθείας με την I-MENTOR (info@i-mentor.gr) για να συνεχίσουμε τον έλεγχο επιλεξιμότητάς σας.',
      caseId: null,
      tokensUsed: 0,
      tokensUsedInput: 0,
      tokensUsedOutput: 0,
    }
  }

  const anthropic = new Anthropic({ apiKey })
  const system = buildSystemPrompt(params.program, params.businessName, params.autoConfirmedReasons, params.qualitativeQuestions || [], params.contextSummary, params.consultant)

  const messages: Anthropic.MessageParam[] = params.isKickoff
    ? [{ role: 'user', content: 'Ξεκίνα εσύ τη συνομιλία.' }]
    : params.history.map(m => ({ role: m.role, content: m.text }))

  const tools = params.alreadyAssigned ? undefined : [TOOL_SCHEMA]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: MAX_RESPONSE_TOKENS,
    system,
    ...(tools ? { tools, tool_choice: { type: 'auto' } } : {}),
    messages,
  })

  let tokensUsedInput = response.usage?.input_tokens || 0
  let tokensUsedOutput = response.usage?.output_tokens || 0

  const toolUse = response.content.find(b => b.type === 'tool_use')
  let caseId: string | null = null

  if (toolUse && toolUse.type === 'tool_use' && toolUse.name === 'assign_case') {
    const summary = String((toolUse.input as any)?.summary || 'Ο πελάτης φαίνεται επιλέξιμος.')
    const pendingItem = (toolUse.input as any)?.pendingItem ? String((toolUse.input as any).pendingItem) : null
    caseId = await createPublicClientCase({
      businessId: params.businessId,
      programId: params.programId,
      programTitle: params.program.title,
      businessName: params.businessName,
      summary,
      pendingItem,
    })

    const followUp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: MAX_RESPONSE_TOKENS,
      system,
      messages: [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Η υπόθεση καταχωρήθηκε επιτυχώς στο case management.',
          }],
        },
      ],
    })
    tokensUsedInput += followUp.usage?.input_tokens || 0
    tokensUsedOutput += followUp.usage?.output_tokens || 0
    const text = followUp.content.find(b => b.type === 'text')
    return {
      reply: text && text.type === 'text' ? text.text : `Η υπόθεσή σας καταχωρήθηκε — ${params.consultant ? `ο/η **${params.consultant}** από την I-MENTOR` : 'ένας σύμβουλος της I-MENTOR'} θα επικοινωνήσει μαζί σας σύντομα.`,
      caseId,
      tokensUsed: tokensUsedInput + tokensUsedOutput,
      tokensUsedInput,
      tokensUsedOutput,
    }
  }

  const text = response.content.find(b => b.type === 'text')
  return {
    reply: text && text.type === 'text' ? text.text : 'Μπορείτε να επαναλάβετε;',
    caseId: null,
    tokensUsed: tokensUsedInput + tokensUsedOutput,
    tokensUsedInput,
    tokensUsedOutput,
  }
}

export interface ConversationClassification {
  eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNCLEAR'
  intent: 'INTERESTED' | 'NOT_INTERESTED' | 'UNCLEAR'
}

const CLASSIFY_TOOL_SCHEMA = {
  name: 'record_classification',
  description: 'Καταγράφει μια σύντομη ταξινόμηση της μέχρι τώρα συζήτησης.',
  input_schema: {
    type: 'object' as const,
    properties: {
      eligibility: { type: 'string', enum: ['ELIGIBLE', 'NOT_ELIGIBLE', 'UNCLEAR'], description: 'Φαίνεται επιλέξιμη η επιχείρηση με βάση όσα ειπώθηκαν μέχρι τώρα; UNCLEAR αν δεν έχει ολοκληρωθεί ο έλεγχος.' },
      intent: { type: 'string', enum: ['INTERESTED', 'NOT_INTERESTED', 'UNCLEAR'], description: 'Έχει εκφράσει ξεκάθαρα ο πελάτης ότι θέλει να προχωρήσει/συνεργαστεί με την I-MENTOR για το πρόγραμμα αυτό; UNCLEAR αν δεν έχει διευκρινιστεί.' },
    },
    required: ['eligibility', 'intent'],
  },
}

// Cheap, best-effort classification of a conversation's eligibility/intent
// signal, run after each turn so the Ερμής transcripts list can show it
// without re-reading/re-summarizing the whole chat at list time. Failures
// are swallowed by the caller — this is a nice-to-have, not load-bearing.
export async function classifyConversation(history: ChatMessage[], programTitle: string): Promise<ConversationClassification | null> {
  if (!history.length) return null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const anthropic = new Anthropic({ apiKey })
  const transcript = history.map(m => `${m.role === 'user' ? 'ΠΕΛΑΤΗΣ' : 'ΕΡΜΗΣ'}: ${m.text}`).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: `Διαβάζεις μια συνομιλία ανάμεσα σε ψηφιακό σύμβουλο επιλεξιμότητας ("Ερμής") και πελάτη, σχετικά με το πρόγραμμα "${programTitle}". Κάλεσε το εργαλείο "record_classification" με τη σύντομη αξιολόγησή σου.`,
    tools: [CLASSIFY_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'record_classification' },
    messages: [{ role: 'user', content: transcript }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return null
  const input = toolUse.input as any
  return {
    eligibility: input?.eligibility || 'UNCLEAR',
    intent: input?.intent || 'UNCLEAR',
  }
}
