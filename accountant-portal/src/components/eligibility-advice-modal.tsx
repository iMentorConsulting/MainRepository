'use client'
import { useEffect, useState } from 'react'
import { X, Send, CheckCircle2, Eye, RefreshCw, MessageSquare, ChevronDown, ChevronUp, CornerDownLeft, Plus, Trash2, RotateCcw } from 'lucide-react'
import { CmSyncControls, CmSyncResult, CM_SYNC_DEFAULT, type CmSyncValue } from '@/components/cm-sync-controls'

// Mirrors DEFAULT_ADVICE_QUESTIONS in src/lib/eligibility-advice-email.ts —
// kept as a separate client-side copy so this component doesn't need to
// import a server-side email-building module just for 3 strings.
const DEFAULT_QUESTIONS = [
  'Τι επένδυση σκέφτομαι',
  'Κατά προσέγγιση κόστος (σε €)',
  'Ερωτήσεις μου (αν έχω)',
]

interface EligibilityAdviceModalProps {
  businessId: string
  programId: string
  programTitle: string
  businessHasEmail: boolean
  // 'business' (default) hits /api/businesses/[id]/eligibility-advice, for
  // a claimed Business. 'gemi' hits
  // /api/gemi/businesses/[id]/eligibility-advice, for an unclaimed ΓΕΜΗ
  // lead (GemiLookup/GemiProgramMatch/GemiMatchToken).
  kind?: 'business' | 'gemi'
  onClose: () => void
  onSent?: () => void
}

type ErmisChatMsg = { role: 'user' | 'assistant'; text: string }

