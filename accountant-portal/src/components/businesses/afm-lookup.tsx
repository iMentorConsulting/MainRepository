'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, CheckCircle, AlertCircle } from 'lucide-react'

interface AfmData {
  afm: string
  onomasia: string
  commercialTitle: string
  legalStatusDescr: string
  firmFlagDescr: string
  iNiFlagDescr: string
  deactivationFlag: string
  deactivationFlagDescr: string
  regdate: string
  stopDate: string
  postalAddress: string
  postalAddressNo: string
  postalZipCode: string
  postalAreaDescription: string
  doy: string
  doyDescr: string
  activities: Array<{
    firmActCode: string
    firmActDescr: string
    firmActKind: number
    firmActKindDescr: string
  }>
}

interface AfmLookupProps {
  onResult: (data: AfmData) => void
}

export function AfmLookup({ onResult }: AfmLookupProps) {
  const [afm, setAfm] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLookup() {
    if (!afm || afm.length !== 9) {
      setErrorMessage('Εισάγετε έγκυρο ΑΦΜ (9 ψηφία)')
      setStatus('error')
      return
    }
    setLoading(true)
    setStatus('idle')
    setErrorMessage('')
    try {
      const res = await fetch(`/api/afm?afm=${afm}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Σφάλμα αναζήτησης')
      setStatus('success')
      onResult(data)
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err.message || 'Σφάλμα αναζήτησης ΑΦΜ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
      <h3 className="text-sm font-semibold text-blue-800 mb-3">Αναζήτηση από ΓΓΠΣ (GSIS)</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={afm}
          onChange={e => setAfm(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="Εισάγετε ΑΦΜ (9 ψηφία)"
          className="flex-1 rounded-lg border border-blue-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={e => e.key === 'Enter' && handleLookup()}
          maxLength={9}
        />
        <Button onClick={handleLookup} loading={loading} size="md">
          <Search size={16} className="mr-1" />
          Αναζήτηση
        </Button>
      </div>
      {status === 'success' && (
        <div className="mt-2 flex items-center gap-1 text-green-700 text-xs">
          <CheckCircle size={14} />
          <span>Τα στοιχεία βρέθηκαν και συμπληρώθηκαν</span>
        </div>
      )}
      {status === 'error' && (
        <div className="mt-2 flex items-center gap-1 text-red-700 text-xs">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}
