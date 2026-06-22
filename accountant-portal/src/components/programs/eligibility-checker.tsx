'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'
import { buildEligibilityQuestions, evaluateEligibility, EligibilityAnswers, ProgramEligibilityCriteria, EligibilityCheckResult } from '@/lib/eligibility-questions'

export function EligibilityChecker({ program, labelOverrides }: { program: ProgramEligibilityCriteria; labelOverrides?: Record<string, string> }) {
  const questions = buildEligibilityQuestions(program, labelOverrides || {})
  const [answers, setAnswers] = useState<EligibilityAnswers>({})
  const [result, setResult] = useState<EligibilityCheckResult | null>(null)

  function setAnswer<K extends keyof EligibilityAnswers>(key: K, value: EligibilityAnswers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }))
    setResult(null)
  }

  function toggleTag(tag: string) {
    const current = answers.tags || []
    setAnswer('tags', current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag])
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Έλεγχος Επιλεξιμότητας — {program.title}</h3>
      {questions.map(q => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">{q.label}</label>
          {(q.kind === 'select') && (
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={(answers as any)[q.id] || ''}
              onChange={e => setAnswer(q.id as keyof EligibilityAnswers, e.target.value as any)}
            >
              <option value="">— Επιλέξτε —</option>
              {q.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {q.kind === 'date' && (
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={answers.regdate || ''}
              onChange={e => setAnswer('regdate', e.target.value)}
            />
          )}
          {q.kind === 'number' && (
            <input
              type="number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={q.id === 'investment' ? (answers.investment ?? '') : (answers.zipCode ?? '')}
              onChange={e => setAnswer(q.id === 'investment' ? 'investment' : 'zipCode', (q.id === 'investment' ? Number(e.target.value) : e.target.value) as any)}
            />
          )}
          {q.kind === 'checkboxes' && (
            <div className="flex flex-wrap gap-3">
              {q.options.map(o => (
                <label key={o} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="rounded" checked={(answers.tags || []).includes(o)} onChange={() => toggleTag(o)} />
                  {o}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <Button type="button" onClick={() => setResult(evaluateEligibility(program, answers))}>
        Έλεγχος Επιλεξιμότητας
      </Button>

      {result && (
        <div className="space-y-2 border-t pt-3">
          <div className={`flex items-center gap-2 font-semibold text-sm ${result.eligible ? 'text-green-700' : 'text-red-700'}`}>
            {result.eligible ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {result.eligible ? 'Φαίνεται επιλέξιμο' : 'Δεν φαίνεται επιλέξιμο'}
          </div>
          <ul className="space-y-1 text-xs text-gray-600">
            {result.criteria.map(c => (
              <li key={c.label} className="flex items-center gap-1.5">
                {c.pass ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-red-600" />}
                <span className="font-medium">{c.label}:</span> {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
