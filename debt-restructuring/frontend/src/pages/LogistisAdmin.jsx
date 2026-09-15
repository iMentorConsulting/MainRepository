import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

const STATUS_META = {
  assigned:    { label: 'Ανατέθηκε',   color: 'bg-gray-100 text-gray-600' },
  called:      { label: 'Κλήθηκε',     color: 'bg-blue-100 text-blue-700' },
  meeting_set: { label: 'Ραντεβού',    color: 'bg-yellow-100 text-yellow-700' },
  demo_done:   { label: 'Demo',         color: 'bg-purple-100 text-purple-700' },
  converted:   { label: 'Έκλεισε ✅',  color: 'bg-green-100 text-green-700' },
  rejected:    { label: 'Αρνήθηκε ✗', color: 'bg-red-100 text-red-700' },
  skipped:     { label: 'Παράβλεψη',   color: 'bg-orange-100 text-orange-700' },
}

const EMPLOYEE_LABELS = {
  STELLA: 'ΣΤΕΛΛΑ',
  VALLIA: 'ΒΑΛΛΙΑ',
  SOFIA:  'ΣΟΦΙΑ',
  HARIS:  'ΧΡΗΣΤΟΣ',
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>
      {m.label}
    </span>
  )
}

export default function LogistisAdmin() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null) // employee being acted on
  const [historyFilter, setHistoryFilter] = useState('')
  const [confirmReset, setConfirmReset] = useState(null) // employee name
  const [pickingFor, setPickingFor] = useState(null) // employee name for pool picker
  const [poolList, setPoolList] = useState(null)
  const [poolSearch, setPoolSearch] = useState('')
  const [loadingPool, setLoadingPool] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getAccountantAdminOverview()
      .then(r => setOverview(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleForceSkip = async (employee) => {
    setConfirmReset(null)
    setActing(employee)
    try {
      await api.adminForceSkip(employee)
      toast.success(`Η ανάθεση του ${EMPLOYEE_LABELS[employee] || employee} αφαιρέθηκε`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Σφάλμα')
    } finally { setActing(null) }
  }

  const handleForceAssign = async (employee) => {
    setActing(employee)
    try {
      const r = await api.adminForceAssign(employee)
      if (r.data.assigned) {
        toast.success(`Ανατέθηκε: ${r.data.accountant?.name}`)
        load()
      } else {
        toast('Δεν υπάρχουν διαθέσιμοι λογιστές', { icon: 'ℹ️' })
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Σφάλμα'
      toast.error(msg)
    } finally { setActing(null) }
  }

  const openPoolPicker = async (employee) => {
    setPickingFor(employee)
    setPoolSearch('')
    setPoolList(null)
    setLoadingPool(true)
    try {
      const r = await api.getAccountantPool()
      setPoolList(r.data?.accountants || r.data || [])
    } catch {
      toast.error('Σφάλμα φόρτωσης pool')
      setPickingFor(null)
    } finally { setLoadingPool(false) }
  }

  const handlePickAssign = async (employee, accountantId) => {
    setActing(employee)
    setPickingFor(null)
    try {
      const r = await api.adminForceAssign(employee, String(accountantId))
      if (r.data.assigned) {
        toast.success(`Ανατέθηκε: ${r.data.accountant?.name}`)
        load()
      } else {
        toast('Δεν ήταν δυνατή η ανάθεση', { icon: 'ℹ️' })
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Σφάλμα')
    } finally { setActing(null) }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Φόρτωση...</div>
  if (!overview) return null

  const { employees, stats, pool_total, history } = overview

  const filteredHistory = history.filter(h =>
    !historyFilter ||
    h.accountant_name?.toLowerCase().includes(historyFilter.toLowerCase()) ||
    h.employee?.toLowerCase().includes(historyFilter.toLowerCase()) ||
    h.status?.includes(historyFilter.toLowerCase())
  )

  const statCards = [
    { label: 'Διαθέσιμοι στο pool', value: stats.available, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Σε εξέλιξη', value: (stats.assigned || 0) + (stats.called || 0) + (stats.meeting_set || 0) + (stats.demo_done || 0), color: 'text-purple-700', bg: 'bg-purple-50' },
    { label: 'Converted ✅', value: stats.converted || 0, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Αρνήθηκαν ✗', value: stats.rejected || 0, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Παραβλέφθηκαν', value: stats.skipped || 0, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: 'Σύνολο pool', value: pool_total, color: 'text-gray-600', bg: 'bg-gray-50' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Admin — Outreach Λογιστών</h1>
          <p className="text-gray-500 text-sm mt-0.5">Επισκόπηση όλης της ομάδας</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm px-4">↻ Ανανέωση</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.bg} text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Conversion rate bar */}
      {stats.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Πρόοδος pool ({stats.total} αναθέσεις)</span>
            <span className="font-semibold text-green-700">
              {Math.round(((stats.converted || 0) / stats.total) * 100)}% converted
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
            {['converted', 'demo_done', 'meeting_set', 'called', 'assigned', 'rejected', 'skipped'].map(s => {
              const pct = stats.total > 0 ? ((stats[s] || 0) / stats.total) * 100 : 0
              const colors = {
                converted: 'bg-green-400', demo_done: 'bg-purple-400',
                meeting_set: 'bg-yellow-400', called: 'bg-blue-400',
                assigned: 'bg-gray-300', rejected: 'bg-red-300', skipped: 'bg-orange-300',
              }
              return pct > 0 ? <div key={s} style={{ width: `${pct}%` }} className={colors[s]} title={`${STATUS_META[s]?.label}: ${stats[s]}`} /> : null
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {Object.entries(STATUS_META).map(([k, m]) => stats[k] > 0 ? (
              <span key={k} className="text-xs text-gray-500">{m.label}: <strong>{stats[k]}</strong></span>
            ) : null)}
          </div>
        </div>
      )}

      {/* Employee cards */}
      <div>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Τρέχουσες Αναθέσεις</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {employees.map(({ employee, assignment, accountant }) => {
            const isActing = acting === employee
            const hasActive = !!assignment
            return (
              <div key={employee} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                {/* Employee header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-black text-gray-800">{EMPLOYEE_LABELS[employee] || employee}</div>
                    <div className="text-xs text-gray-400">{employee}</div>
                  </div>
                  {assignment && <StatusBadge status={assignment.status} />}
                </div>

                {/* Accountant info */}
                {accountant ? (
                  <div className="space-y-1 mb-3">
                    <div className="text-sm font-semibold text-gray-700">{accountant.name}</div>
                    {accountant.office_name && <div className="text-xs text-gray-500">{accountant.office_name}</div>}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      {accountant.phone && (
                        <a href={`tel:${accountant.phone}`} className="text-blue-600 hover:underline">📞 {accountant.phone}</a>
                      )}
                      {accountant.city && <span>📍 {accountant.city}</span>}
                      {accountant.client_count != null && <span>👥 {accountant.client_count} πελάτες</span>}
                    </div>
                    {assignment?.notes && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 mt-1 italic line-clamp-2">
                        {assignment.notes}
                      </div>
                    )}
                    {assignment?.updated_at && (
                      <div className="text-xs text-gray-400">
                        Τελ. ενημέρωση: {new Date(assignment.updated_at).toLocaleDateString('el-GR')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic mb-3">Χωρίς ανάθεση</div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  {hasActive ? (
                    confirmReset === employee ? (
                      <>
                        <button onClick={() => handleForceSkip(employee)} disabled={isActing}
                          className="flex-1 text-xs py-1.5 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600">
                          Επιβεβαίωση Reset
                        </button>
                        <button onClick={() => setConfirmReset(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                          Άκυρο
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmReset(employee)} disabled={isActing}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors">
                        {isActing ? '...' : '↩ Reset ανάθεσης'}
                      </button>
                    )
                  ) : (
                    <>
                      <button onClick={() => handleForceAssign(employee)} disabled={isActing}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
                        {isActing ? 'Αναζήτηση...' : '+ Επόμενος'}
                      </button>
                      <button onClick={() => openPoolPicker(employee)} disabled={isActing}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-semibold">
                        🔍 Από λίστα
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pool picker modal */}
      {pickingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPickingFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <div className="font-black text-gray-800">Επιλογή λογιστή</div>
                <div className="text-xs text-gray-500 mt-0.5">για {EMPLOYEE_LABELS[pickingFor] || pickingFor}</div>
              </div>
              <button onClick={() => setPickingFor(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2">✕</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input
                autoFocus
                value={poolSearch}
                onChange={e => setPoolSearch(e.target.value)}
                placeholder="Αναζήτηση λογιστή…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {loadingPool && <div className="text-center text-gray-400 py-8 text-sm">Φόρτωση...</div>}
              {!loadingPool && poolList?.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-sm">Δεν βρέθηκαν λογιστές</div>
              )}
              {!loadingPool && poolList?.filter(a => {
                const s = poolSearch.toLowerCase()
                return !s || a.name?.toLowerCase().includes(s) || a.city?.toLowerCase().includes(s) || a.office_name?.toLowerCase().includes(s)
              }).map(a => (
                <button key={a.id} onClick={() => handlePickAssign(pickingFor, a.id)}
                  className="w-full text-left px-5 py-3 hover:bg-blue-50 transition-colors">
                  <div className="font-semibold text-gray-800 text-sm">{a.name}</div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
                    {a.office_name && <span>{a.office_name}</span>}
                    {a.city && <span>📍 {a.city}</span>}
                    {a.client_count != null && <span>👥 {a.client_count} πελάτες</span>}
                    {a.phone && <span>📞 {a.phone}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History table */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Ιστορικό Αναθέσεων</h2>
          <input
            value={historyFilter}
            onChange={e => setHistoryFilter(e.target.value)}
            placeholder="Φίλτρο (λογιστής, υπάλληλος, status)…"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 w-56"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Λογιστής</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Υπάλληλος</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ανάθεση</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ενημέρωση</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-6 text-sm">Κανένα αποτέλεσμα</td></tr>
                )}
                {filteredHistory.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{h.accountant_name}</div>
                      {h.accountant_phone && <div className="text-xs text-gray-400">{h.accountant_phone}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-600">{EMPLOYEE_LABELS[h.employee] || h.employee}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {h.assigned_at ? new Date(h.assigned_at).toLocaleDateString('el-GR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {h.updated_at ? new Date(h.updated_at).toLocaleDateString('el-GR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
