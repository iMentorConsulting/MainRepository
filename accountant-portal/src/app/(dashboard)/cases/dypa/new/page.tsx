'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'

export default function NewDypaAssignmentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const businessId = searchParams.get('businessId') || ''
  const programId = searchParams.get('programId') || ''
  const [error, setError] = useState('')

  useEffect(() => {
    if (!businessId || !programId) {
      setError('Λείπουν στοιχεία επιχείρησης ή προγράμματος.')
      return
    }
    fetch('/api/cases/dypa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, programId }),
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Σφάλμα δημιουργίας ανάθεσης')
        return
      }
      const data = await res.json()
      router.replace(`/cases/dypa/${data.id}`)
    }).catch(() => setError('Σφάλμα δικτύου'))
  }, [businessId, programId])

  return (
    <div className="max-w-xl mx-auto py-24 text-center">
      {error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-indigo-600" size={28} />
          <p className="flex items-center gap-2 text-sm"><Sparkles size={16} className="text-indigo-500" /> Δημιουργία ανάθεσης πρόσληψης ανέργου ΔΥΠΑ...</p>
        </div>
      )}
    </div>
  )
}
