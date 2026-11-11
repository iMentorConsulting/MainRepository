'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Cloud, CloudUpload } from 'lucide-react'

interface Question {
  id: string
  section: number
  sectionTitle: string
  text: string
  bold: boolean
}

const AUTOSAVE_DELAY_MS = 1500

export default function MicrocreditsQuestionnairePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Tracks the last answers snapshot that's already persisted (either from
  // the initial load, or from a prior autosave/submit) so the autosave
  // effect below doesn't fire — or hit the network — for a no-op.
  const lastSavedRef = useRef<string>('{}')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/public/microcredits-questionnaire/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Σφάλμα')
        setBusinessName(data.businessName || '')
        setQuestions(data.questions || [])
        const loadedAnswers = data.answers || {}
        setAnswers(loadedAnswers)
        lastSavedRef.current = JSON.stringify(loadedAnswers)
        setAlreadyAnswered(!!data.respondedAt)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  // Autosave: so closing the tab and coming back later (even from another
  // device, since this is saved server-side, not just locally) doesn't lose
  // progress already typed in. Debounced, and skipped entirely if nothing
  // actually changed since the last save.
  useEffect(() => {
    const snapshot = JSON.stringify(answers)
    if (snapshot === lastSavedRef.current) return

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving')
      fetch(`/api/public/microcredits-questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, submit: false }),
      })
        .then(r => {
          if (r.ok) {
            lastSavedRef.current = snapshot
            setSaveStatus('saved')
          } else {
            setSaveStatus('idle')
          }
        })
        .catch(() => setSaveStatus('idle'))
    }, AUTOSAVE_DELAY_MS)

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [answers, token])

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      const res = await fetch(`/api/public/microcredits-questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, submit: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Η υποβολή απέτυχε')
      }
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Φόρτωση...</div>
  }

  if (error && questions.length === 0) {
    return <div className="min-h-screen flex items-center justify-center text-red-600 text-sm px-4 text-center">{error}</div>
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <h1 className="text-lg font-semibold text-gray-900">Ευχαριστούμε!</h1>
          <p className="text-sm text-gray-600">Οι απαντήσεις σας καταχωρήθηκαν. Η ομάδα μας θα επικοινωνήσει μαζί σας για τα επόμενα βήματα.</p>
        </div>
      </div>
    )
  }

  const sections = Array.from(new Set(questions.map(q => q.section))).sort((a, b) => a - b)

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Ερωτηματολόγιο Επιχειρηματικού Σχεδίου</h1>
          <p className="text-sm text-gray-500 mb-3">{businessName} — Ταμείο Μικροπιστώσεων</p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Παρακαλούμε απαντήστε <strong>πολύ επιγραμματικά</strong> στα παρακάτω ερωτήματα, ώστε να προχωρήσουμε στη σύνταξη του επιχειρηματικού σχεδίου. Σε περίπτωση που υπάρχουν ερωτήματα στα οποία δεν είστε σε θέση να απαντήσετε αυτή τη στιγμή, μπορείτε απλώς να τα παραλείψετε και να στείλετε το υπόλοιπο ερωτηματολόγιο.
          </p>
          <p className="text-xs text-gray-400 mt-2">Οι απαντήσεις σας αποθηκεύονται αυτόματα καθώς γράφετε — μπορείτε να κλείσετε τη σελίδα και να συνεχίσετε αργότερα.</p>
          {alreadyAnswered && (
            <p className="text-xs text-amber-600 mt-2">Έχετε ήδη υποβάλει απαντήσεις — μπορείτε να τις επεξεργαστείτε και να τις ξαναστείλετε.</p>
          )}
        </div>

        {sections.map(section => {
          const sectionQuestions = questions.filter(q => q.section === section)
          return (
            <div key={section} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wide">{section}. {sectionQuestions[0]?.sectionTitle}</h2>
              {sectionQuestions.map(q => (
                <div key={q.id}>
                  <label className={`block text-sm mb-1.5 whitespace-pre-line ${q.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {q.text}
                  </label>
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    rows={q.bold ? 2 : 3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          )
        })}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 flex items-center gap-1.5 min-w-0">
            {saveStatus === 'saving' && <><CloudUpload size={13} className="animate-pulse shrink-0" /> Αποθήκευση...</>}
            {saveStatus === 'saved' && <><Cloud size={13} className="shrink-0" /> Αποθηκεύτηκε</>}
          </p>
          <button
            onClick={submit}
            disabled={submitting}
            className="py-3 px-6 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shrink-0"
          >
            {submitting ? 'Υποβολή...' : 'Υποβολή Απαντήσεων'}
          </button>
        </div>
      </div>
    </div>
  )
}
