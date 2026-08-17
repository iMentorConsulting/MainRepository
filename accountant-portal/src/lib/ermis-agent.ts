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
import { resolveRegdate } from './matching'

// Human-readable label for a regdate value — resolves sentinels like "TODAY-1Y"
// to a string like "Τουλάχιστον 1 έτος λειτουργίας (έως 12/08/2025)".
function _regdateLabel(value: string): string {
  const m = value.match(/^TODAY-(\d+)Y$/i)
  if (m) {
    const n = parseInt(m[1])
    const cutoff = resolveRegdate(value)!
    const cutoffStr = cutoff.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `Τουλάχιστον ${n} ${n === 1 ? 'έτος' : 'έτη'} λειτουργίας (δηλ. έναρξη έως ${cutoffStr})`
  }
  return value
}

const MAX_RESPONSE_TOKENS = 1_000

// Hard per-conversation token budget (input+output, cumulative across turns)
// to prevent runaway/abusive Claude spend on a single business+program chat.
export const MAX_CONVERSATION_TOKENS = 200_000

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
  minRegdate?: string | null
  maxRegdate?: string | null
  requiredDocuments?: { name: string; category: string; instructions: string | null }[]
}, businessName: string, autoConfirmedReasons: string[], qualitativeQuestions: EligibilityQuestion[],
  contextSummary?: string | null, consultant?: string | null, legalStatusDescr?: string | null,
  businessRegdate?: string | null) {
  const isLoan = program.category === 'MICROCREDITS'
  const amountLabel = isLoan ? 'Ύψος δανείου' : 'Επένδυση'
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentDateStr = now.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  // Prefer the admin-curated/approved checklist (per-question wording overrides,
  // skipped questions removed) over the raw "Άλλες Προϋποθέσεις" text — it's
  // what the admin actually wants Ερμής to ask, phrased for a conversation
  // instead of bureaucratic legalese.
  const qualitativeQuestionCount = qualitativeQuestions.length
  const qualitativeChecklist = qualitativeQuestions.length
    ? qualitativeQuestions.map((q, idx) => {
        if (q.type === 'number') {
          const range = q.min != null && q.max != null
            ? `πρέπει να είναι μεταξύ ${q.min}${q.unit || ''} και ${q.max}${q.unit || ''}`
            : q.min != null
            ? `πρέπει να είναι τουλάχιστον ${q.min}${q.unit || ''}`
            : q.max != null
            ? `πρέπει να είναι έως ${q.max}${q.unit || ''}`
            : ''
          return `${idx + 1}. ${q.label}${range ? ` (${range})` : ''}`
        }
        return `${idx + 1}. ${q.label}${q.expectedAnswer ? '' : ' (η αναμενόμενη/επιλέξιμη απάντηση είναι ΟΧΙ)'}`
      }).join('\n')
    : program.otherRequirements || '(καμία επιπλέον)'
  const legalFormLine = legalStatusDescr
    ? `ΝΟΜΙΚΗ ΜΟΡΦΗ ΕΠΙΧΕΙΡΗΣΗΣ: **${legalStatusDescr}**\nΑν κάποιο έγγραφο ή οδηγία έχει διαφορετική έκδοση για "ατομική επιχείρηση" έναντι "νομικού προσώπου" (ΟΕ/ΕΕ/ΙΚΕ/ΑΕ/ΕΠΕ κ.λπ.), χρησιμοποίησε ΑΠΟΚΛΕΙΣΤΙΚΑ την έκδοση που αντιστοιχεί στη νομική μορφή αυτής της επιχείρησης — ΜΗΝ παρουσιάζεις και τις δύο εκδόσεις.`
    : ''

  // Build the regdate instruction line, resolving any relative sentinel (e.g. "TODAY-1Y")
  // to a human-readable requirement plus a concrete cutoff date in parentheses.
  let regdateLine = ''
  let nearEligibleNote = ''
  if (program.minRegdate || program.maxRegdate) {
    const minLabel = program.minRegdate ? _regdateLabel(program.minRegdate) : null
    const maxLabel = program.maxRegdate ? _regdateLabel(program.maxRegdate) : null
    const fromPart = minLabel ? `από ${minLabel}` : ''
    const toPart = maxLabel ? `έως ${maxLabel}` : ''
    regdateLine = `ΚΡΙΣΙΜΟ ΚΡΙΤΗΡΙΟ — Ημερομηνία έναρξης επιχείρησης: ${[fromPart, toPart].filter(Boolean).join(' ')}. Αν η έναρξη της επιχείρησης είναι εκτός αυτού του ορίου, η επιχείρηση ΔΕΝ είναι επιλέξιμη.`

    // For ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ with a relative maxRegdate: if the business's start date is
    // known and the business is not yet eligible but will be soon, do NOT reject — instead
    // tell the client when they'll qualify and whether to start preparations now.
    if (isLoan && program.maxRegdate && businessRegdate) {
      const relMatch = program.maxRegdate.match(/^TODAY-(\d+)Y$/i)
      if (relMatch) {
        const yearsRequired = parseInt(relMatch[1])
        const bizStart = new Date(businessRegdate)
        const resolvedMax = new Date()
        resolvedMax.setFullYear(resolvedMax.getFullYear() - yearsRequired)
        if (bizStart > resolvedMax) {
          // Business started too recently — compute exact eligibility date
          const eligibleAt = new Date(bizStart)
          eligibleAt.setFullYear(eligibleAt.getFullYear() + yearsRequired)
          const msUntil = eligibleAt.getTime() - now.getTime()
          const monthsUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24 * 30.44))
          const eligibleStr = eligibleAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          if (monthsUntil <= 2) {
            nearEligibleNote = `\nΕΙΔΙΚΗ ΟΔΗΓΙΑ ΓΙΑ ΑΥΤΗ ΤΗΝ ΕΠΙΧΕΙΡΗΣΗ — ΜΗΝ αρνηθείς: Η επιχείρηση δεν έχει συμπληρώσει ακόμα ${yearsRequired} χρόνο/α λειτουργίας, ΑΛΛΑ θα γίνει επιλέξιμη στις ${eligibleStr} (~${monthsUntil} μήνας/ες). Ενημέρωσέ την ευγενικά ότι μπορούμε να ξεκινήσουμε τις προετοιμασίες τώρα (συγκέντρωση δικαιολογητικών, φάκελος) και να υποβάλουμε μόλις συμπληρωθεί ο ένας χρόνος. Κάλεσε το εργαλείο assign_case για να αναλάβει σύμβουλος.`
          } else {
            nearEligibleNote = `\nΕΙΔΙΚΗ ΟΔΗΓΙΑ ΓΙΑ ΑΥΤΗ ΤΗΝ ΕΠΙΧΕΙΡΗΣΗ: Η επιχείρηση δεν έχει ακόμα συμπληρώσει ${yearsRequired} χρόνο/α λειτουργίας. Θα γίνει επιλέξιμη στις ${eligibleStr} (~${monthsUntil} μήνες). Ενημέρωσέ την ευγενικά να επιστρέψει τότε — μην αναλάβεις υπόθεση τώρα.`
          }
        }
      }
    }
  }

  return `Είσαι ο "Ερμής", ο ψηφιακός σύμβουλος επιλεξιμότητας της I-MENTOR. Μιλάς απευθείας με τον ιδιοκτήτη της επιχείρησης "${businessName}" σχετικά με ΕΝΑ συγκεκριμένο πρόγραμμα. Μίλα φυσικά, στα ελληνικά, σαν να μιλάει κανείς με το Claude — αλλά ΕΞΥΠΝΑ ΚΑΙ ΛΑΚΩΝΙΚΑ: σύντομες απαντήσεις (1-4 προτάσεις συνήθως), ΧΩΡΙΣ πλατειασμό, χωρίς να επαναλαμβάνεις πράγματα που ήδη ειπώθηκαν.

ΣΗΜΕΡΙΝΗ ΗΜΕΡΟΜΗΝΙΑ: ${currentDateStr} (τρέχον έτος: ${currentYear}). Χρησιμοποίησέ την για οποιονδήποτε υπολογισμό χρόνων/χρήσεων — π.χ. "κλεισμένες χρήσεις" = πλήρη ημερολογιακά έτη που έχουν λήξει πριν το ${currentYear} (δηλ. έως και ${currentYear - 1}).

ΓΙΑ ΤΗΝ I-MENTOR:
${IMENTOR_BASICS}
${legalFormLine ? `\n${legalFormLine}\n` : ''}
ΣΤΟΙΧΕΙΑ ΠΡΟΓΡΑΜΜΑΤΟΣ "${program.title}":
${program.description || '(χωρίς περιγραφή)'}
${program.minInvestment || program.maxInvestment ? `${amountLabel}: ${program.minInvestment ?? '?'}–${program.maxInvestment ?? '?'}€` : ''}
${program.minSubsidyPct || program.maxSubsidyPct ? `Ποσοστό επιχορήγησης: ${program.minSubsidyPct ?? '?'}–${program.maxSubsidyPct ?? '?'}%${program.subsidyNote ? ` (${program.subsidyNote})` : ''}` : ''}
${program.minInterestRate || program.maxInterestRate ? `Επιτόκιο: ${program.minInterestRate ?? '?'}–${program.maxInterestRate ?? '?'}%` : ''}
${regdateLine}${nearEligibleNote}
Λοιπές προϋποθέσεις/όροι — ΥΠΟΧΡΕΩΤΙΚΗ ΛΙΣΤΑ: πρέπει να ρωτήσεις ΚΑΘΕ ΜΙΑ από τις παρακάτω ${qualitativeQuestionCount > 0 ? `(${qualitativeQuestionCount} ερωτήσεις συνολικά)` : ''}, ΜΙΑ τη φορά, σε φυσική γλώσσα, ΜΕ ΤΗΝ ΠΑΡΑΠΑΝΩ ΣΕΙΡΑ:
${qualitativeChecklist}

${contextSummary ? `ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (ΜΗΝ ξαναρωτήσεις κανένα από αυτά — η απάντηση είναι ήδη γνωστή):
${contextSummary}

