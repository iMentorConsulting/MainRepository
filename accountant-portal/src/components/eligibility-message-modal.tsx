'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { X, Send, CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react'

interface EligibilityMessageModalProps {
  businessIds?: string[]
  // Accountant-only convenience: send to every one of their own clients
  // without needing to pass every business id from the browser.
  allMyClients?: boolean
  // Admin-only: show an accountant picker and send to every client of
  // whichever office is chosen — admin has no "own" clients, so there's no
  // bare allMyClients equivalent for them. The picker also offers a
  // "no accountant" option for direct I-MENTOR clients.
  allowAdminAccountantPicker?: boolean
  businessCount?: number
  businessCountLabel?: string
  onClose: () => void
  onSent?: () => void
}

const NO_ACCOUNTANT_VALUE = '__none__'

type Preview = { sentEmail: number; sentViber: number; ineligible: number; failed: number }
type TestResult = { found: boolean; businessName?: string | null; afm?: string; programCount?: number; sentEmail: boolean; sentViber: boolean }

// Sends the combined "Βρέθηκαν διαθέσιμα προγράμματα" message (every
// currently-eligible program in one email/Viber, not one per program) to an
// explicit set of businesses. Used from the Matches page bulk action, a
// single business's own page, and the Campaigns page.
export function EligibilityMessageModal({ businessIds, allMyClients, allowAdminAccountantPicker, businessCount, businessCountLabel, onClose, onSent }: EligibilityMessageModalProps) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const needsAccountantPick = isAdmin && allowAdminAccountantPicker

  const [channels, setChannels] = useState<{ email: boolean; viber: boolean }>({ email: true, viber: false })
  const [mode, setMode] = useState<'direct' | 'accountant'>('accountant')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sentEmail: number; sentViber: number; ineligible: number; failed: number; skippedNotOwned: number } | null>(null)
  const [error, setError] = useState('')
  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [targetAccountantId, setTargetAccountantId] = useState('')

  // Dry-run preview: must be (re-)run after any change to target/channels/
  // mode before the real send button becomes usable, so the shown counts
  // can never go stale relative to what a real send would do.
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')

  // Test-send: fires one real message, with real data, at an explicit
  // email/phone before anything is sent to the real target list.
  const [showTest, setShowTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState('')

  useEffect(() => {
    if (!needsAccountantPick) return
    fetch('/api/accountants').then(r => r.json()).then(d => setAccountants(d.accountants || [])).catch(() => {})
  }, [needsAccountantPick])

  const noAccountant = needsAccountantPick && targetAccountantId === NO_ACCOUNTANT_VALUE

  // Any change to who/what/how invalidates the last preview — it no longer
  // describes what a real send would actually do.
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
  }, [targetAccountantId, channels.email, channels.viber, mode])

  const count = businessCount ?? businessIds?.length ?? 0

  function buildTargetBody() {
    if (needsAccountantPick) {
      return noAccountant ? { noAccountant: true } : { targetAccountantId }
    }
    return allMyClients ? { allMyClients: true } : { businessIds }
  }

  function selectedChannelList() {
    return Object.entries(channels).filter(([, v]) => v).map(([k]) => k)
  }

  async function runPreview() {
    if (needsAccountantPick && !targetAccountantId) {
      setPreviewError('Επιλέξτε λογιστικό γραφείο.')
      return
    }
    const selectedChannels = selectedChannelList()
    if (selectedChannels.length === 0) {
      setPreviewError('Επιλέξτε τουλάχιστον ένα κανάλι (Email ή Viber).')
      return
    }
    setPreviewError('')
    setPreviewing(true)
    try {
      const res = await fetch('/api/businesses/eligibility-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTargetBody(),
          channels: selectedChannels,
          mode: isAdmin ? (noAccountant ? 'direct' : mode) : undefined,
          dryRun: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setPreview(data)
      else setPreviewError(data.error || 'Σφάλμα κατά τον υπολογισμό προεπισκόπησης.')
    } catch {
      setPreviewError('Σφάλμα δικτύου.')
    } finally {
      setPreviewing(false)
    }
  }

  async function runTestSend() {
    if (needsAccountantPick && !targetAccountantId) {
      setTestError('Επιλέξτε λογιστικό γραφείο.')
      return
    }
    const selectedChannels = selectedChannelList()
    if (selectedChannels.length === 0) {
      setTestError('Επιλέξτε τουλάχιστον ένα κανάλι (Email ή Viber).')
      return
    }
    if (!testEmail.trim() && !testPhone.trim()) {
      setTestError('Συμπληρώστε ένα email ή τηλέφωνο δοκιμής.')
      return
    }
    setTestError('')
    setTestSending(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/businesses/eligibility-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTargetBody(),
          channels: selectedChannels,
          mode: isAdmin ? (noAccountant ? 'direct' : mode) : undefined,
          testEmail: testEmail.trim() || undefined,
          testPhone: testPhone.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setTestResult(data)
      else setTestError(data.error || 'Σφάλμα κατά τη δοκιμαστική αποστολή.')
    } catch {
      setTestError('Σφάλμα δικτύου.')
    } finally {
      setTestSending(false)
    }
  }

  async function send() {
    if (needsAccountantPick && !targetAccountantId) {
      setError('Επιλέξτε λογιστικό γραφείο.')
      return
    }
    const selectedChannels = selectedChannelList()
    if (selectedChannels.length === 0) {
      setError('Επιλέξτε τουλάχιστον ένα κανάλι (Email ή Viber).')
      return
    }
    if (!preview) {
      setError('Κάντε πρώτα προεπισκόπηση της αποστολής.')
      return
    }
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/businesses/eligibility-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTargetBody(),
          channels: selectedChannels,
          mode: isAdmin ? (noAccountant ? 'direct' : mode) : undefined,
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                {needsAccountantPick
                  ? <>Θα σταλεί σε <strong>όλους τους πελάτες</strong> του λογιστικού γραφείου (ή τους πελάτες χωρίς λογιστή) που θα επιλέξετε ένα μήνυμα με <strong>όλα τα προγράμματα</strong> για τα οποία είναι αυτή τη στιγμή επιλέξιμοι — αντί για ξεχωριστό μήνυμα ανά πρόγραμμα.</>
                  : <>Θα σταλεί {businessCountLabel || `σε ${count} επιχείρηση${count === 1 ? '' : 'εις'}`} ένα μήνυμα με <strong>όλα τα προγράμματα</strong> για τα οποία είναι αυτή τη στιγμή επιλέξιμ{count === 1 ? 'η' : 'ες'} — αντί για ξεχωριστό μήνυμα ανά πρόγραμμα.</>}
              </p>

              {needsAccountantPick && (
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Λογιστικό γραφείο</label>
                  <select
                    value={targetAccountantId}
                    onChange={e => setTargetAccountantId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Επιλέξτε γραφείο...</option>
                    <option value={NO_ACCOUNTANT_VALUE}>— Χωρίς λογιστή (απευθείας πελάτες I-MENTOR) —</option>
                    {accountants.map(a => <option key={a.id} value={a.id}>{a.officeName}</option>)}
                  </select>
                </div>
              )}

              {isAdmin && !noAccountant && (
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

              {/* Mandatory preview step — the real send button stays disabled until this has run against the current settings. */}
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <button
                  onClick={runPreview}
                  disabled={previewing}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-60"
                >
                  {previewing ? 'Υπολογισμός...' : 'Προεπισκόπηση αποστολής'}
                </button>
                {previewError && <p className="text-xs text-red-600">{previewError}</p>}
                {preview && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      Θα σταλούν πραγματικά <strong>{preview.sentEmail} email{preview.sentEmail === 1 ? '' : 's'}</strong> και <strong>{preview.sentViber} μήνυμα{preview.sentViber === 1 ? '' : 'τα'} Viber</strong>.
                      {' '}({preview.ineligible} μη επιλέξιμες αυτή τη στιγμή{preview.failed > 0 ? `, ${preview.failed} αποτυχίες ελέγχου` : ''})
                    </p>
                  </div>
                )}
              </div>

              {/* Test-send section */}
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <button
                  onClick={() => setShowTest(s => !s)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100"
                >
                  <FlaskConical size={14} />
                  Δοκιμαστική αποστολή πριν το πραγματικό στείλετε
                </button>
                {showTest && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-gray-500">Θα σταλεί 1 πραγματικό μήνυμα, με τα πραγματικά δεδομένα της πρώτης επιλέξιμης επιχείρησης του στόχου, στα στοιχεία δοκιμής παρακάτω — καμία πραγματική επιχείρηση δεν ενημερώνεται.</p>
                    <input
                      type="email"
                      placeholder="Email δοκιμής"
                      value={testEmail}
                      onChange={e => setTestEmail(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="tel"
                      placeholder="Τηλέφωνο δοκιμής (Viber)"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={runTestSend}
                      disabled={testSending}
                      className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {testSending ? 'Αποστολή δοκιμής...' : 'Αποστολή δοκιμής'}
                    </button>
                    {testError && <p className="text-xs text-red-600">{testError}</p>}
                    {testResult && (
                      testResult.found ? (
                        <p className="text-xs text-emerald-700">
                          Εστάλη με δείγμα «{testResult.businessName}» (ΑΦΜ {testResult.afm}, {testResult.programCount} πρόγραμμα/τα).
                          {' '}{channels.email && (testResult.sentEmail ? 'Email ✓' : 'Email ✗')}
                          {channels.email && channels.viber ? ' · ' : ''}
                          {channels.viber && (testResult.sentViber ? 'Viber ✓' : 'Viber ✗')}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">Δεν βρέθηκε καμία επιλέξιμη επιχείρηση στο στόχο για δοκιμή.</p>
                      )
                    )}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                <button
                  onClick={send}
                  disabled={sending || !preview}
                  title={!preview ? 'Κάντε πρώτα προεπισκόπηση' : undefined}
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
