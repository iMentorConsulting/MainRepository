import { useState, useEffect } from 'react'
import { getSLAConfig, updateSLAConfig } from '../api'
import { PIPELINES } from '../pipelines'
import toast from 'react-hot-toast'

export default function SLAConfigPanel({ onClose }) {
  const [tab, setTab] = useState('days')
  const [config, setConfig] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getSLAConfig().then(data => {
      const existing = new Map(data.map(r => [r.status, { sla_days: r.sla_days, notification_message: r.notification_message || '' }]))
      const allStatuses = []
      for (const prog of Object.values(PIPELINES)) {
        for (const phase of prog.phases) {
          for (const s of phase.statuses) {
            if (!allStatuses.find(x => x.status === s))
              allStatuses.push({ status: s, sla_days: existing.get(s)?.sla_days ?? null, notification_message: existing.get(s)?.notification_message ?? '' })
          }
        }
      }
      setConfig(allStatuses)
    }).catch(() => toast.error('Σφάλμα φόρτωσης SLA')).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = config.filter(r => r.sla_days !== null && r.sla_days > 0)
        .map(r => ({ status: r.status, sla_days: r.sla_days, notification_message: r.notification_message || null }))
      await updateSLAConfig(entries)
      toast.success('SLA αποθηκεύτηκαν')
      onClose()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const updateDays = (status, days) => setConfig(prev => prev.map(r => r.status === status ? { ...r, sla_days: days === '' ? null : parseInt(days) } : r))
  const updateMsg = (status, msg) => setConfig(prev => prev.map(r => r.status === status ? { ...r, notification_message: msg } : r))
  const filtered = config.filter(r => !search || r.status.toLowerCase().includes(search.toLowerCase()))
  const withDays = config.filter(r => r.sla_days > 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">Ρύθμιση SLA</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="flex border-b">
          {[['days', 'Ημέρες ανά Κατάσταση'], ['messages', `Μηνύματα (${withDays.length} καταστάσεις)`]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >{label}</button>
          ))}
        </div>
        {tab === 'days' && (
          <>
            <div className="p-4 border-b">
              <input className="input text-sm" placeholder="Αναζήτηση κατάστασης..." value={search} onChange={e => setSearch(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Αφήστε κενό για να μην ισχύει SLA.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? <div className="text-center py-8 text-gray-400">Φόρτωση...</div> : (
                <div className="space-y-1">
                  {filtered.map(row => (
                    <div key={row.status} className="flex items-center gap-3 py-1.5 border-b border-gray-50">
                      <span className="flex-1 text-sm text-gray-700 truncate" title={row.status}>{row.status}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input type="number" min="0" max="365" value={row.sla_days ?? ''} onChange={e => updateDays(row.status, e.target.value)}
                          placeholder="—" className="w-16 text-sm border border-gray-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <span className="text-xs text-gray-400">ημ.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {tab === 'messages' && (
          <div className="flex-1 overflow-y-auto p-4">
            {withDays.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Ορίστε πρώτα ημέρες SLA για κάποια κατάσταση</div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Χρησιμοποιήστε <code className="bg-gray-100 px-1 rounded">{'{client_name}'}</code> <code className="bg-gray-100 px-1 rounded">{'{service_type}'}</code> <code className="bg-gray-100 px-1 rounded">{'{days_overdue}'}</code></p>
                {withDays.map(row => (
                  <div key={row.status} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{row.status}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">SLA: {row.sla_days} ημ.</span>
                    </div>
                    <textarea className="input text-sm w-full" rows={3}
                      placeholder="π.χ. 'Αγαπητέ {client_name}, παρακαλούμε να μας αποστείλετε...'"
                      value={row.notification_message || ''}
                      onChange={e => updateMsg(row.status, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Άκυρο</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
        </div>
      </div>
    </div>
  )
}