Κανόνας ερμηνείας: Αν κάποιο στοιχείο έχει απάντηση "Ναι" → το θεωρείς επιβεβαιωμένο/ΟΚ και ΠΡΟΧΩΡΑΣ. Αν έχει απάντηση "Όχι" ή "Οχι" → ΜΗΝ ξαναρωτήσεις, αλλά ενημέρωσε τον πελάτη ότι αυτό το σημείο σημαίνει ότι δεν πληροί την προϋπόθεση — και συνέχισε με βάση αυτό (π.χ. αν είναι κρίσιμο κριτήριο, πες ότι δεν είναι επιλέξιμος).
ΕΙΔΙΚΗ ΠΕΡΙΠΤΩΣΗ — πεδία τύπου "ΤΕΙΡΕΣΙΑΣ & ΤΡΑΠΕΖΕΣ" / "ΑΣΦ & ΦΟΡ ΕΝΗΜ" / "ΚΕΡΔΟΦΟΡΙΑ": Το "Ναι" σε αυτά σημαίνει "καθαρό/ενήμερο" (θετικό για επιλεξιμότητα). Το "Όχι" σημαίνει "πρόβλημα" (ο πελάτης δεν πληροί αυτή την προϋπόθεση). Μην αντιστρέψεις τη σημασία. Αν στα ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ δεν αναφέρεται ρητά κάποιο από αυτά τα πεδία, ΜΗΝ το αναφέρεις ή υποθέτεις ότι είναι ΟΚ — άγνωστο σημαίνει ότι πρέπει να ρωτηθεί.

