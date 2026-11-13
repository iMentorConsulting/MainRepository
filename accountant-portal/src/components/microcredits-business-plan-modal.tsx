'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { X, Send, FileText, CheckCircle2, Download, Loader2, RotateCcw } from 'lucide-react'

interface Activity {
  firmActCode: string
  firmActDescr: string | null
}

interface MicrocreditsBusinessPlanModalProps {
  businessId: string
  programId: string
  businessHasEmail: boolean
  businessOnomasia?: string | null
  businessAfm?: string | null
  businessLegalForm?: string | null
  onClose: () => void
}

interface Owner {
  surname: string
  name: string
  afm: string
  percentage: string
}

interface ExpenseBreakdown {
  emporeumata: string
  analosima: string
  deko: string
  enoikia: string
  loipa: string
}

interface FixedAssetItem {
  description: string
  amount: string
}

const EMPTY_BREAKDOWN: ExpenseBreakdown = { emporeumata: '', analosima: '', deko: '', enoikia: '', loipa: '' }

interface Question {
  id: string
  section: number
  sectionTitle: string
  text: string
  bold: boolean
}

interface Questionnaire {
  id: string
  selectedKadCodes: string[]
  activityNote: string | null
  questions: Question[]
  answers: Record<string, string> | null
  sentAt: string | null
  respondedAt: string | null
}

interface Plan {
  id: string
  currentRevenue: number
  currentEbitda: number
  currentNetProfit: number
  annualGrowthPct: number
  loanAmount: number
  workingCapitalAmount: number
  fixedAssetsAmount: number
  legalRepresentative: string | null
  consultantNotes: string | null
  owners: Owner[]
  operatingExpenseBreakdown: ExpenseBreakdown | null
  fixedAssetItems: FixedAssetItem[] | null
  implementationMonths: number
  section1_1: string[]
  section2_1: string[]
  section2_2: string[]
  generatedAt: string | null
}

function splitSoleProprietorName(onomasia: string): { surname: string; name: string } {
  const parts = onomasia.trim().split(/\s+/)
  if (parts.length < 2) return { surname: onomasia, name: '' }
  return { surname: parts[0], name: parts.slice(1).join(' ') }
}