// Admin/consultant tool: short "you're eligible, here's what the grant is
// worth, here's what to do next" email — asks the prospect to reply with
// their own investment idea, a rough cost estimate, and any questions. See
// src/lib/eligibility-advice-email.ts.
export function EligibilityAdviceModal({ businessId, programId, programTitle, businessHasEmail, kind = 'business', onClose, onSent }: EligibilityAdviceModalProps) {
  const endpoint = kind === 'gemi'
    ? `/api/gemi/businesses/${businessId}/eligibility-advice`
    : `/api/businesses/${businessId}/eligibility-advice`
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string; detectedAmount: number | null; ermisChatLog: ErmisChatMsg[] } | null>(null)
  const [sent, setSent] = useState(false)
  const [cmSync, setCmSync] = useState<CmSyncValue>(CM_SYNC_DEFAULT)
  const [cmSyncResult, setCmSyncResult] = useState<{ delivered: boolean; found?: boolean; created?: boolean } | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [error, setError] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [includeErmisAmount, setIncludeErmisAmount] = useState(true)
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [previewStale, setPreviewStale] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS)

  function updateQuestion(i: number, text: string) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? text : q))
    setPreviewStale(true)
  }
  function removeQuestion(i: number) {
    setQuestions(prev => prev.filter((_, idx) => idx !== i))
    setPreviewStale(true)
  }
  function addQuestion() {
    setQuestions(prev => [...prev, ''])
  }
  function resetQuestions() {
    setQuestions(DEFAULT_QUESTIONS)
    setPreviewStale(true)
  }

  async function loadPreview(message: string, includeAmount: boolean, invAmount: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId, send: false, customMessage: message || undefined, includeErmisAmount: includeAmount,
          investmentAmount: invAmount ? Number(invAmount) : undefined,
          questions: questions.map(q => q.trim()).filter(Boolean),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setPreview({ subject: data.subject, html: data.html, detectedAmount: data.detectedAmount ?? null, ermisChatLog: data.ermisChatLog ?? [] })
        setPreviewStale(false)
      } else {
        setError(data.error || 'Σφάλμα δημιουργίας προεπισκόπησης.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPreview('', true, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, programId])

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId, send: true, customMessage: customMessage || undefined, includeErmisAmount,
          investmentAmount: investmentAmount ? Number(investmentAmount) : undefined,
          questions: questions.map(q => q.trim()).filter(Boolean),
          cmNotify: cmSync.notify, cmLeadStatus: cmSync.leadStatus || undefined, cmReminderDate: cmSync.reminderDate || undefined, cmCreateIfMissing: cmSync.createIfMissing,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sent) {
        setSent(true)
        setCmSyncResult(data.cmSync ?? null)
        setClaimed(!!data.claimed)
        onSent?.()
      } else {
        setError(data.error || 'Η αποστολή απέτυχε.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900">Ενημέρωση & Επόμενα Βήματα — {programTitle}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {sent ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={16} /> Το email εστάλη.</p>
              {claimed && <p className="text-xs text-indigo-700">✔️ Η επιχείρηση ανακτήθηκε αυτόματα και μετατράπηκε σε κανονικό πελάτη (δεν είναι πλέον ΓΕΜΗ lead).</p>}
              <CmSyncResult cmSync={cmSyncResult} />
              <button onClick={onClose} className="text-sm text-indigo-600 hover:underline">Κλείσιμο</button>
            </div>
          ) : (
            <>
              {!!preview?.ermisChatLog?.length && (
                <div className="border border-purple-200 bg-purple-50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowChat(s => !s)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-purple-800"
                  >
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={13} />
                      Συνομιλία με τον Ερμή για αυτό το πρόγραμμα ({preview.ermisChatLog.length} μηνύματα)
                    </span>
                    {showChat ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showChat && (
                    <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-2">
                      {preview.ermisChatLog.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`group relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${m.role === 'user' ? 'bg-white border border-purple-200 text-gray-800' : 'bg-purple-100 text-purple-900'}`}>
                            <p className="whitespace-pre-wrap">{m.text}</p>
                            <button
                              onClick={() => { setCustomMessage(prev => prev ? `${prev}\n${m.text}` : m.text); setPreviewStale(true) }}
                              title="Προσθήκη στο προσωπικό μήνυμα"
                              className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 hover:underline opacity-70 hover:opacity-100"
                            >
                              <CornerDownLeft size={10} /> Προσθήκη στο μήνυμα
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {preview?.detectedAmount != null && (
                <label className="flex items-center gap-2 text-xs text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeErmisAmount}
                    onChange={e => { setIncludeErmisAmount(e.target.checked); setPreviewStale(true) }}
                    className="cursor-pointer accent-indigo-600"
                  />
                  Εντοπίστηκε ποσό επένδυσης στη συζήτηση με τον Ερμή (~{preview.detectedAmount.toLocaleString('el-GR')}€) — να αναφερθεί στο email
                </label>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Ποσό επένδυσης € (προαιρετικό — αν συμπληρωθεί, προστίθεται στο email το δικό μας κοστολόγιο για το ποσό αυτό)</label>
                <input
                  type="number"
                  value={investmentAmount}
                  onChange={e => { setInvestmentAmount(e.target.value); setPreviewStale(true) }}
                  placeholder="π.χ. 150000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">Ερωτήσεις προς τον πελάτη (Ενότητα Β)</label>
                  <button type="button" onClick={resetQuestions} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600">
                    <RotateCcw size={11} /> Επαναφορά προεπιλογών
                  </button>
                </div>
                <div className="space-y-1.5">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={q}
                        onChange={e => updateQuestion(i, e.target.value)}
                        placeholder="π.χ. Πότε θα θέλατε να ξεκινήσει η επένδυση;"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                      />
                      <button type="button" onClick={() => removeQuestion(i)} className="text-gray-400 hover:text-red-600 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="mt-1.5 flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <Plus size={12} /> Προσθήκη ερώτησης
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Προσωπικό μήνυμα (προαιρετικό)</label>
                <textarea
                  value={customMessage}
                  onChange={e => { setCustomMessage(e.target.value); setPreviewStale(true) }}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              </div>

              {loading && <p className="text-sm text-gray-500">Δημιουργία προεπισκόπησης...</p>}
              {!loading && preview && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Θέμα</label>
                    <p className="text-sm text-gray-800 font-medium">{preview.subject}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Περιεχόμενο</label>
                      {previewStale && (
                        <button
                          onClick={() => loadPreview(customMessage, includeErmisAmount, investmentAmount)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        >
                          <RefreshCw size={11} /> Ανανέωση προεπισκόπησης
                        </button>
                      )}
                    </div>
                    <iframe
                      title="Προεπισκόπηση email"
                      srcDoc={preview.html}
                      sandbox=""
                      className="w-full h-[420px] rounded-lg border border-gray-200"
                    />
                  </div>
                  {!businessHasEmail && (
                    <p className="text-xs text-amber-600">Η επιχείρηση δεν έχει καταχωρημένο email — προσθέστε ένα για να μπορέσετε να στείλετε.</p>
                  )}
                </>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}

              <CmSyncControls value={cmSync} onChange={setCmSync} />

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                <button
                  onClick={send}
                  disabled={sending || loading || !preview || !businessHasEmail}
                  title={previewStale ? 'Θα σταλεί με τις τελευταίες ρυθμίσεις, ανανεώστε την προεπισκόπηση για να τις δείτε' : undefined}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Send size={14} />
                  {sending ? 'Αποστολή...' : 'Αποστολή στον πελάτη'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