` : ''}ΗΔΗ ΕΠΙΒΕΒΑΙΩΜΕΝΑ ΑΠΟ ΑΥΤΟΜΑΤΗ ΑΝΤΙΣΤΟΙΧΙΣΗ (ΜΗΝ τα ξαναρωτήσεις): ${autoConfirmedReasons.length ? autoConfirmedReasons.join('· ') : '(τίποτα ακόμη)'}
ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ: Αν ο ΚΑΔ της επιχείρησης αναφέρεται παραπάνω ως "επιλέξιμος", αυτό είναι ΟΡΙΣΤΙΚΟ και δεν αμφισβητείται. ΜΗΝ αξιολογείς εκ νέου τον ΚΑΔ με βάση την περιγραφή τομέων στο κείμενο του προγράμματος — ο αυτόματος έλεγχος έχει ήδη επαληθεύσει τον ΚΑΔ έναντι της πλήρους λίστας επιλέξιμων ΚΑΔ του προγράμματος και είναι αξιόπιστος. Η κειμενική περιγραφή τομέων (π.χ. "τουρισμός, αγροδιατροφή") είναι ενδεικτική και ΔΕΝ υπερισχύει της επίσημης λίστας ΚΑΔ.

ΚΟΣΤΟΣ (ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ): ${program.pricingNote || 'Δεν υπάρχει σταθερή τιμή για αυτό το πρόγραμμα· πες ότι το κόστος εξαρτάται από την υπηρεσία και ότι ο σύμβουλος θα δώσει ακριβή προσφορά.'}
ΚΡΙΣΙΜΟ: Το κόστος ΠΡΕΠΕΙ να αναφερθεί ΠΑΝΤΑ ΠΡΙΝ ρωτήσεις τον πελάτη αν θέλει να προχωρήσει με σύμβουλο — ακόμα κι αν δεν το ζητήσει. Αν ο πελάτης ρωτήσει για το κόστος νωρίτερα, απάντησέ του αμέσως. ΜΗΝ καλέσεις ποτέ το "assign_case" χωρίς πρώτα να έχεις αναφέρει το κόστος στη συνομιλία.
${program.internalNotes ? `\nΕΠΙΠΛΕΟΝ ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ (πες την ΜΟΝΟ αν η επιχείρηση φαίνεται ΕΠΙΛΕΞΙΜΗ — ΠΟΤΕ αν δεν είναι, ή πριν ολοκληρωθεί ο έλεγχος επιλεξιμότητας): ${program.internalNotes}` : ''}
${program.ermisInstructions ? `\nΕΙΔΙΚΕΣ ΟΔΗΓΙΕΣ ΓΙΑ ΑΥΤΟ ΤΟ ΠΡΟΓΡΑΜΜΑ (τήρησέ τις αυστηρά, υπερισχύουν των γενικών οδηγιών παρακάτω όπου υπάρχει αντίφαση): ${program.ermisInstructions}` : ''}

ΣΚΟΠΟΣ ΣΟΥ, με αυτή σειρά:
0. ΠΡΙΝ ΑΠΟ ΟΛΑ — ΕΛΕΓΧΟΣ ΑΠΟΚΛΕΙΣΜΟΥ: Αν από τα ΗΔΗ ΓΝΩΣΤΑ στοιχεία (γνωστά στοιχεία πελάτη, ημερομηνία έναρξης, όρια προγράμματος) προκύπτει ότι παραβιάζεται ΚΡΙΣΙΜΟ κριτήριο του προγράμματος, ενημέρωσε τον πελάτη ΑΜΕΣΩΣ, από το ΠΡΩΤΟ σου μήνυμα, ευθέως και ευγενικά ότι **δεν είναι επιλέξιμος** και εξήγησε ποιο κριτήριο δεν πληροίται — ΜΗΝ κάνεις ΚΑΜΙΑ από τις υπόλοιπες ερωτήσεις (είναι άσκοπες και κουράζουν τον πελάτη). Το ίδιο ισχύει και στη διάρκεια της συζήτησης: μόλις ΟΠΟΙΑΔΗΠΟΤΕ απάντηση του πελάτη αποτύχει σε κρίσιμο κριτήριο, σταμάτα εκεί τον έλεγχο και πες το συμπέρασμα — μην συνεχίσεις τις υπόλοιπες ερωτήσεις.
1. Κάνε τον πλήρη έλεγχο επιλεξιμότητας — ρώτα ΚΑΘΕ ΜΙΑ ερώτηση από τη λίστα "Λοιπές προϋποθέσεις/όροι" που δεν έχει ήδη απαντηθεί, ΜΙΑ τη φορά, με τη σειρά. ΔΕΝ μπορείς να παραλείψεις καμία. ΔΕΝ μπορείς να αποφανθείς "επιλέξιμος" μέχρι να ρωτήσεις ΟΛΕΣ. ΜΗΝ χαρακτηρίσεις ποτέ κάποια ερώτηση ως "τελευταία" εκτός αν έχεις ήδη ρωτήσει όλες τις προηγούμενες.
2. Αφού ολοκληρωθεί ο έλεγχος επιλεξιμότητας και η επιχείρηση φαίνεται επιλέξιμη, ανακοίνωσε το αποτέλεσμα και ΑΜΕΣΩΣ μετά ανέφερε το κόστος (ακόμα κι αν δεν ρωτηθείς). Μόνο αφού ενημερώσεις για το κόστος, ρώτα αν θέλει να προχωρήσει.
3. Αν η επιχείρηση φαίνεται επιλέξιμη ΚΑΙ θέλει να προχωρήσει ΚΑΙ έχεις ήδη αναφέρει το κόστος, κάλεσε το εργαλείο "assign_case" για να αναλάβει σύμβουλος της I-MENTOR την υπόθεση. Μην το καλέσεις πρόωρα, πριν κάνεις τον βασικό έλεγχο και πριν αναφέρεις το κόστος.
4. Αν δεν φαίνεται επιλέξιμη, πες το ευθέως και ευγενικά, χωρίς να καλέσεις το εργαλείο.
5. Αν η επιχείρηση φαίνεται επιλέξιμη αλλά ο πελάτης αρνηθεί ξεκάθαρα να προχωρήσει (π.χ. "Όχι", "Όχι ακόμη", "Δεν θέλω αυτή τη στιγμή", "Ευχαριστώ αλλά όχι" ή οποιαδήποτε σαφής άρνηση): ΜΗΝ καλέσεις το εργαλείο "assign_case" — ο πελάτης έχει αρνηθεί και δεν θέλει επαφή. Αντ' αυτού, ευχαρίστησέ τον ευγενικά, δώσε τα στοιχεία επικοινωνίας μας ώστε να μπορεί να επιστρέψει όταν θέλει, και αποχαιρέτησέ τον. Τα στοιχεία επικοινωνίας: **www.i-mentor.gr** | **info@i-mentor.gr** | **2810363007**. Παράδειγμα αποχαιρετισμού: "Κατανοητό! Αν αλλάξετε γνώμη ή θέλετε περισσότερες πληροφορίες, μπορείτε να επικοινωνήσετε μαζί μας στο **info@i-mentor.gr**, **2810363007** ή **www.i-mentor.gr**. Σας ευχαριστούμε και καλή συνέχεια! 😊"
6. Αν η επιχείρηση φαίνεται επιλέξιμη αλλά η απάντηση του πελάτη στο "θέλετε σύμβουλο;" είναι ασαφής, μη δεσμευτική, ή λείπει (π.χ. άλλαξε θέμα, απάντησε "δεν ξέρω", δεν απάντησε καθόλου): ΜΗΝ καλέσεις αμέσως το εργαλείο και ΜΗΝ αφήσεις τη συζήτηση να "κρεμαστεί" χωρίς ανάθεση. Κάνε ΠΡΩΤΑ ΜΙΑ ξεκάθαρη διευκρινιστική ερώτηση (π.χ. "Θέλετε να επικοινωνήσει μαζί σας σύμβουλος της I-MENTOR για να προχωρήσουμε;"). Αν και μετά από αυτή η απάντηση παραμείνει ασαφής/ελλιπής, κάλεσε ΚΑΙ ΠΑΛΙ το εργαλείο "assign_case" (μην το παραλείψεις) συμπληρώνοντας το πεδίο "pendingItem" με τη συγκεκριμένη εκκρεμότητα (π.χ. "Η επιχείρηση φαίνεται επιλέξιμη και ενημερώθηκε για το κόστος, αλλά δεν απάντησε ξεκάθαρα αν θέλει να την καλέσει σύμβουλος").

ΠΑΡΕ ΕΣΥ ΤΟΝ ΕΛΕΓΧΟ της συνομιλίας: ΜΗΝ ρωτήσεις ποτέ τον πελάτη "τι θέλεις να μάθεις" ή κάτι αντίστοιχο ανοιχτό.

ΔΟΜΗ ΑΝΟΙΓΜΑΤΟΣ (ακολούθησέ την πάντα, σε αυτή τη σειρά):
1. **Χαιρετισμός** — σύντομος και φιλικός (π.χ. "Γεια σας! Είμαι ο Ερμής, ο ψηφιακός σύμβουλος της I-MENTOR.").
2. **Παρουσίαση προγράμματος** — 1 πρόταση: το βασικό οικονομικό χαρακτηριστικό (επιτόκιο ή ποσοστό επιχορήγησης) μαζί με το ύψος ${isLoan ? 'δανείου' : 'επένδυσης/προϋπολογισμού'}.
3. **Ενημέρωση για ό,τι ήδη γνωρίζουμε** — πες ευθέως στον πελάτη τι έχει ήδη ελεγχθεί/επιβεβαιωθεί, ώστε να νιώθει ότι δεν ξεκινάμε από το μηδέν. Συγκεκριμένα:
   - Αν υπάρχουν επιβεβαιωμένα από αυτόματη αντιστοίχιση (π.χ. ΚΑΔ, Περιφέρεια, Ημερομηνία έναρξης): ανέφερέ τα ρητά ως "έχουμε ήδη ελέγξει και ✓".
   - Αν υπάρχουν γνωστά στοιχεία από τον σύμβουλο (contextSummary): ανέφερε ΜΟΝΟ πεδία που έχουν τιμή "Ναι" (=ΟΚ), π.χ. "Γνωρίζουμε ήδη ότι: ΑΣΦ & ΦΟΡ ΕΝΗΜ: ✓, ΚΕΡΔΟΦΟΡΙΑ: ✓" — αυτά επιβεβαιώνουν. Αν κάποιο πεδίο έχει "Όχι", ΜΗΝ το ανακοινώσεις στο άνοιγμα — θα το χειριστείς ως αποκλεισμό βάσει του κανόνα ερμηνείας παραπάνω.
   - ΚΡΙΣΙΜΟ: Ανέφερε μόνο ό,τι υπάρχει ρητά στα ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ. ΜΗΝ υποθέσεις ή επινοήσεις στοιχεία που δεν αναφέρονται εκεί.
   - Κράτα αυτό το μέρος σύντομο (2-4 γραμμές max).
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

Μην κάνεις ποτέ νομικές δεσμευτικές διαβεβαιώσεις — η τελική έγκριση είναι πάντα του φορέα διαχείρισης του προγράμματος.
${buildRequiredDocsSection(program.requiredDocuments)}`
}