export function MicrocreditsBusinessPlanModal({ businessId, programId, businessHasEmail, businessOnomasia, businessAfm, businessLegalForm, onClose }: MicrocreditsBusinessPlanModalProps) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)

  // Step 1: questionnaire
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null)
  const [selectedKad, setSelectedKad] = useState<string[]>([])
  const [activityNote, setActivityNote] = useState('')
  const [sendingQuestionnaire, setSendingQuestionnaire] = useState(false)
  const [draftQuestions, setDraftQuestions] = useState<Question[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [extraInstructions, setExtraInstructions] = useState('')

  // Step 2: business plan generation
  const [plan, setPlan] = useState<Plan | null>(null)
  const [currentRevenue, setCurrentRevenue] = useState('')
  const [currentEbitda, setCurrentEbitda] = useState('')
  const [currentNetProfit, setCurrentNetProfit] = useState('')
  const [annualGrowthPct, setAnnualGrowthPct] = useState('10')
  const [loanAmount, setLoanAmount] = useState('25000')
  const [fixedAssetsAmount, setFixedAssetsAmount] = useState('0')
  const [legalRepresentative, setLegalRepresentative] = useState('')
  const [consultantNotes, setConsultantNotes] = useState('')
  const [owners, setOwners] = useState<Owner[]>([])
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown>(EMPTY_BREAKDOWN)
  const [fixedAssetItems, setFixedAssetItems] = useState<FixedAssetItem[]>([])
  const [implementationMonths, setImplementationMonths] = useState('24')
  const [generating, setGenerating] = useState(false)

  const [eligibleActivities, setEligibleActivities] = useState<Activity[] | null>(null)

  // Lets the consultant review/correct the client's questionnaire answers
  // before generating the draft — e.g. to fix an obvious mistake or fill in
  // something answered by phone instead.
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({})
  const [savingAnswers, setSavingAnswers] = useState(false)
  const [answersSaved, setAnswersSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/businesses/${businessId}/microcredits-plan/questionnaire?programId=${programId}`).then(r => r.json()),
      fetch(`/api/businesses/${businessId}/microcredits-plan/generate?programId=${programId}`).then(r => r.json()),
    ])
      .then(([q, p]) => {
        if (q.questionnaire) {
          setQuestionnaire(q.questionnaire)
          setEditedAnswers(q.questionnaire.answers || {})
        }
        setEligibleActivities(q.eligibleActivities || [])
        if (p.plan) {
          setPlan(p.plan)
          setOwners(p.plan.owners && p.plan.owners.length > 0 ? p.plan.owners : [])
          if (p.plan.operatingExpenseBreakdown) setExpenseBreakdown(p.plan.operatingExpenseBreakdown)
          if (p.plan.fixedAssetItems && p.plan.fixedAssetItems.length > 0) setFixedAssetItems(p.plan.fixedAssetItems)
          if (p.plan.implementationMonths) setImplementationMonths(String(p.plan.implementationMonths))
        }
        // Sole proprietorships only have one owner — the business itself —
        // so default the table to them at 100%, pre-filled from data we
        // already have, rather than asking the consultant to retype it.
        if ((!p.plan || !p.plan.owners || p.plan.owners.length === 0) && businessLegalForm?.includes('ΑΤΟΜΙΚ') && businessOnomasia) {
          const { surname, name } = splitSoleProprietorName(businessOnomasia)
          setOwners([{ surname, name, afm: businessAfm || '', percentage: '100' }])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId, programId, businessLegalForm, businessOnomasia, businessAfm])

  function updateOwner(index: number, field: keyof Owner, value: string) {
    setOwners(prev => prev.map((o, i) => i === index ? { ...o, [field]: value } : o))
  }

  function addOwner() {
    setOwners(prev => prev.length >= 3 ? prev : [...prev, { surname: '', name: '', afm: '', percentage: '' }])
  }

  function removeOwner(index: number) {
    setOwners(prev => prev.filter((_, i) => i !== index))
  }

  function addFixedAssetItem() {
    setFixedAssetItems(prev => [...prev, { description: '', amount: '' }])
  }

  function updateFixedAssetItem(index: number, field: keyof FixedAssetItem, value: string) {
    setFixedAssetItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function removeFixedAssetItem(index: number) {
    setFixedAssetItems(prev => prev.filter((_, i) => i !== index))
  }

  async function saveAnswerCorrections() {
    setSavingAnswers(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/microcredits-plan/questionnaire/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, answers: editedAnswers, markResponded: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Η αποθήκευση απέτυχε')
      setQuestionnaire(prev => prev ? { ...prev, answers: editedAnswers } : prev)
      setAnswersSaved(true)
      setTimeout(() => setAnswersSaved(false), 2500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingAnswers(false)
    }
  }

  async function previewQuestionnaire() {
    if (selectedKad.length === 0) {
      setError('Επιλέξτε τουλάχιστον έναν ΚΑΔ.')
      return
    }
    setPreviewing(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/microcredits-plan/questionnaire/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          selectedKadCodes: selectedKad,
          activityNote: activityNote.trim() || undefined,
          extraInstructions: extraInstructions.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Η δημιουργία απέτυχε')
      setDraftQuestions(data.questions)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  function removeDraftQuestion(id: string) {
    setDraftQuestions(prev => prev ? prev.filter(q => q.id !== id) : prev)
  }

  async function resetQuestionnaire() {
    if (!confirm('Διαγραφή του ερωτηματολογίου (και τυχόν business plan) για αυτήν την επιχείρηση/πρόγραμμα; Δεν αναιρείται.')) return
    setResetting(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/microcredits-plan/questionnaire?programId=${programId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Η επαναφορά απέτυχε')
      setQuestionnaire(null)
      setDraftQuestions(null)
      setPlan(null)
      setSelectedKad([])
      setActivityNote('')
      setExtraInstructions('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setResetting(false)
    }
  }

  async function sendQuestionnaire() {
    if (!draftQuestions || draftQuestions.length === 0) {
      setError('Δεν υπάρχουν ερωτήσεις προς αποστολή.')
      return
    }
    setSendingQuestionnaire(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/microcredits-plan/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          selectedKadCodes: selectedKad,
          activityNote: activityNote.trim() || undefined,
          questions: draftQuestions,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Η αποστολή απέτυχε')
      setQuestionnaire(data.questionnaire)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSendingQuestionnaire(false)
    }
  }

  const loanAmountNum = Number(loanAmount) || 0
  const fixedAssetsNum = Number(fixedAssetsAmount) || 0
  const workingCapitalNum = Math.max(0, loanAmountNum - fixedAssetsNum)
  const fixedAssetsPct = loanAmountNum > 0 ? (fixedAssetsNum / loanAmountNum) * 100 : 0
  const fixedAssetsTooHigh = fixedAssetsPct > 40.1

  const breakdownTotal = Object.values(expenseBreakdown).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const breakdownFilled = breakdownTotal > 0
  const breakdownMismatch = breakdownFilled && Math.abs(breakdownTotal - workingCapitalNum) > 1
  const assetItemsTotal = fixedAssetItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const assetItemsMismatch = fixedAssetsNum > 0 && assetItemsTotal > 0 && Math.abs(assetItemsTotal - fixedAssetsNum) > 1

  async function generatePlan() {
    if (!currentRevenue || !currentEbitda || !currentNetProfit) {
      setError('Συμπληρώστε τα τρέχοντα οικονομικά στοιχεία.')
      return
    }
    if (fixedAssetsTooHigh) {
      setError('Τα πάγια δεν μπορούν να υπερβαίνουν το 40% του συνολικού δανείου.')
      return
    }
    if (breakdownMismatch) {
      setError('Η ανάλυση λειτουργικών δαπανών πρέπει να ισούται με το κεφάλαιο κίνησης.')
      return
    }
    if (assetItemsMismatch) {
      setError('Η ανάλυση παγίων πρέπει να ισούται με το ποσό παγίων.')
      return
    }
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/microcredits-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          questionnaireId: questionnaire?.id,
          currentRevenue: Number(currentRevenue),
          currentEbitda: Number(currentEbitda),
          currentNetProfit: Number(currentNetProfit),
          annualGrowthPct: Number(annualGrowthPct),
          loanAmount: loanAmountNum,
          workingCapitalAmount: workingCapitalNum,
          fixedAssetsAmount: fixedAssetsNum,
          legalRepresentative: legalRepresentative.trim() || undefined,
          consultantNotes: consultantNotes.trim() || undefined,
          owners: owners.filter(o => o.surname || o.name || o.afm),
          operatingExpenseBreakdown: breakdownFilled ? expenseBreakdown : undefined,
          fixedAssetItems: fixedAssetItems.filter(i => i.description && Number(i.amount) > 0),
          implementationMonths: Number(implementationMonths) || 24,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Η δημιουργία απέτυχε')
      setPlan(data.plan)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function downloadDocx() {
    if (!plan) return
    window.open(`/api/businesses/${businessId}/microcredits-plan/download?planId=${plan.id}`, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900">Business Plan — Ταμείο Μικροπιστώσεων</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : (
            <>
              {/* Step 1: Questionnaire */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Βήμα 1 — Ερωτηματολόγιο</h3>
                {questionnaire ? (
                  <div className="space-y-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} className="shrink-0" />
                      {questionnaire.respondedAt
                        ? 'Ο πελάτης έχει απαντήσει το ερωτηματολόγιο.'
                        : 'Το ερωτηματολόγιο εστάλη — αναμονή απάντησης πελάτη.'}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={resetQuestionnaire}
                        disabled={resetting}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 disabled:opacity-60"
                      >
                        <RotateCcw size={12} />
                        {resetting ? 'Επαναφορά...' : 'Επαναφορά ερωτηματολογίου (διαγραφή)'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">Επιλέξτε ποιος/ποιοι ΚΑΔ της επιχείρησης αφορά η αίτηση, ώστε το ερωτηματολόγιο να προσαρμοστεί σε αυτούς. Εμφανίζονται μόνο οι ΚΑΔ που είναι επιλέξιμοι για αυτό το πρόγραμμα.</p>
                    {eligibleActivities && eligibleActivities.length === 0 && (
                      <p className="text-xs text-amber-600">Κανένας ΚΑΔ της επιχείρησης δεν είναι επιλέξιμος για αυτό το πρόγραμμα.</p>
                    )}
                    <div className="space-y-1.5 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                      {(eligibleActivities || []).map(a => (
                        <label key={a.firmActCode} className="flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedKad.includes(a.firmActCode)}
                            onChange={e => setSelectedKad(prev => e.target.checked ? [...prev, a.firmActCode] : prev.filter(c => c !== a.firmActCode))}
                            className="mt-0.5"
                          />
                          <span><strong>{a.firmActCode}</strong> {a.firmActDescr}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Σημείωση πραγματικής δραστηριότητας (προαιρετικό, αν διαφέρει από την επίσημη περιγραφή ΚΑΔ)</label>
                      <textarea value={activityNote} onChange={e => setActivityNote(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
                    </div>

                    {!draftQuestions && (
                      <button
                        onClick={previewQuestionnaire}
                        disabled={previewing}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-60"
                      >
                        {previewing ? 'Δημιουργία...' : 'Προεπισκόπηση Ερωτηματολογίου'}
                      </button>
                    )}

                    {draftQuestions && (
                      <div className="space-y-3">
                        <div className="space-y-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-3">
                          {Array.from(new Set(draftQuestions.map(q => q.section))).sort((a, b) => a - b).map(section => {
                            const sectionQuestions = draftQuestions.filter(q => q.section === section)
                            return (
                              <div key={section}>
                                <p className="text-xs font-bold text-indigo-700 mb-1">{section}. {sectionQuestions[0]?.sectionTitle}</p>
                                {sectionQuestions.map(q => (
                                  <div key={q.id} className="flex items-start gap-2 mb-1.5">
                                    <button
                                      onClick={() => removeDraftQuestion(q.id)}
                                      title="Αφαίρεση ερώτησης"
                                      className="shrink-0 mt-0.5 text-gray-300 hover:text-red-500"
                                    >
                                      <X size={13} />
                                    </button>
                                    <p className={`text-xs whitespace-pre-line ${q.bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{q.text}</p>
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500 block mb-1">Πρόσθετες οδηγίες συγγραφής (προαιρετικό) — π.χ. "αφαίρεσε τις ερωτήσεις για προσωπικό"</label>
                          <textarea value={extraInstructions} onChange={e => setExtraInstructions(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={previewQuestionnaire}
                            disabled={previewing}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                          >
                            {previewing ? 'Αναδημιουργία...' : 'Αναδημιουργία'}
                          </button>
                          <button
                            onClick={sendQuestionnaire}
                            disabled={sendingQuestionnaire || !businessHasEmail}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                          >
                            <Send size={14} />
                            {sendingQuestionnaire ? 'Αποστολή...' : 'Αποστολή στον Πελάτη'}
                          </button>
                        </div>
                      </div>
                    )}
                    {!businessHasEmail && <p className="text-xs text-amber-600">Η επιχείρηση δεν έχει καταχωρημένο email.</p>}
                  </>
                )}
              </div>

              {/* Step 2: Business plan generation */}
              {questionnaire?.respondedAt && (
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900">Βήμα 2 — Δημιουργία Business Plan</h3>

                  {questionnaire.questions.length > 0 && (
                    <details className="border border-gray-200 rounded-lg">
                      <summary className="px-3 py-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
                        Απαντήσεις Ερωτηματολογίου (προβολή/διόρθωση πριν τη δημιουργία)
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-3 max-h-72 overflow-y-auto">
                        {Array.from(new Set(questionnaire.questions.map(q => q.section))).sort((a, b) => a - b).map(section => {
                          const sectionQuestions = questionnaire.questions.filter(q => q.section === section)
                          return (
                            <div key={section} className="space-y-2">
                              <p className="text-xs font-bold text-indigo-700">{section}. {sectionQuestions[0]?.sectionTitle}</p>
                              {sectionQuestions.map(q => (
                                <div key={q.id}>
                                  <label className={`block text-xs mb-1 whitespace-pre-line ${q.bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{q.text}</label>
                                  <textarea
                                    value={editedAnswers[q.id] || ''}
                                    onChange={e => setEditedAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )
                        })}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={saveAnswerCorrections}
                            disabled={savingAnswers}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-60"
                          >
                            {savingAnswers ? 'Αποθήκευση...' : 'Αποθήκευση Διορθώσεων'}
                          </button>
                          {answersSaved && <span className="text-xs text-emerald-600">Αποθηκεύτηκε.</span>}
                        </div>
                      </div>
                    </details>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Κύκλος εργασιών (€)</label>
                      <input type="number" value={currentRevenue} onChange={e => setCurrentRevenue(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">EBITDA (€)</label>
                      <input type="number" value={currentEbitda} onChange={e => setCurrentEbitda(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Κέρδη μετά φόρων (€)</label>
                      <input type="number" value={currentNetProfit} onChange={e => setCurrentNetProfit(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Ετήσια % βελτίωση (t+1, t+2, t+3)</label>
                    <input type="number" value={annualGrowthPct} onChange={e => setAnnualGrowthPct(e.target.value)} className="w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Ποσό δανείου (€)</label>
                      <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">εκ των οποίων Πάγια (€) — έως 40%</label>
                      <input type="number" value={fixedAssetsAmount} onChange={e => setFixedAssetsAmount(e.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm ${fixedAssetsTooHigh ? 'border-red-400' : 'border-gray-300'}`} />
                    </div>
                  </div>
                  <p className={`text-xs ${fixedAssetsTooHigh ? 'text-red-600' : 'text-gray-500'}`}>
                    Κεφάλαιο κίνησης: {workingCapitalNum.toLocaleString('el-GR')} € · Πάγια: {fixedAssetsPct.toFixed(0)}% {fixedAssetsTooHigh && '(υπερβαίνει το 40%!)'}
                  </p>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">
                      Ανάλυση Λειτουργικών Δαπανών (προαιρετικό — εμφανίζεται ως bullets στο 2.2, αλλιώς παραλείπεται)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      {([['emporeumata', 'Εμπορεύματα'], ['analosima', 'Αναλώσιμα'], ['deko', 'ΔΕΚΟ'], ['enoikia', 'Ενοίκια'], ['loipa', 'Λοιπά']] as const).map(([key, label]) => (
                        <div key={key}>
                          <label className="text-[10px] text-gray-400 block mb-0.5">{label}</label>
                          <input
                            type="number"
                            value={expenseBreakdown[key]}
                            onChange={e => setExpenseBreakdown(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    {breakdownFilled && (
                      <p className={`text-xs mt-1 ${breakdownMismatch ? 'text-red-600' : 'text-gray-500'}`}>
                        Σύνολο: {breakdownTotal.toLocaleString('el-GR')} € {breakdownMismatch && `(πρέπει να ισούται με το κεφάλαιο κίνησης: ${workingCapitalNum.toLocaleString('el-GR')} €)`}
                      </p>
                    )}
                  </div>

                  {fixedAssetsNum > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Ανάλυση Παγίων (είδος + κόστος)</label>
                      <div className="space-y-1.5">
                        {fixedAssetItems.map((item, i) => (
                          <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-1.5 items-center">
                            <input type="text" placeholder="π.χ. Ψυγείο" value={item.description} onChange={e => updateFixedAssetItem(i, 'description', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                            <input type="number" placeholder="€" value={item.amount} onChange={e => updateFixedAssetItem(i, 'amount', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                            <button onClick={() => removeFixedAssetItem(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                          </div>
                        ))}
                        <button onClick={addFixedAssetItem} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Προσθήκη είδους παγίου</button>
                      </div>
                      {fixedAssetItems.length > 0 && (
                        <p className={`text-xs mt-1 ${assetItemsMismatch ? 'text-red-600' : 'text-gray-500'}`}>
                          Σύνολο: {assetItemsTotal.toLocaleString('el-GR')} € {assetItemsMismatch && `(πρέπει να ισούται με τα πάγια: ${fixedAssetsNum.toLocaleString('el-GR')} €)`}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Χρονοδιάγραμμα υλοποίησης (μήνες)</label>
                    <input type="number" value={implementationMonths} onChange={e => setImplementationMonths(e.target.value)} className="w-full sm:w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Νόμιμος Εκπρόσωπος (προαιρετικό)</label>
                    <input type="text" value={legalRepresentative} onChange={e => setLegalRepresentative(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Σημειώσεις συμβούλου (προαιρετικό)</label>
                    <textarea value={consultantNotes} onChange={e => setConsultantNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Φορείς Επιχείρησης (μέτοχοι/εταίροι ≥5%)</label>
                    <div className="space-y-2">
                      {owners.map((owner, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_70px_auto] gap-1.5 items-center">
                          <input type="text" placeholder="Επώνυμο" value={owner.surname} onChange={e => updateOwner(i, 'surname', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                          <input type="text" placeholder="Όνομα" value={owner.name} onChange={e => updateOwner(i, 'name', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                          <input type="text" placeholder="ΑΦΜ" value={owner.afm} onChange={e => updateOwner(i, 'afm', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                          <input type="number" placeholder="%" value={owner.percentage} onChange={e => updateOwner(i, 'percentage', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                          <button onClick={() => removeOwner(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                        </div>
                      ))}
                      {owners.length < 3 && (
                        <button onClick={addOwner} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Προσθήκη φορέα</button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={generatePlan}
                    disabled={generating || fixedAssetsTooHigh || breakdownMismatch || assetItemsMismatch}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <FileText size={14} />
                    {generating ? 'Δημιουργία πρόχειρου...' : plan ? 'Δημιουργία νέου πρόχειρου' : 'Δημιουργία Business Plan (πρόχειρο)'}
                  </button>

                  {plan && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3 text-xs text-gray-700 max-h-64 overflow-y-auto">
                      <div><strong>1.1 Συνοπτική Παρουσίαση:</strong>{plan.section1_1.map((p, i) => <p key={i} className="mt-1 whitespace-pre-line">{p}</p>)}</div>
                      <div><strong>2.1 Γενική Περιγραφή:</strong>{plan.section2_1.map((p, i) => <p key={i} className="mt-1 whitespace-pre-line">{p}</p>)}</div>
                      <div><strong>2.2 Πίνακας Δαπανών:</strong>{plan.section2_2.map((p, i) => <p key={i} className="mt-1 whitespace-pre-line">{p}</p>)}</div>
                    </div>
                  )}

                  {plan && (
                    <button
                      onClick={downloadDocx}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
                    >
                      <Download size={14} />
                      Λήψη .docx
                    </button>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
