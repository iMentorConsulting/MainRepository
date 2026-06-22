'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, BadgeEuro } from 'lucide-react'
import {
  buildEligibilityQuestions, evaluateQualitativeAnswers,
  buildPitch, ProgramPitchInfo, ProgramQualitativeCriteria, QuestionOverrides,
} from '@/lib/eligibility-questions'

interface EligibilityCheckerProps {
  program: ProgramPitchInfo & ProgramQualitativeCriteria
  // Facts already known from the business's own record + the existing
  // ProgramMatch — shown as confirmed, never re-asked.
  autoConfirmedReasons: string[]
  overrides?: QuestionOverrides
}

export function EligibilityChecker({ program, autoConfirmedReasons, overrides }: EligibilityCheckerProps) {
  const questions = buildEligibilityQuestions(program, overrides || {})
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const allAnswered = questions.every(q => answers[q.id] !== undefined)
  const result = submitted ? evaluateQualitativeAnswers(questions, answers) : null

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3">
        <BadgeEuro size={20} className="text-indigo-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-900 font-medium leading-relaxed">{buildPitch(program)}</p>
      </div>

      {autoConfirmedReasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ήδη επιβεβαιωμένα από τα στοιχεία σας</p>
          {autoConfirmedReasons.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
              <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
              {r}
            </div>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Μερικές ακόμη ερωτήσεις</p>
          {questions.map(q => (
            <div key={q.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-slate-800">{q.label}</p>
              <div className="flex gap-1.5 flex-shrink-0">
                {/* Selection is shown neutrally (indigo), never green/red —
                    which answer is "correct" depends on each question's
                    expectedAnswer (e.g. for disqualifying conditions, Όχι is
                    the eligible answer), so Ναι is not always the good one. */}
                <button
                  type="button"
                  onClick={() => { setAnswers(prev => ({ ...prev, [q.id]: true })); setSubmitted(false) }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold border ${answers[q.id] === true ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  Ναι
                </button>
                <button
                  type="button"
                  onClick={() => { setAnswers(prev => ({ ...prev, [q.id]: false })); setSubmitted(false) }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold border ${answers[q.id] === false ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  Όχι
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type="button" onClick={() => setSubmitted(true)} disabled={!allAnswered} className="w-full">
        Έλεγχος Επιλεξιμότητας
      </Button>

      {result && (
        <div className={`flex items-center gap-2 font-semibold text-sm rounded-lg px-3 py-2.5 ${result.eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {result.eligible ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {result.eligible ? 'Φαίνεστε επιλέξιμοι! Ο λογιστής σας θα επικοινωνήσει μαζί σας.' : 'Δυστυχώς δεν φαίνεστε επιλέξιμοι με βάση τις παραπάνω απαντήσεις.'}
        </div>
      )}
    </div>
  )
}
