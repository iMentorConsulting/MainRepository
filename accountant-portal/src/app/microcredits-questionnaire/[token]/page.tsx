'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

interface Question {
  id: string
  section: number
  sectionTitle: string
  text: string
  bold: boolean
}

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

  useEffect(() => {
    fetch(`/api/public/microcredits-questionnaire/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Σφάλμα')
        setBusinessName(data.businessName || '')
        setQuestions(data.questions || [])
        setAnswers(data.answers || {})
        setAlreadyAnswered(!!data.respondedAt)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/public/microcredits-questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
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
          <p className="text-sm text-gray-500">{businessName} — Ταμείο Μικροπιστώσεων</p>
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

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Υποβολή...' : 'Υποβολή Απαντήσεων'}
        </button>
      </div>
    </div>
  )
}
