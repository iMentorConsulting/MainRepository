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

const MAX_RESPONSE_TOKENS = 1_000

// Hard per-conversation token budget (input+output, cumulative across turns)
// to prevent runaway/abusive Claude spend on a single business+program chat.
export const MAX_CONVERSATION_TOKENS = 60_000

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const IMENTOR_BASICS = `Η I-MENTOR είναι σύμβουλος επιχειρήσεων που υποστηρίζει ελληνικές επιχειρήσεις στην ένταξη και υλοβολή προγραμμάτων ΕΣΠΑ/ΔΥΠΑ: σύνταξη φακέλου υποβολής, παρακολούθηση της αίτησης, και υποστήριξη μέχρι την εκταμίευση. Η επιχείρηση συνήθως εξυπηρετείται μέσω του λογιστικού γραφείου της (αν έχει συνεργασία με την I-MENTOR) ή απευθείας από σύμβουλο της I-MENTOR.`

const TOOL_SCHEMA = {
  name: 'assign_case',
  description: 'Καλείται ΜΟΝΟ όταν έχεις κάνει τον βασικό έλεγχο επιλεξιμότητας, η επιχείρηση φαίνεται επιλέξιμη (ή θέλει να προχωρήσει παρά τις επιφυλάξεις) ΚΑΙ έχει ζητήσει να προχωρήσει/ενδιαφέρεται να αναλάβει η I-MENTOR την υπόθεση. Δημιουργεί υπόθεση στο case management και αναθέτει σε σύμβουλο.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Σύντομη περίληψη (1-2 προτάσεις, ελληνικά) της συνομιλίας: τι ελέγχθηκε, αν φαίνεται επιλέξιμη η επιχείρηση, οποιαδήποτε επιφύλαξη.' },
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
}, businessName: string, autoConfirmedReasons: string[], qualitativeQuestions: EligibilityQuestion[]) {
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

ΗΔΗ ΕΠΙΒΕΒΑΙΩΜΕΝΑ (ΜΗΝ τα ξαναρωτήσεις): ${autoConfirmedReasons.length ? autoConfirmedReasons.join('· ') : '(τίποτα ακόμη)'}

ΚΟΣΤΟΣ (ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ, πες το ΜΟΝΟ αν ρωτηθείς ή όταν είναι φυσικό στο τέλος): ${program.pricingNote || 'Δεν υπάρχει σταθερή τιμή για αυτό το πρόγραμμα· πες ότι το κόστος εξαρτάται από την υπηρεσία και ότι ο σύμβουλος θα δώσει ακριβή προσφορά.'}
${program.internalNotes ? `\nΕΠΙΠΛΕΟΝ ΕΣΩΤΕΡΙΚΗ ΠΛΗΡΟΦΟΡΙΑ (πες την ΜΟΝΟ αν η επιχείρηση φαίνεται ΕΠΙΛΕΞΙΜΗ — ΠΟΤΕ αν δεν είναι, ή πριν ολοκληρωθεί ο έλεγχος επιλεξιμότητας): ${program.internalNotes}` : ''}

ΣΚΟΠΟΣ ΣΟΥ, με αυτή σειρά:
1. Κάνε τον βασικό έλεγχο επιλεξιμότητας — ρώτα ΜΟΝΟ ό,τι λείπει από τα "ήδη επιβεβαιωμένα" και είναι κρίσιμο, ΜΙΑ ερώτηση τη φορά, όχι λίστα ερωτήσεων μαζί.
2. Ενημέρωσε περίπου για το κόστος όταν ζητηθεί ή αφού κλείσει ο έλεγχος επιλεξιμότητας.
3. Αν η επιχείρηση φαίνεται επιλέξιμη ΚΑΙ θέλει να προχωρήσει, κάλεσε το εργαλείο "assign_case" για να αναλάβει σύμβουλος της I-MENTOR την υπόθεση. Μην το καλέσεις πρόωρα, πριν κάνεις τον βασικό έλεγχο.
4. Αν δεν φαίνεται επιλέξιμη, πες το ευθέως και ευγενικά, χωρίς να καλέσεις το εργαλείο.

ΠΑΡΕ ΕΣΥ ΤΟΝ ΕΛΕΓΧΟ της συνομιλίας: ΜΗΝ ρωτήσεις ποτέ τον πελάτη "τι θέλεις να μάθεις" ή κάτι αντίστοιχο ανοιχτό. Στο ΞΕΚΙΝΗΜΑ της συνομιλίας, πριν από οποιαδήποτε ερώτηση, κάνε ΠΡΩΤΑ μια πολύ σύντομη (1 πρόταση) παρουσίαση του προγράμματος: το βασικό οικονομικό χαρακτηριστικό (επιτόκιο ή ποσοστό επιχορήγησης) ΜΑΖΙ με το ύψος του ${isLoan ? 'δανείου' : 'προϋπολογισμού/επένδυσης'} — π.χ. "Το πρόγραμμα ${isLoan ? 'είναι δάνειο με επιτόκιο X% για ποσά από Α έως Β€' : 'καλύπτει επενδύσεις από Α έως Β€ με επιχορήγηση X%'}." Μετά αυτή την παρουσίαση, λέγοντας ευθέως τι ήδη γνωρίζεις (τα "ήδη επιβεβαιωμένα"), προχώρα αμέσως στην επόμενη συγκεκριμένη ερώτηση που λείπει για τον έλεγχο επιλεξιμότητας. Εσύ οδηγείς τη συζήτηση βήμα-βήμα μέχρι να καταλήξεις σε συμπέρασμα.

${isLoan ? 'ΣΗΜΑΝΤΙΚΟ: Αυτό το πρόγραμμα είναι ΔΑΝΕΙΟ, όχι επιχορήγηση επένδυσης — μίλα πάντα για "ύψος δανείου", ποτέ για "ύψος επένδυσης".' : ''}

Μην επαναλαμβάνεις τη λέξη "επιλέξιμος/επιλέξιμη" μπροστά από κάθε κριτήριο όταν παραθέτεις τα "ήδη επιβεβαιωμένα" (π.χ. γράψε "ΚΑΔ: ..., Περιφέρεια: ..." όχι "Επιλέξιμος ΚΑΔ: ..., Επιλέξιμη περιφέρεια: ...") — η λέξη "επιλέξιμος" χρησιμοποιείται μόνο για το τελικό συμπέρασμα.

Χρησιμοποίησε **διπλά αστερίσκια** γύρω από λέξεις/φράσεις που θέλεις να εμφανίζονται έντονα (bold) στον πελάτη — π.χ. αριθμούς, ΚΑΔ, ποσά, "επιλέξιμος"/"μη επιλέξιμος". Το frontend τα μετατρέπει αυτόματα σε έντονη γραφή.

Μην κάνεις ποτέ νομικές δεσμευτικές διαβεβαιώσεις — η τελική έγκριση είναι πάντα του φορέα διαχείρισης του προγράμματος.`
}

async function createPublicClientCase(params: {
  businessId: string
  programId: string
  programTitle: string
  businessName: string
  summary: string
}) {
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { id: true, accountantId: true, onomasia: true, afm: true, phone: true, email: true },
  })
  if (!business) throw new Error('Δεν βρέθηκε η επιχείρηση')

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  if (!adminUser) throw new Error('Δεν βρέθηκε χρήστης ADMIN για createdById')

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId: business.accountantId || null,
      businessId: params.businessId,
      programId: params.programId,
      requestType: 'APPLICATION_SUPPORT',
      title: `${business.onomasia || business.afm} — ${params.programTitle}`,
      description: params.summary,
      priority: 'NORMAL',
      status: 'NEW',
      createdById: adminUser.id,
      activities: {
        create: {
          type: 'CREATED',
          body: `Η υπόθεση δημιουργήθηκε αυτόματα από τον Ερμής (chat): ${params.summary}`,
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
      subject: `🗂️ Νέα Υπόθεση #${clientCase.caseNumber} από Ερμής — ${business.onomasia || business.afm}`,
      html: `<p>Ο Ερμής δημιούργησε νέα υπόθεση μετά από συνομιλία με τον πελάτη <strong>${business.onomasia || business.afm}</strong> για το πρόγραμμα <strong>${params.programTitle}</strong>:</p>
        <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${params.summary}</blockquote>
        <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${clientCase.id}">Δείτε την υπόθεση →</a></p>`,
    })
  } catch {}

  notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    afm: business.afm,
    onomasia: business.onomasia,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: clientCase.caseType,
    description: clientCase.description,
    priority: clientCase.priority,
    programTitle: params.programTitle,
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
}): Promise<{ reply: string; caseId: string | null; tokensUsed: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.')

  if (params.tokensUsedSoFar >= MAX_CONVERSATION_TOKENS) {
    return {
      reply: 'Έχουμε φτάσει στο όριο αυτής της συζήτησης. Επικοινωνήστε απευθείας με την I-MENTOR (info@i-mentor.gr) για να συνεχίσουμε τον έλεγχο επιλεξιμότητάς σας.',
      caseId: null,
      tokensUsed: 0,
    }
  }

  const anthropic = new Anthropic({ apiKey })
  const system = buildSystemPrompt(params.program, params.businessName, params.autoConfirmedReasons, params.qualitativeQuestions || [])

  const messages: Anthropic.MessageParam[] = params.isKickoff
    ? [{ role: 'user', content: 'Ξεκίνα εσύ τη συνομιλία.' }]
    : params.history.map(m => ({ role: m.role, content: m.text }))

  const tools = params.alreadyAssigned ? undefined : [TOOL_SCHEMA]

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: MAX_RESPONSE_TOKENS,
    system,
    thinking: { type: 'adaptive' },
    ...(tools ? { tools, tool_choice: { type: 'auto' } } : {}),
    messages,
  })

  let tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)

  const toolUse = response.content.find(b => b.type === 'tool_use')
  let caseId: string | null = null

  if (toolUse && toolUse.type === 'tool_use' && toolUse.name === 'assign_case') {
    const summary = String((toolUse.input as any)?.summary || 'Ο πελάτης φαίνεται επιλέξιμος.')
    caseId = await createPublicClientCase({
      businessId: params.businessId,
      programId: params.programId,
      programTitle: params.program.title,
      businessName: params.businessName,
      summary,
    })

    const followUp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
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
    tokensUsed += (followUp.usage?.input_tokens || 0) + (followUp.usage?.output_tokens || 0)
    const text = followUp.content.find(b => b.type === 'text')
    return { reply: text && text.type === 'text' ? text.text : 'Η υπόθεσή σας καταχωρήθηκε — ένας σύμβουλος της I-MENTOR θα επικοινωνήσει μαζί σας σύντομα.', caseId, tokensUsed }
  }

  const text = response.content.find(b => b.type === 'text')
  return { reply: text && text.type === 'text' ? text.text : 'Μπορείτε να επαναλάβετε;', caseId: null, tokensUsed }
}
