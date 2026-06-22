'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { EligibilityChecker } from '@/components/programs/eligibility-checker'
import { ProgramPitchInfo, ProgramQualitativeCriteria, QuestionOverrides } from '@/lib/eligibility-questions'

type PublicProgram = { title: string; description: string | null; eligibilityQuestions: QuestionOverrides | null }
  & ProgramPitchInfo & ProgramQualitativeCriteria

export default function PublicMatchPage() {
  const { token } = useParams<{ token: string }>()
  const [business, setBusiness] = useState<{ name: string } | null>(null)
  const [program, setProgram] = useState<PublicProgram | null>(null)
  const [autoConfirmedReasons, setAutoConfirmedReasons] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/match/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Σφάλμα'); return }
        setBusiness(data.business)
        setProgram(data.program)
        setAutoConfirmedReasons(data.autoConfirmedReasons || [])
      })
      .catch(() => setError('Σφάλμα φόρτωσης'))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">Ερμής</h1>
          <p className="text-sm text-slate-500">Ο ψηφιακός σύμβουλος επιλεξιμότητας του I-MENTOR</p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 text-center">{error}</p>
        ) : !program ? (
          <p className="text-sm text-slate-400 text-center">Φόρτωση...</p>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-4 text-center">
              Γεια σου{business ? ` ${business.name}` : ''}!
            </p>
            <EligibilityChecker
              program={program}
              autoConfirmedReasons={autoConfirmedReasons}
              overrides={program.eligibilityQuestions || {}}
            />
          </>
        )}
      </div>
    </div>
  )
}
