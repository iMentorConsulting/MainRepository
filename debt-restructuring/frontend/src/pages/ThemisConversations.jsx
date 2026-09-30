import { useEffect, useState } from 'react'
import * as api from '../api'
import { ThemisTranscriptModal } from './Leads'
import { ChatBubbleLeftEllipsisIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const STATUS_BADGE = {
  in_progress: { label: 'Σε εξέλιξη', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  eligible: { label: 'Επιλέξιμος', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ineligible: { label: 'Μη επιλέξιμος', cls: 'bg-red-50 text-red-700 border-red-200' },
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
}

function formatTokens(n) {
  return (n || 0).toLocaleString('el-GR')
}

function formatEur(n) {
  return `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}€`
}

export default function ThemisConversations() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [openLead, setOpenLead] = useState(null)
  const [search, setSearch] = useState('')
  const [filterAdvisor, setFilterAdvisor] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    api.getThemisSessions()
      .then(r => setRows(r.data))
      .catch(() => setError(true))
  }, [])

  const filtered = rows ? rows.filter(r => {
    const searchLower = search.toLowerCase()
    const matchesSearch = !searchLower ||
      (r.lead_name || '').toLowerCase().includes(searchLower) ||
      (r.phone || '').toLowerCase().includes(searchLower) ||
      (r.email || '').toLowerCase().includes(searchLower)

    const matchesAdvisor = !filterAdvisor || r.assigned_to === filterAdvisor
    const matchesStatus = !filterStatus || r.status === filterStatus

    const createdDate = r.created_at ? new Date(r.created_at) : null
    const matchesDateFrom = !filterDateFrom || (createdDate && createdDate >= new Date(filterDateFrom))
    const matchesDateTo = !filterDateTo || (createdDate && createdDate <= new Date(filterDateTo + 'T23:59:59'))

    return matchesSearch && matchesAdvisor && matchesStatus && matchesDateFrom && matchesDateTo
  }) : null

  const advisors = rows ? [...new Set(rows.map(r => r.assigned_to).filter(Boolean))].sort() : []
  const statuses = ['in_progress', 'eligible', 'ineligible']

  const clearFilters = () => {
    setSearch('')
    setFilterAdvisor('')
    setFilterStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        ⚖️ Συζητήσεις με Θέμις
      </h1>

      {error && <p className="text-sm text-red-500">Σφάλμα φόρτωσης συζητήσεων.</p>}
      {!error && !rows && <p className="text-sm text-gray-400">Φόρτωση…</p>}
      {rows && !rows.length && <p className="text-sm text-gray-400">Δεν υπάρχουν συζητήσεις ακόμα.</p>}

      {!!rows?.length && (
        <>
          {/* Search & Filters */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Αναζήτηση: όνομα, τηλέφωνο, email..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {(search || filterAdvisor || filterStatus || filterDateFrom || filterDateTo) && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1">
                  <XMarkIcon className="w-4 h-4" />
                  Καθαρισμός
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Σύμβουλος</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterAdvisor}
                  onChange={e => setFilterAdvisor(e.target.value)}>
                  <option value="">Όλοι</option>
                  {advisors.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Κατάσταση</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">Όλες</option>
                  {statuses.map(s => (
                    <option key={s} value={s}>{STATUS_BADGE[s]?.label || s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Από</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Έως</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Σύμβουλος</th>
                  <th className="px-4 py-3">Τελευταίο μήνυμα</th>
                  <th className="px-4 py-3 text-center">Μηνύματα</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Κόστος (≈€)</th>
                  <th className="px-4 py-3">Κατάσταση</th>
                  <th className="px-4 py-3">Ημερομηνία</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered?.length === 0 ? (
                  <tr><td colSpan="9" className="px-4 py-8 text-center text-sm text-gray-400">Δεν βρέθηκαν αποτελέσματα</td></tr>
                ) : filtered?.map(r => {
                  const badge = STATUS_BADGE[r.status] || STATUS_BADGE.in_progress
                  return (
                    <tr key={r.lead_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.lead_name || `Lead #${r.lead_id}`}</td>
                      <td className="px-4 py-3 text-gray-600">{r.assigned_to || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.last_message || '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.message_count}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{formatTokens(r.total_tokens)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">{formatEur(r.cost_eur)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.last_message_at || r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setOpenLead({ id: r.lead_id, name: r.lead_name })}
                          className="text-gray-400 hover:text-gray-700">
                          <ChatBubbleLeftEllipsisIcon className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-6 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm">
            <span className="text-indigo-700">Αποτελέσματα: <span className="font-bold">{filtered?.length || 0}</span></span>
            <span className="text-indigo-700">Σύνολο tokens: <span className="font-bold">{formatTokens(filtered?.reduce((s, r) => s + (r.total_tokens || 0), 0) || 0)}</span></span>
            <span className="text-indigo-700">Συνολικό κόστος (≈): <span className="font-bold">{formatEur(filtered?.reduce((s, r) => s + (r.cost_eur || 0), 0) || 0)}</span></span>
          </div>
        </>
      )}

      {openLead && (
        <ThemisTranscriptModal lead={openLead} onClose={() => setOpenLead(null)} />
      )}
    </div>
  )
}
