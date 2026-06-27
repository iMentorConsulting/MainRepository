import { useEffect, useState } from 'react'
import * as api from '../api'
import { ThemisTranscriptModal } from './Leads'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'

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

  useEffect(() => {
    api.getThemisSessions()
      .then(r => setRows(r.data))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        ⚖️ Συζητήσεις με Θέμις
      </h1>

      {error && <p className="text-sm text-red-500">Σφάλμα φόρτωσης συζητήσεων.</p>}
      {!error && !rows && <p className="text-sm text-gray-400">Φόρτωση…</p>}
      {rows && !rows.length && <p className="text-sm text-gray-400">Δεν υπάρχουν συζητήσεις ακόμα.</p>}

      {!!rows?.length && (
        <>
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
                {rows.map(r => {
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
            <span className="text-indigo-700">Σύνολο συζητήσεων: <span className="font-bold">{rows.length}</span></span>
            <span className="text-indigo-700">Σύνολο tokens: <span className="font-bold">{formatTokens(rows.reduce((s, r) => s + (r.total_tokens || 0), 0))}</span></span>
            <span className="text-indigo-700">Συνολικό κόστος (≈): <span className="font-bold">{formatEur(rows.reduce((s, r) => s + (r.cost_eur || 0), 0))}</span></span>
          </div>
        </>
      )}

      {openLead && (
        <ThemisTranscriptModal lead={openLead} onClose={() => setOpenLead(null)} />
      )}
    </div>
  )
}