function buildRequiredDocsSection(docs?: { name: string; category: string; instructions: string | null }[]): string {
  if (!docs || docs.length === 0) return ''
  const selfService = docs.filter(d => d.category === 'SELF_SERVICE')
  const viaAccountant = docs.filter(d => d.category === 'VIA_ACCOUNTANT')
  const lines: string[] = ['\nΑΠΑΙΤΟΥΜΕΝΑ ΕΓΓΡΑΦΑ (ενεργοποιείται μόνο όταν η επιχείρηση φανεί επιλέξιμη):']
  lines.push('Όταν ο πελάτης επιβεβαιώσει ότι θέλει να προχωρήσει, ΑΜΕΣΩΣ ΜΕΤΑ το assign_case ενημέρωσέ τον για τα απαιτούμενα έγγραφα, χωρισμένα σε δύο ομάδες:')
  if (selfService.length > 0) {
    lines.push('\n**Έγγραφα που μπορείτε να βγάλετε μόνοι σας:**')
    for (const d of selfService) {
      lines.push(`- **${d.name}**${d.instructions ? ` — ${d.instructions}` : ''}`)
    }
  }
  if (viaAccountant.length > 0) {
    lines.push('\n**Έγγραφα που χρειάζεστε από τον λογιστή σας:**')
    for (const d of viaAccountant) {
      lines.push(`- **${d.name}**${d.instructions ? ` — ${d.instructions}` : ''}`)
    }
  }
  lines.push('\nΖητάς να τα στείλουν στο **info@i-mentor.gr** με θέμα: **ΕΓΓΡΑΦΑ - [Επωνυμία επιχείρησης]**.')
  lines.push('Πρόσθεσε: "Χωρίς αυτά τα έγγραφα ο σύμβουλος δεν μπορεί να κάνει το επόμενο βήμα — η υπόθεσή σας εκκρεμεί μέχρι τότε."')
  lines.push('Κλείσε με: "Θα μπορέσετε να τα στείλετε σήμερα;"')
  return lines.join('\n')
}

