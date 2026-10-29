import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEligibilityQuestions, parseEligibilityStorage } from '@/lib/eligibility-questions'

export const dynamic = 'force-dynamic'

const MAX_RESPONSE_TOKENS = 1500
// Keeps a single request's PDF text reasonable for latency/cost — a program
// realistically carries a handful of announcement/KYA PDFs, not a library.
const MAX_ATTACHMENT_CHARS = 120_000

function eur(n: number | null | undefined): string | null {
  return n != null ? `${n.toLocaleString('el-GR')}€` : null
}
function pct(n: number | null | undefined): string | null {
  return n != null ? `${n.toLocaleString('el-GR')}%` : null
}

async function extractAttachmentText(dataUrl: string, name: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:')) return null
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return null
  try {
    const buffer = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64')
    const { PDFParse } = await import('pdf-parse')
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules/pdf-parse/dist/worker/pdf.worker.mjs')).href)
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    return result.text?.trim() || null
  } catch (e: any) {
    console.error(`[ProgramAsk] Failed to extract text from attachment "${name}":`, e?.message)
    return null
  }
}

async function buildProgramContext(program: any): Promise<string> {
  const lines: string[] = []
  const push = (label: string, value: string | null | undefined) => {
    if (value != null && value !== '') lines.push(`${label}: ${value}`)
  }

  push('Τίτλος', program.title)
  push('Κατηγορία', program.category)
  push('Περιγραφή', program.description)
  push('Σημείωση % επιχορήγησης', program.subsidyNote)
  push('Ποσό Επένδυσης', [eur(program.minInvestment), eur(program.maxInvestment)].filter(Boolean).join(' — ') || null)
  push('% Επιχορήγησης', [pct(program.minSubsidyPct), pct(program.maxSubsidyPct)].filter(Boolean).join(' — ') || null)
  push('Επιτόκιο', [pct(program.minInterestRate), pct(program.maxInterestRate)].filter(Boolean).join(' — ') || null)
  push('Μηνιαία Επιχορήγηση (ΔΥΠΑ)', program.monthlyAmount)
  push('Μήνες Επιχορήγησης (ΔΥΠΑ)', program.subsidyMonths)
  push('Συνολικό Όφελος (ΔΥΠΑ)', program.totalBenefit)
  push('Ωφελούμενοι', program.beneficiaries)
  push('Συνολικός Προϋπολογισμός', program.totalBudgetEur != null ? eur(program.totalBudgetEur) : null)
  push('Διάρκεια Υλοποίησης (μήνες)', program.implementationMonths != null ? String(program.implementationMonths) : null)
  push('Υποβολή Αιτήσεων από', program.startDate ? new Date(program.startDate).toLocaleDateString('el-GR') : null)
  push('Προθεσμία Υποβολής', program.endDate ? new Date(program.endDate).toLocaleDateString('el-GR') : null)
  push('Ημερομηνία Έναρξης Επιχείρησης (εύρος)', [program.minRegdate, program.maxRegdate].filter(Boolean).join(' — ') || null)
  push('Περιοχές/Περιφέρειες', program.regions || (program.regionRules?.length ? program.regionRules.join(', ') : null))
  push('Κανόνες Ταχυδρομικών Κωδίκων (ΤΚ)', program.zipCodeRules?.length ? program.zipCodeRules.join(', ') : null)
  push('Επιλέξιμοι ΚΑΔ', program.kadRules?.length ? program.kadRules.join(', ') : null)
  push('Εξαιρούμενοι ΚΑΔ', program.excludedKadRules?.length ? program.excludedKadRules.join(', ') : null)
  push('Εξαιρέσεις από τους εξαιρούμενους ΚΑΔ', program.excludedKadExceptions?.length ? program.excludedKadExceptions.join(', ') : null)
  push('Εξαιρούμενες Νομικές Μορφές', program.excludedLegalForms?.length ? program.excludedLegalForms.join(', ') : null)
  push('Εξαιρούνται επιχειρήσεις με ετικέτες', program.excludeTags?.length ? program.excludeTags.join(', ') : null)
  push('Απαιτούνται επιχειρήσεις με ετικέτες', program.requireTags?.length ? program.requireTags.join(', ') : null)
  push('Βασικά Σημεία', program.keyPoints?.length ? program.keyPoints.join('\n- ') : null)
  push('Σημείωση Κόστους I-MENTOR (εσωτερική)', program.pricingNote)
  push('Οδηγίες προς τον Ερμή (εσωτερικές)', program.ermisInstructions)
  push('Εσωτερικές Σημειώσεις', program.internalNotes)

  if (program.otherRequirements) {
    lines.push(`\nΆλλες Προϋποθέσεις (ακριβές κείμενο):\n${program.otherRequirements}`)
  }

  if (Array.isArray(program.fundedActions) && program.fundedActions.length > 0) {
    lines.push('\nΕνισχυόμενες Ενέργειες/Δαπάνες:')
    for (const a of program.fundedActions) {
      if (a?.title) lines.push(`- ${a.title}${a.description ? `: ${a.description}` : ''}`)
    }
  }

  if (Array.isArray(program.expenseCategories) && program.expenseCategories.length > 0) {
    lines.push('\nΚατηγορίες Επιλέξιμων Δαπανών:')
    for (const c of program.expenseCategories) {
      lines.push(`- ${[c?.code, c?.category, c?.expense, c?.limit].filter(Boolean).join(' | ')}`)
    }
  }

  if (program.requiredDocuments?.length > 0) {
    lines.push('\nΑπαιτούμενα Έγγραφα:')
    for (const d of program.requiredDocuments) {
      lines.push(`- ${d.name} (${d.category === 'SELF_SERVICE' ? 'αυτοεξυπηρέτηση' : 'μέσω λογιστή'})${d.instructions ? `: ${d.instructions}` : ''}`)
    }
  }

  // Resolved eligibility Q&A — the exact same list shown in the admin's
  // "Ερωτήσεις Επιλεξιμότητας (Ερμής)" panel on this page, so the chat's
  // answers stay consistent with what's displayed there.
  try {
    const storage = parseEligibilityStorage(program.eligibilityQuestions)
    const criteria = program.extraCriteriaIds?.length
      ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { id: true, label: true } })
      : []
    const questions = buildEligibilityQuestions(
      {
        minInvestment: program.minInvestment,
        maxInvestment: program.maxInvestment,
        otherRequirements: program.otherRequirements,
        extraCriteriaLabels: criteria,
        isLoan: program.category === 'MICROCREDITS',
      },
      storage.overrides,
      storage.custom
    )
    if (questions.length > 0) {
      lines.push('\nΕρωτήσεις Επιλεξιμότητας (όπως εμφανίζονται στον Ερμή):')
      for (const q of questions) {
        const answerNote = q.type === 'boolean'
          ? `(σωστή/επιλέξιμη απάντηση: ${q.expectedAnswer ? 'Ναι' : 'Όχι'})`
          : `(αποδεκτό εύρος: ${q.min ?? '—'} έως ${q.max ?? '—'} ${q.unit || ''})`
        lines.push(`- ${q.label} ${answerNote}`)
      }
    }
  } catch (e: any) {
    console.error('[ProgramAsk] Failed to resolve eligibility questions:', e?.message)
  }

  // Attached documents, extracted to plain text.
  if (program.attachmentUrls?.length > 0) {
    let remaining = MAX_ATTACHMENT_CHARS
    const attachmentSections: string[] = []
    for (let i = 0; i < program.attachmentUrls.length; i++) {
      if (remaining <= 0) break
      const name = program.attachmentNames?.[i] || `Σχετικό αρχείο ${i + 1}`
      const text = await extractAttachmentText(program.attachmentUrls[i], name)
      if (!text) continue
      const slice = text.slice(0, remaining)
      remaining -= slice.length
      attachmentSections.push(`\n=== Έγγραφο: ${name} ===\n${slice}${slice.length < text.length ? '\n[...περικοπή λόγω μήκους...]' : ''}`)
    }
    if (attachmentSections.length > 0) {
      lines.push('\n\n--- Περιεχόμενο Συνημμένων Εγγράφων ---')
      lines.push(...attachmentSections)
    }
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT_PREFIX = `Είσαι βοηθός που απαντά σε ερωτήσεις ενός διαχειριστή του I-MENTOR Portal σχετικά με ένα συγκεκριμένο πρόγραμμα χρηματοδότησης. Απάντησε ΑΠΟΚΛΕΙΣΤΙΚΑ με βάση τις πληροφορίες που σου δίνονται παρακάτω (στοιχεία προγράμματος + περιεχόμενο συνημμένων εγγράφων). Αν η απάντηση δεν προκύπτει από αυτές τις πληροφορίες, πες το καθαρά ("Δεν βρίσκω αυτή την πληροφορία στα στοιχεία του προγράμματος ή στα συνημμένα έγγραφα.") αντί να μαντέψεις. Απάντησε στα Ελληνικά, σύντομα αλλά πλήρως. Όταν είναι χρήσιμο, ανέφερε από ποιο σημείο (π.χ. "Άλλες Προϋποθέσεις" ή το όνομα ενός συνημμένου εγγράφου) προκύπτει η απάντηση.

--- Στοιχεία Προγράμματος ---
`

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CONSULTANT')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const question: string = (body.question || '').trim()
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(body.history) ? body.history : []
  if (!question) return NextResponse.json({ error: 'Η ερώτηση είναι υποχρεωτική' }, { status: 400 })

  const program = await prisma.program.findUnique({
    where: { id: params.id },
    include: { requiredDocuments: { select: { name: true, category: true, instructions: true } } },
  })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY δεν έχει οριστεί στο περιβάλλον.' }, { status: 500 })

  const context = await buildProgramContext(program)
  const anthropic = new Anthropic({ apiKey })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: MAX_RESPONSE_TOKENS,
      system: SYSTEM_PROMPT_PREFIX + context,
      messages: [
        ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: question },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const answer = textBlock && textBlock.type === 'text' ? textBlock.text : 'Δεν ελήφθη απάντηση από το μοντέλο.'

    return NextResponse.json({ answer })
  } catch (e: any) {
    console.error('[ProgramAsk] Anthropic call failed:', e?.message)
    return NextResponse.json({ error: 'Σφάλμα κατά την επεξεργασία της ερώτησης.' }, { status: 500 })
  }
}
