'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { X, Send, CheckCircle2, Eye, Calculator } from 'lucide-react'
import { CmSyncControls, CmSyncResult, CM_SYNC_DEFAULT, type CmSyncValue } from '@/components/cm-sync-controls'

interface MicrocreditsEligibilityModalProps {
  businessId: string
  programId: string
  businessHasEmail: boolean
  // 'business' (default) hits /api/businesses/[id]/microcredits-eligibility,
  // for a claimed Business. 'gemi' hits
  // /api/gemi/businesses/[id]/microcredits-eligibility, for an unclaimed
  // ΓΕΜΗ lead (GemiLookup).
  kind?: 'business' | 'gemi'
  onClose: () => void
  onSent?: () => void
}

// ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ-only tool: consultant enters income/profit/proposed
// loan amount, previews the "ΑΝΑΛΥΣΗ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ" email (full per-ΚΑΔ
// eligibility breakdown included), then sends it. See
// src/lib/microcredits-eligibility-email.ts.
export function MicrocreditsEligibilityModal({ businessId, programId, businessHasEmail, kind = 'business', onClose, onSent }: MicrocreditsEligibilityModalProps) {
  const { data: session } = useSession()
  const [income, setIncome] = useState('')
  const [profit, setProfit] = useState('')
  const [proposedAmount, setProposedAmount] = useState('')
  const [consultantName, setConsultantName] = useState(session?.user?.name || '')
  const [customMessage, setCustomMessage] = useState('')

  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewStale, setPreviewStale] = useState(true)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [cmSync, setCmSync] = useState<CmSyncValue>(CM_SYNC_DEFAULT)
  const [cmSyncResult, setCmSyncResult] = useState<{ delivered: boolean; found?: boolean; created?: boolean } | null>(null)
  const [claimed, setClaimed] = useState(false)

  const endpoint = kind === 'gemi'
    ? `/api/gemi/businesses/${businessId}/microcredits-eligibility`
    : `/api/businesses/${businessId}/microcredits-eligibility`

  function markStale() { setPreviewStale(true) }

  function buildBody(sendNow: boolean) {
    return {
      programId,
      income, profit, proposedAmount,
      consultantName: consultantName.trim(),
      customMessage: customMessage || undefined,
      send: sendNow,
      ...(sendNow ? { cmNotify: cmSync.notify, cmLeadStatus: cmSync.leadStatus || undefined, cmReminderDate: cmSync.reminderDate || undefined, cmCreateIfMissing: cmSync.createIfMissing } : {}),
    }
  }

  async function loadPreview() {
    if (!income || !profit || !proposedAmount || !consultantName.trim()) {
      setError('Συμπληρώστε όλα τα πεδία πριν την προεπισκόπηση.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(false)),
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

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(true)),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sent) {
        setSent(true)
        setCmSyncResult(data.cmSync ?? null)
        setClaimed(!!data.claimed)
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
            <Calculator size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900">Ανάλυση Επιλεξιμότητας — Ταμείο Μικροπιστώσεων</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {sent ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={16} /> Το email εστάλη.</p>
              {claimed && <p className="text-xs text-indigo-700">✔️ Η επιχείρηση ανακτήθηκε αυτόματα και μετατράπηκε σε κανονικό πελάτη (δεν είναι πλέον ΓΕΜΗ lead).</p>}
              <CmSyncResult cmSync={cmSyncResult} />
              <button onClick={onClose} className="text-sm text-indigo-600 hover:underline">Κλείσιμο</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Έσοδα τελευταίας χρήσης (€)</label>
                  <input type="number" value={income} onChange={e => { setIncome(e.target.value); markStale() }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Κέρδη τελευταίας χρήσης (€)</label>
                  <input type="number" value={profit} onChange={e => { setProfit(e.target.value); markStale() }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Προτεινόμενο ποσό δανείου (€)</label>
                  <input type="number" value={proposedAmount} onChange={e => { setProposedAmount(e.target.value); markStale() }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Όνομα συμβούλου</label>
                <input type="text" value={consultantName} onChange={e => { setConsultantName(e.target.value); markStale() }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Προσωπικό μήνυμα (προαιρετικό)</label>
                <textarea
                  value={customMessage}
                  onChange={e => { setCustomMessage(e.target.value); markStale() }}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              </div>

              <button
                onClick={loadPreview}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-60"
              >
                <Eye size={14} />
                {loading ? 'Δημιουργία προεπισκόπησης...' : 'Προεπισκόπηση'}
              </button>

              {preview && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Θέμα</label>
                    <p className="text-sm text-gray-800 font-medium">{preview.subject}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Περιεχόμενο {previewStale && <span className="text-amber-600">(ξεπερασμένη — πατήστε ξανά Προεπισκόπηση)</span>}</label>
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

              <CmSyncControls value={cmSync} onChange={setCmSync} />

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                <button
                  onClick={send}
                  disabled={sending || !preview || previewStale || !businessHasEmail}
                  title={previewStale ? 'Ανανεώστε την προεπισκόπηση πρώτα' : undefined}
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
