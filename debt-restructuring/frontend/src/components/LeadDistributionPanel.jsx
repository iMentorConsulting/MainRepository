import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

const CONSULTANTS = ['STELLA', 'VALLIA', 'SOFIA']

// Admin: how many of the NEW leads each consultant receives (relative weights).
export default function LeadDistributionPanel() {
  const [cfg, setCfg] = useState(null)
  const [weights, setWeights] = useState({})
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = () => api.getLeadDistribution().then(r => {
    setCfg(r.data)
    setEnabled(!!r.data.enabled)
    setWeights(Object.fromEntries(CONSULTANTS.map(c => [c, String(r.data.weights?.[c] ?? 0)])))
  }).catch(() => {})
  useEffect(() => { load() }, [])

  if (!cfg) return null
  const nums = Object.fromEntries(CONSULTANTS.map(c => [c, Math.max(0, parseFloat(weights[c]) || 0)]))
  const total = CONSULTANTS.reduce((s, c) => s + nums[c], 0)
  const pct = c => (total > 0 ? Math.round((nums[c] / total) * 1000) / 10 : 0)

  const save = async () => {
    if (enabled && total <= 0) return toast.error('Βάλε βάρος > 0 σε τουλάχιστον έναν σύμβουλο')
    setSaving(true)
    try {
      await api.saveLeadDistribution({ enabled, weights: nums })
      toast.success('Η κατανομή αποθηκεύτηκε — ισχύει για τα επόμενα νέα leads')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Αποτυχία αποθήκευσης')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-gray-800">🎯 Κατανομή νέων leads ανά σύμβουλο</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Ενεργή
        </label>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {enabled
          ? 'Τα νέα leads μοιράζονται σύμφωνα με τα βάρη (αγνοείται το όνομα που έρχεται από το Sheet / το Λογιστή).'
          : 'Ανενεργή: ισχύει ο σύμβουλος που έρχεται έτοιμος με το lead.'}
        {' '}Βάρος 0 = δεν παίρνει νέα leads. Παλιά leads δεν αλλάζουν.
      </p>
      <div className="grid grid-cols-3 gap-4">
        {CONSULTANTS.map(c => (
          <div key={c} className="border border-gray-100 rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-700 mb-1">{c}</div>
            <input type="number" min="0" step="1" value={weights[c] ?? ''}
              onChange={e => setWeights(w => ({ ...w, [c]: e.target.value }))}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
            <div className="text-xs text-gray-500 mt-1">
              Μερίδιο: <b>{pct(c)}%</b>
              <span className="text-gray-400"> · από την αποθήκευση: {cfg.counts?.[c] ?? 0}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        {cfg.updated_at && (
          <span className="text-xs text-gray-400">
            Τελευταία αλλαγή: {new Date(cfg.updated_at + 'Z').toLocaleString('el-GR')} ({cfg.updated_by})
          </span>
        )}
      </div>
    </div>
  )
}
