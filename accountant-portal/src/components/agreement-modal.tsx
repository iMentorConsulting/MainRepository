'use client'
import { useState } from 'react'
import { X, FileText, Download } from 'lucide-react'

interface AgreementModalProps {
  businessId: string
  programId: string
  programTitle: string
  // 'business' (default) hits /api/businesses/[id]/agreement, for a claimed
  // Business. 'gemi' hits /api/gemi/businesses/[id]/agreement, for an
  // unclaimed ΓΕΜΗ lead (GemiLookup) — same modal, same .docx template.
  kind?: 'business' | 'gemi'
  onClose: () => void
}

// Admin/consultant-only: asks for the two agreement fees and downloads the
// prefilled "ΣΥΜΦΩΝΗΤΙΚΟ ΣΥΝΕΡΓΑΣΙΑΣ" .docx for this business + program.
// See src/lib/agreement-docx.ts.
export function AgreementModal({ businessId, programId, programTitle, kind = 'business', onClose }: AgreementModalProps) {
  const [applicationFee, setApplicationFee] = useState('')
  const [implementationFee, setImplementationFee] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const endpoint = kind === 'gemi'
    ? `/api/gemi/businesses/${businessId}/agreement`
    : `/api/businesses/${businessId}/agreement`

  async function download() {
    if (!implementationFee) {
      setError('Η αμοιβή υλοποίησης επένδυσης είναι υποχρεωτική.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          applicationFee: applicationFee || undefined,
          implementationFee,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Η δημιουργία του συμφωνητικού απέτυχε.')
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || 'Symfonitiko.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-indigo-500 shrink-0" />
            <h2 className="text-base font-semibold text-gray-900 truncate">Συμφωνητικό Συνεργασίας — {programTitle}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Αμοιβή Αίτησης (€) — προαιρετικό</label>
            <input
              type="number" value={applicationFee} onChange={e => setApplicationFee(e.target.value)}
              placeholder="Αν κενό, δεν θα αναφέρεται στο συμφωνητικό"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Αμοιβή Υλοποίησης Επένδυσης (€) *</label>
            <input
              type="number" value={implementationFee} onChange={e => setImplementationFee(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
            <button
              onClick={download}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              <Download size={14} />
              {loading ? 'Δημιουργία...' : 'Λήψη Συμφωνητικού'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
