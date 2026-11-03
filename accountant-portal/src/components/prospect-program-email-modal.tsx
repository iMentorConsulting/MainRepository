'use client'
import { useEffect, useState } from 'react'
import { X, Send, CheckCircle2, Eye, RefreshCw } from 'lucide-react'

interface ProspectProgramEmailModalProps {
  businessId: string
  programId: string
  programTitle: string
  businessHasEmail: boolean
  onClose: () => void
  onSent?: () => void
}

// Admin/consultant tool for a prospect conversation: preview, then send, one
// focused email about ONE program — the business's own data, why it
// specifically qualifies, that program's info, and an optional custom note
// (e.g. "Απαντήστε μας με το Ε3 2025"). See
// src/lib/eligibility-email.ts buildProspectProgramEmailHtml.
export function ProspectProgramEmailModal({ businessId, programId, programTitle, businessHasEmail, onClose, onSent }: ProspectProgramEmailModalProps) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [previewStale, setPreviewStale] = useState(false)

  async function loadPreview(message: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/program-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, send: false, customMessage: message || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setPreview({ subject: data.subject, html: data.html })
        setPreviewStale(false)
      } else {
        setError(data.error || 'Σφάλμα δημιουργίας προεπισκόπησης.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPreview('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, programId])

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${businessId}/program-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, send: true, customMessage: customMessage || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sent) {
        setSent(true)
        onSent?.()
      } else {
        setError(data.error || 'Η αποστολή απέτυχε.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900">Προεπισκόπηση — {programTitle}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {sent ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={16} /> Το email εστάλη.</p>
              <button onClick={onClose} className="text-sm text-indigo-600 hover:underline">Κλείσιμο</button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Προσωπικό μήνυμα (προαιρετικό)</label>
                <textarea
                  value={customMessage}
                  onChange={e => { setCustomMessage(e.target.value); setPreviewStale(true) }}
                  placeholder="π.χ. Απαντήστε μας με το Ε3 2025"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              </div>

              {loading && <p className="text-sm text-gray-500">Δημιουργία προεπισκόπησης...</p>}
              {!loading && preview && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Θέμα</label>
                    <p className="text-sm text-gray-800 font-medium">{preview.subject}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Περιεχόμενο</label>
                      {previewStale && (
                        <button
                          onClick={() => loadPreview(customMessage)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        >
                          <RefreshCw size={11} /> Ανανέωση προεπισκόπησης
                        </button>
                      )}
                    </div>
                    <iframe
                      title="Προεπισκόπηση email"
                      srcDoc={preview.html}
                      sandbox=""
                      className="w-full h-[420px] rounded-lg border border-gray-200"
                    />
                  </div>
                  {!businessHasEmail && (
                    <p className="text-xs text-amber-600">Η επιχείρηση δεν έχει καταχωρημένο email — προσθέστε ένα για να μπορέσετε να στείλετε.</p>
                  )}
                </>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                <button
                  onClick={send}
                  disabled={sending || loading || !preview || !businessHasEmail}
                  title={previewStale ? 'Θα σταλεί με το τελευταίο προσωπικό μήνυμα, ανανεώστε την προεπισκόπηση για να το δείτε' : undefined}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Send size={14} />
                  {sending ? 'Αποστολή...' : 'Αποστολή στον πελάτη'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
