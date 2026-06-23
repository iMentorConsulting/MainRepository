'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Save, Check, Wand2, EyeOff, Eye } from 'lucide-react'
import { EligibilityQuestion, QuestionOverrides } from '@/lib/eligibility-questions'
import { RequirementClassification } from '@/lib/eligibility-ai'

// Admin-only preview/edit of the Ερμής eligibility questionnaire for this
// program. Questions are generated deterministically from the program's
// "Άλλες Προϋποθέσεις" + extra criteria (no LLM, no cost). Optionally, the
// admin can run a one-time AI classification pass ("Δημιουργία με AI") that
// proposes, per requirement: a plain-language question, or a skip + reason
// when the requirement isn't genuinely answerable by the business owner
// (needs accountant-only data, or is a post-approval obligation, not an
// eligibility criterion). The AI's proposals are never saved automatically —
// the admin reviews/edits every one below, then clicks Αποθήκευση.
export function EligibilityQuestionsEditor({ programId }: { programId: string }) {
  const [questions, setQuestions] = useState<EligibilityQuestion[] | null>(null)
  const [allQuestions, setAllQuestions] = useState<EligibilityQuestion[]>([])
  const [overrides, setOverrides] = useState<QuestionOverrides>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')

  function load() {
    fetch(`/api/programs/${programId}/eligibility-questions`)
      .then(r => r.json())
      .then(d => {
        setQuestions(d.questions || [])
        setAllQuestions(d.allQuestions || [])
        setOverrides(d.overrides || {})
      })
      .catch(() => setQuestions([]))
  }

  useEffect(() => { load() }, [programId])

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await fetch(`/api/programs/${programId}/eligibility-questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      setSaved(true)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function generateWithAi() {
    setGenerating(true)
    setAiError('')
    try {
      const res = await fetch(`/api/programs/${programId}/eligibility-questions/generate-ai`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setAiError(data.error || 'Σφάλμα κατά τη δημιουργία ερωτήσεων με AI'); return }
      const next: QuestionOverrides = { ...overrides }
      ;(data.classifications as RequirementClassification[]).forEach(c => {
        if (c.action === 'ask') {
          next[c.id] = { label: c.question || c.originalText, skip: false, expectedAnswer: c.expectedAnswer }
        } else {
          next[c.id] = { skip: true, skipReason: c.reason || undefined }
        }
      })
      setOverrides(next)
      setSaved(false)
    } catch {
      setAiError('Σφάλμα κατά τη δημιουργία ερωτήσεων με AI')
    } finally {
      setGenerating(false)
    }
  }

  if (!questions) return null

  const skippedIds = allQuestions.filter(q => overrides[q.id]?.skip).map(q => q.id)
  const originalTextById = Object.fromEntries(allQuestions.map(q => [q.id, q.label]))

  function setLabel(id: string, label: string) {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], label, skip: false } }))
    setSaved(false)
  }

  function toggleSkip(id: string, fallbackLabel: string, skip: boolean) {
    setOverrides(prev => ({
      ...prev,
      [id]: skip
        ? { ...prev[id], skip: true }
        : { ...prev[id], skip: false, label: prev[id]?.label || fallbackLabel },
    }))
    setSaved(false)
  }

  function setExpectedAnswer(id: string, expectedAnswer: boolean) {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], expectedAnswer } }))
    setSaved(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-500" />
            Ερωτήσεις Επιλεξιμότητας (Ερμής)
          </span>
          <Button type="button" variant="outline" onClick={generateWithAi} disabled={generating}>
            <Wand2 size={14} />
            {generating ? 'Δημιουργία...' : 'Δημιουργία με AI'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiError && <p className="text-sm text-red-600">{aiError}</p>}
        {questions.length === 0 && skippedIds.length === 0 ? (
          <p className="text-sm text-gray-400">Το πρόγραμμα δεν έχει κριτήρια που να παράγουν ερωτήσεις επιλεξιμότητας.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              ΚΑΔ, περιφέρεια, νομική μορφή και ημερομηνία ίδρυσης είναι ήδη γνωστά από τα στοιχεία της επιχείρησης
              και δεν ξαναρωτιούνται. Ο Ερμής ρωτάει μόνο τα παρακάτω, που προέρχονται από τις «Άλλες Προϋποθέσεις»
              και τα πρόσθετα κριτήρια του προγράμματος. Χρησιμοποιήστε «Δημιουργία με AI» για προτάσεις διατύπωσης
              και για να εντοπίσετε όρους που δεν μπορεί να απαντήσει ο επιχειρηματίας — ελέγξτε τα πριν αποθηκεύσετε.
            </p>
            {questions.map((q, i) => (
              <div key={q.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">Ερώτηση {i + 1}</label>
                  <button
                    type="button"
                    onClick={() => toggleSkip(q.id, q.label, true)}
                    className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                    title="Παράλειψη — δεν θα ρωτηθεί ο επιχειρηματίας"
                  >
                    <EyeOff size={12} /> Παράλειψη
                  </button>
                </div>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
                  value={overrides[q.id]?.label ?? q.label}
                  onChange={e => setLabel(q.id, e.target.value)}
                />
                {q.type === 'number' ? (
                  <p className="text-xs text-gray-400">
                    Αριθμητική ερώτηση — αποδεκτό εύρος:{' '}
                    {q.min != null && q.max != null
                      ? `${q.min.toLocaleString('el-GR')}${q.unit || ''} – ${q.max.toLocaleString('el-GR')}${q.unit || ''}`
                      : q.min != null
                      ? `από ${q.min.toLocaleString('el-GR')}${q.unit || ''}`
                      : q.max != null
                      ? `έως ${q.max.toLocaleString('el-GR')}${q.unit || ''}`
                      : '(χωρίς όριο)'}
                    {' '}(ορίζεται από τα στοιχεία επένδυσης του προγράμματος)
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Σωστή (επιλέξιμη) απάντηση:</span>
                    <button
                      type="button"
                      onClick={() => setExpectedAnswer(q.id, true)}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border ${q.expectedAnswer ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                      Ναι
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpectedAnswer(q.id, false)}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border ${!q.expectedAnswer ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                      Όχι
                    </button>
                  </div>
                )}
              </div>
            ))}

            {skippedIds.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Παραλειπόμενα (δεν εμφανίζονται στον επιχειρηματία)</p>
                {skippedIds.map(id => (
                  <div key={id} className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-amber-900 font-medium">{originalTextById[id]}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{overrides[id]?.skipReason || 'Παραλείπεται.'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSkip(id, overrides[id]?.label || originalTextById[id] || '', false)}
                      className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-1 flex-shrink-0"
                      title="Επαναφορά ως ερώτηση"
                    >
                      <Eye size={12} /> Επαναφορά
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" onClick={save} disabled={saving} className="mt-2">
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? 'Αποθήκευση...' : saved ? 'Αποθηκεύτηκε' : 'Αποθήκευση'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
