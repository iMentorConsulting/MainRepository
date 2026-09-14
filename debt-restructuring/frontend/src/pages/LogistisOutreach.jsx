import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

const STATUS_PIPELINE = [
  { key: 'assigned',    label: 'Ανατέθηκε',    color: 'bg-gray-100 text-gray-700' },
  { key: 'called',      label: 'Κλήθηκε',      color: 'bg-blue-100 text-blue-700' },
  { key: 'meeting_set', label: 'Ραντεβού',      color: 'bg-yellow-100 text-yellow-700' },
  { key: 'demo_done',   label: 'Demo έγινε',    color: 'bg-purple-100 text-purple-700' },
  { key: 'converted',   label: 'Έκλεισε ✅',   color: 'bg-green-100 text-green-700' },
  { key: 'rejected',    label: 'Αρνήθηκε ✗',   color: 'bg-red-100 text-red-700' },
]

const TERMINAL = new Set(['converted', 'rejected'])

export default function LogistisOutreach({ currentEmployee }) {
  const [data, setData] = useState(undefined) // undefined = loading
  const [errMsg, setErrMsg] = useState(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const load = () => {
    setData(undefined)
    setErrMsg(null)
    api.getMyAccountantAssignment()
      .then(r => {
        setData(r.data)
        setNotes(r.data?.assignment?.notes || '')
      })
      .catch(e => {
        const status = e?.response?.status
        const detail = e?.response?.data?.detail || e?.message || 'unknown'
        setErrMsg(`HTTP ${status ?? '?'}: ${detail}`)
        setData(null)
      })
  }

  useEffect(() => { load() }, [])

  const handleStatus = async (newStatus) => {
    setSaving(true)
    try {
      await api.updateAccountantStatus(newStatus, notes)
      toast.success('Ενημερώθηκε')
      load()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const handleAssignNext = async () => {
    setAssigning(true)
    try {
      const r = await api.assignNextAccountant()
      if (r.data.assigned) {
        toast.success('Νέος λογιστής ανατέθηκε!')
        load()
      } else {
        toast('Δεν υπάρχουν διαθέσιμοι λογιστές αυτή τη στιγμή', { icon: 'ℹ️' })
      }
    } catch (e) {
      const msg = e?.response?.data?.detail
      if (msg?.includes('Already has')) {
        toast('Έχεις ήδη ενεργή ανάθεση', { icon: 'ℹ️' })
      } else {
        toast.error('Σφάλμα ανάθεσης')
      }
    } finally { setAssigning(false) }
  }

  const saveNotes = async () => {
    if (!data?.assignment) return
    setSaving(true)
    try {
      await api.updateAccountantStatus(data.assignment.status, notes)
      toast.success('Σημειώσεις αποθηκεύτηκαν')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const acc = data?.accountant
  const asgn = data?.assignment
  const isDone = asgn && TERMINAL.has(asgn.status)
  const currentStep = STATUS_PIPELINE.findIndex(s => s.key === asgn?.status)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-blue-800 mb-1">Outreach Λογιστών</h1>
      <p className="text-gray-500 text-sm mb-6">Προσέγγισε τον ανατεθειμένο λογιστή και πρότεινε δωρεάν εκτίμηση για τους πελάτες του.</p>

      {data === undefined && (
        <div className="text-gray-400 text-sm py-12 text-center">Φόρτωση...</div>
      )}

      {data === null && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">
          <div className="font-semibold mb-1">Σφάλμα σύνδεσης</div>
          {errMsg && <div className="text-xs font-mono mt-1">{errMsg}</div>}
        </div>
      )}

      {data !== undefined && data !== null && !asgn && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600 mb-4">Δεν έχεις ανατεθεί λογιστή ακόμα.</p>
          <button
            onClick={handleAssignNext}
            disabled={assigning}
            className="btn-primary px-6"
          >
            {assigning ? 'Αναζήτηση...' : 'Ανάθεση Επόμενου Λογιστή'}
          </button>
        </div>
      )}

      {asgn && (
        <div className="space-y-4">
          {/* Accountant card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            {acc ? (
              <>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Λογιστής</div>
                    <div className="text-xl font-black text-gray-800">{acc.name}</div>
                    {acc.office_name && <div className="text-sm text-gray-500 mt-0.5">{acc.office_name}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-0.5">Πελάτες</div>
                    <div className="text-2xl font-black text-blue-700">{acc.client_count ?? '—'}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {acc.phone && (
                    <a href={`tel:${acc.phone}`} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-blue-700 hover:bg-blue-100 transition-colors font-medium">
                      📞 {acc.phone}
                    </a>
                  )}
                  {acc.email && (
                    <a href={`mailto:${acc.email}`} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors truncate">
                      ✉️ {acc.email}
                    </a>
                  )}
                  {acc.city && (
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-600">
                      📍 {acc.city}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-sm">Τα στοιχεία του λογιστή δεν είναι διαθέσιμα αυτή τη στιγμή.</div>
            )}
          </div>

          {/* Status pipeline */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Κατάσταση</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_PIPELINE.map((s, i) => {
                const isActive = asgn.status === s.key
                const isPast = i < currentStep
                return (
                  <button
                    key={s.key}
                    disabled={saving || isDone}
                    onClick={() => handleStatus(s.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                      isActive
                        ? `${s.color} border-current scale-105 shadow-sm`
                        : isPast
                          ? 'bg-gray-50 text-gray-300 border-transparent'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Σημειώσεις</div>
            <textarea
              rows={3}
              disabled={isDone}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Τι είπε, πότε να ξαναπάρεις, κ.λπ."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {!isDone && (
              <button onClick={saveNotes} disabled={saving} className="mt-2 btn-secondary text-xs px-4 py-1.5">
                Αποθήκευση σημειώσεων
              </button>
            )}
          </div>

          {/* Done → get next */}
          {isDone && (
            <div className={`rounded-2xl p-5 text-center ${asgn.status === 'converted' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="text-2xl mb-2">{asgn.status === 'converted' ? '🏆' : '✗'}</div>
              <p className={`font-semibold mb-4 ${asgn.status === 'converted' ? 'text-green-700' : 'text-red-600'}`}>
                {asgn.status === 'converted' ? 'Μπράβο! Ο λογιστής ενδιαφέρεται.' : 'Αρνήθηκε. Συνέχισε με τον επόμενο.'}
              </p>
              <button onClick={handleAssignNext} disabled={assigning} className="btn-primary px-6">
                {assigning ? 'Αναζήτηση...' : 'Επόμενος Λογιστής →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