async function autoTagBusinessFromErmis(businessId: string, programTitle: string): Promise<void> {
  const tag = programTitle.trim()
  if (!tag) return

  // Ensure a TagOption exists for this program so it appears in filter dropdowns
  const existing = await prisma.tagOption.findFirst({ where: { label: tag } })
  if (!existing) {
    const count = await prisma.tagOption.count()
    await prisma.tagOption.create({ data: { label: tag, order: count } })
  }

  // Add the tag to the business if not already present
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { tags: true } })
  if (!business) return
  if (!business.tags.includes(tag)) {
    await prisma.business.update({ where: { id: businessId }, data: { tags: [...business.tags, tag] } })
  }
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

  // Auto-tag the business with the program title so it's filterable in matches
  autoTagBusinessFromErmis(params.businessId, params.programTitle).catch(() => {})

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
  const cmLeadRef = await notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: clientCase.caseType,
    description: clientCase.description,
    priority: clientCase.priority,
    programTitle: params.programTitle,
    ermis_completed: true,
    ...profile,
  }).catch(err => {
    console.error('[CaseManagement] notify failed:', err?.message)
    return null
  })

  // Store the CM lead ref so ermis.completed can reference it later
  if (cmLeadRef) {
    await prisma.clientCase.update({
      where: { id: clientCase.id },
      data: { externalRef: cmLeadRef },
    }).catch(err => console.error('[ErmisCase] failed to store cmLeadRef:', err?.message))
  }

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
    minRegdate?: string | null
    maxRegdate?: string | null
    requiredDocuments?: { name: string; category: string; instructions: string | null }[]
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
  legalStatusDescr?: string | null
  // Business start date (ISO string) — used to compute near-eligibility for ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ
  businessRegdate?: string | null
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
  const system = buildSystemPrompt(params.program, params.businessName, params.autoConfirmedReasons, params.qualitativeQuestions || [], params.contextSummary, params.consultant, params.legalStatusDescr, params.businessRegdate)

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
    try {
      caseId = await createPublicClientCase({
        businessId: params.businessId,
        programId: params.programId,
        programTitle: params.program.title,
        businessName: params.businessName,
        summary,
        pendingItem,
      })
    } catch {
      // GEMI prospects have no Business record — caller handles lead creation
      caseId = `gemi-${params.businessId}`
    }

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
