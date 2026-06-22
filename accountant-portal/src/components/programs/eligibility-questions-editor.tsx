'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Save, Check } from 'lucide-react'
import { EligibilityQuestion } from '@/lib/eligibility-questions'

// Admin-only preview of the auto-generated Ερμής eligibility questionnaire
// for this program. Generation is rule-based (no LLM) from the program's
// already-extracted fields; this editor lets an admin tweak the wording of
// individual questions before they go live on the public /match/[token] page.
export function EligibilityQuestionsEditor({ programId }: { programId: string }) {
  const [questions, setQuestions] = useState<EligibilityQuestion[] | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function load() {
    fetch(`/api/programs/${programId}/eligibility-questions`)
      .then(r => r.json())
      .then(d => {
        setQuestions(d.questions || [])
        setLabels(Object.fromEntries((d.questions || []).map((q: EligibilityQuestion) => [q.id, q.label])))
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
        body: JSON.stringify({ overrides: labels }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!questions) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          Ερωτήσεις Επιλεξιμότητας (Ερμής)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400">Το πρόγραμμα δεν έχει κριτήρια που να παράγουν ερωτήσεις επιλεξιμότητας.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              ΚΑΔ, περιφέρεια, νομική μορφή και ημερομηνία ίδρυσης είναι ήδη γνωστά από τα στοιχεία της επιχείρησης
              και δεν ξαναρωτιούνται. Ο Ερμής ρωτάει μόνο τα παρακάτω, που προέρχονται από τις «Άλλες Προϋποθέσεις»
              και τα πρόσθετα κριτήρια του προγράμματος. Μπορείτε να αλλάξετε τη διατύπωση παρακάτω αν χρειάζεται.
            </p>
            {questions.map((q, i) => (
              <div key={q.id} className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Ερώτηση {i + 1}</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
                  value={labels[q.id] ?? q.label}
                  onChange={e => { setLabels(prev => ({ ...prev, [q.id]: e.target.value })); setSaved(false) }}
                />
              </div>
            ))}
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
