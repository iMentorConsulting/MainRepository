'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'

export default function PublicMatchPage() {
  const { token } = useParams<{ token: string }>()
  const [business, setBusiness] = useState<{ name: string } | null>(null)
  const [program, setProgram] = useState<{ title: string; description: string | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/match/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Σφάλμα'); return }
        setBusiness(data.business)
        setProgram(data.program)
      })
      .catch(() => setError('Σφάλμα φόρτωσης'))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-lg w-full text-center">
        <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={24} />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Ερμής</h1>
        <p className="text-sm text-slate-500 mb-6">Ο ψηφιακός σύμβουλος επιλεξιμότητας του I-MENTOR</p>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !program ? (
          <p className="text-sm text-slate-400">Φόρτωση...</p>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-2">
              Γεια σου{business ? ` ${business.name}` : ''}! Είδα ότι ταιριάζεις με το πρόγραμμα:
            </p>
            <p className="text-base font-semibold text-slate-900 mb-4">{program.title}</p>
            <p className="text-xs text-slate-500">
              Σύντομα θα μπορώ να σου κάνω μερικές ερωτήσεις για να επιβεβαιώσω ότι είσαι επιλέξιμος/η.
              Στο μεταξύ, ο λογιστής σου μπορεί να σε ενημερώσει για τα επόμενα βήματα.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
