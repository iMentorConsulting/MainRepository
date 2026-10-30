'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { X, Send, CheckCircle2 } from 'lucide-react'

interface EligibilityMessageModalProps {
  businessIds?: string[]
  // Accountant-only convenience: send to every one of their own clients
  // without needing to pass every business id from the browser.
  allMyClients?: boolean
  businessCount?: number
  businessCountLabel?: string
  onClose: () => void
  onSent?: () => void
}

// Sends the combined "Βρέθηκαν διαθέσιμα προγράμματα" message (every
// currently-eligible program in one email/Viber, not one per program) to an
// explicit set of businesses. Used from the Matches page bulk action, a
// single business's own page, and the Campaigns page.
export function EligibilityMessageModal({ businessIds, allMyClients, businessCount, businessCountLabel, onClose, onSent }: EligibilityMessageModalProps) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [channels, setChannels] = useState<{ email: boolean; viber: boolean }>({ email: true, viber: false })
  const [mode, setMode] = useState<'direct' | 'accountant'>('accountant')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sentEmail: number; sentViber: number; ineligible: number; failed: number; skippedNotOwned: number } | null>(null)
  const [error, setError] = useState('')

  const count = businessCount ?? businessIds?.length ?? 0

  async function send() {
    const selectedChannels = Object.entries(channels).filter(([, v]) => v).map(([k]) => k)
    if (selectedChannels.length === 0) {
      setError('Επιλέξτε τουλάχιστον ένα κανάλι (Email ή Viber).')
      return
    }
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/businesses/eligibility-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(allMyClients ? { allMyClients: true } : { businessIds }),
          channels: selectedChannels,
          mode: isAdmin ? mode : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(data)
        onSent?.()
      } else {
        setError(data.error || 'Σφάλμα κατά την αποστολή.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Email/Viber Επιλεξιμότητας</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={16} /> Η αποστολή ολοκληρώθηκε.</p>
              <ul className="text-sm text-gray-600 space-y-0.5">
                {channels.email && <li>Email: {result.sentEmail} απεστάλησαν</li>}
                {channels.viber && <li>Viber: {result.sentViber} απεστάλησαν</li>}
                <li>Μη επιλέξιμες αυτή τη στιγμή: {result.ineligible}</li>
                {result.failed > 0 && <li className="text-red-600">Απέτυχαν: {result.failed}</li>}
                {result.skippedNotOwned > 0 && <li className="text-amber-600">Παραλήφθηκαν (δεν ανήκουν σε εσάς): {result.skippedNotOwned}</li>}
              </ul>
              <button onClick={onClose} className="mt-2 text-sm text-indigo-600 hover:underline">Κλείσιμο</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Θα σταλεί {businessCountLabel || `σε ${count} επιχείρηση${count === 1 ? '' : 'εις'}`} ένα μήνυμα με <strong>όλα τα προγράμματα</strong> για τα οποία είναι αυτή τη στιγμή επιλέξιμ{count === 1 ? 'η' : 'ες'} — αντί για ξεχωριστό μήνυμα ανά πρόγραμμα.
              </p>

              {isAdmin && (
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Αποστολή ως</label>
                  <select
                    value={mode}
                    onChange={e => setMode(e.target.value as 'direct' | 'accountant')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="direct">Απευθείας από I-MENTOR</option>
                    <option value="accountant">Μέσω λογιστή (αναφέρεται το γραφείο, όπου υπάρχει)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Κανάλι</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input type="checkbox" checked={channels.email} onChange={e => setChannels(c => ({ ...c, email: e.target.checked }))} />
                    Email
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input type="checkbox" checked={channels.viber} onChange={e => setChannels(c => ({ ...c, viber: e.target.checked }))} />
                    Viber
                  </label>
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                <button
                  onClick={send}
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Send size={14} />
                  {sending ? 'Αποστολή...' : 'Αποστολή'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
