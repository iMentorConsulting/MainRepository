import { useEffect, useState, useMemo } from 'react'
import {
  getMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssue,
  updateMaintenanceStatus, deleteMaintenanceIssue, getMaintenanceCategories,
  getMaintenanceStats, getUnits,
} from '../api'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PRIORITY = {
  urgent: { label: 'ΕΠΕΙΓΟΝ', cls: 'bg-red-100 text-red-700 border-red-300' },
  high:   { label: 'Υψηλή',   cls: 'bg-orange-100 text-orange-700 border-orange-300' },
  medium: { label: 'Μέτρια',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  low:    { label: 'Χαμηλή',  cls: 'bg-gray-100 text-gray-600 border-gray-300' },
}
const STATUS = {
  open:        { label: 'Ανοιχτό',       cls: 'bg-red-50 border-red-300',    dot: 'bg-red-500' },
  in_progress: { label: 'Σε Εξέλιξη',   cls: 'bg-yellow-50 border-yellow-300', dot: 'bg-yellow-500' },
  resolved:    { label: 'Κλειστό',       cls: 'bg-green-50 border-green-300', dot: 'bg-green-500' },
}
const CAT_ICONS = {
  'Ηλεκτρολόγος': '⚡', 'Υδραυλικός': '🔧', 'AC / Κλιματισμός': '❄️',
  'Πισίνα': '🏊', 'Λευκές Συσκευές': '🧺', 'Κήπος': '🌿',
  'Ασφάλεια / Κλειδαριές': '🔒', 'Έπιπλα / Εξοπλισμός': '🪑',
  'Wifi / Τεχνολογία': '📡', 'Γενικά': '🛠️',
}
const REPORTED_BY = { manager: 'Διαχειριστής', guest: 'Πελάτης', cleaner: 'Καθαριστής' }

const EMPTY = {
  unit_id: '', title: '', description: '', category: '',
  priority: 'medium', status: 'open', reported_by: 'manager', reporter_name: '', notes: '',
}

function IssueModal({ issue, units, categories, onClose, onSaved }) {
  const [form, setForm] = useState(issue?.id ? { ...issue, unit_id: String(issue.unit_id) } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.unit_id || !form.title || !form.category) {
      toast.error('Συμπληρώστε Μονάδα, Τίτλο και Κατηγορία')
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, unit_id: parseInt(form.unit_id) }
      if (issue?.id) await updateMaintenanceIssue(issue.id, payload)
      else await createMaintenanceIssue(payload)
      toast.success(issue?.id ? 'Αποθηκεύτηκε' : 'Καταχωρήθηκε — Ο manager ειδοποιήθηκε')
      onSaved()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <WrenchScrewdriverIcon className="h-5 w-5 text-orange-500" />
            {issue?.id ? 'Επεξεργασία Προβλήματος' : 'Νέο Πρόβλημα Συντήρησης'}
          </h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Μονάδα *</label>
              <select className="input" value={form.unit_id} onChange={e => set('unit_id', e.target.value)} required>
                <option value="">Επιλογή...</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Κατηγορία *</label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)} required>
                <option value="">Επιλογή...</option>
                {categories.map(c => <option key={c} value={c}>{CAT_ICONS[c] || '🔧'} {c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Τίτλος *</label>
            <input className="input" placeholder="π.χ. Το AC δεν κρυώνει" value={form.title}
              onChange={e => set('title', e.target.value)} required />
          </div>

          <div>
            <label className="label">Περιγραφή</label>
            <textarea className="input" rows={3} placeholder="Λεπτομέρειες προβλήματος..."
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Προτεραιότητα</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Κατάσταση</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Αναφέρθηκε από</label>
              <select className="input" value={form.reported_by} onChange={e => set('reported_by', e.target.value)}>
                {Object.entries(REPORTED_BY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Όνομα</label>
              <input className="input" placeholder="π.χ. Γιώργος Π." value={form.reporter_name}
                onChange={e => set('reporter_name', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Ακύρωση</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IssueCard({ issue, onEdit, onDelete, onStatusChange }) {
  const p = PRIORITY[issue.priority] || PRIORITY.medium
  const s = STATUS[issue.status] || STATUS.open
  const icon = CAT_ICONS[issue.category] || '🔧'
  const [updating, setUpdating] = useState(false)

  const quickStatus = async (newStatus) => {
    setUpdating(true)
    try {
      await onStatusChange(issue.id, newStatus)
    } finally { setUpdating(false) }
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${s.cls} transition-all`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{issue.unit_name}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${p.cls}`}>{p.label}</span>
            </div>
            <p className="font-bold text-gray-800 mt-0.5 leading-tight">{issue.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{issue.category}</p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-blue-600">
            <PencilSquareIcon className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500">
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {issue.description && (
        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{issue.description}</p>
      )}

      <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{REPORTED_BY[issue.reported_by] || issue.reported_by}{issue.reporter_name ? ` — ${issue.reporter_name}` : ''}</span>
          <span>{new Date(issue.created_at).toLocaleDateString('el-GR')}</span>
          {issue.resolved_at && <span className="text-green-600">✓ {new Date(issue.resolved_at).toLocaleDateString('el-GR')}</span>}
        </div>

        {/* Quick status buttons */}
        <div className="flex gap-1">
          {issue.status !== 'open' && (
            <button disabled={updating} onClick={() => quickStatus('open')}
              className="text-xs px-2 py-1 rounded-lg bg-white/60 border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors">
              Ανοιχτό
            </button>
          )}
          {issue.status !== 'in_progress' && (
            <button disabled={updating} onClick={() => quickStatus('in_progress')}
              className="text-xs px-2 py-1 rounded-lg bg-white/60 border border-gray-300 text-gray-600 hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 transition-colors">
              Σε Εξέλιξη
            </button>
          )}
          {issue.status !== 'resolved' && (
            <button disabled={updating} onClick={() => quickStatus('resolved')}
              className="text-xs px-2 py-1 rounded-lg bg-white/60 border border-green-300 text-green-700 hover:bg-green-100 transition-colors font-medium">
              ✓ Κλείσιμο
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Maintenance() {
  const [issues, setIssues] = useState([])
  const [stats, setStats] = useState({ open: 0, in_progress: 0, resolved: 0, urgent: 0 })
  const [categories, setCategories] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabStatus, setTabStatus] = useState('open')
  const [filterUnit, setFilterUnit] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = { status: tabStatus || undefined, unit_id: filterUnit || undefined, priority: filterPriority || undefined }
      const [r, s] = await Promise.all([
        getMaintenanceIssues(params),
        getMaintenanceStats(),
      ])
      setIssues(r.data)
      setStats(s.data)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    getMaintenanceCategories().then(r => setCategories(r.data))
    getUnits({ active_only: false }).then(r => setUnits(r.data))
  }, [])

  useEffect(() => { load() }, [tabStatus, filterUnit, filterPriority])

  const handleStatusChange = async (id, status) => {
    await updateMaintenanceStatus(id, { status })
    toast.success(STATUS[status]?.label || status)
    load()
  }

  const handleDelete = async () => {
    try {
      await deleteMaintenanceIssue(deleting.id)
      toast.success('Διαγράφηκε')
      setDeleting(null)
      load()
    } catch { toast.error('Σφάλμα') }
  }

  const tabs = [
    { key: 'open', label: 'Ανοιχτά', count: stats.open, cls: 'text-red-600' },
    { key: 'in_progress', label: 'Σε Εξέλιξη', count: stats.in_progress, cls: 'text-yellow-600' },
    { key: 'resolved', label: 'Κλειστά', count: stats.resolved, cls: 'text-green-600' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🔧 Συντήρηση</h2>
          {stats.urgent > 0 && (
            <p className="text-xs text-red-600 font-semibold mt-0.5">⚠️ {stats.urgent} επείγοντα ανοιχτά</p>
          )}
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-4 w-4" /> Νέο Πρόβλημα
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTabStatus(t.key)}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tabStatus === t.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-gray-100 ${tabStatus === t.key ? t.cls : 'text-gray-400'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select className="input w-auto text-sm" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
          <option value="">Όλες οι μονάδες</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">Όλες οι προτεραιότητες</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(filterUnit || filterPriority) && (
          <button onClick={() => { setFilterUnit(''); setFilterPriority('') }} className="text-xs text-gray-400 hover:text-red-500">✕ Καθαρισμός</button>
        )}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Φόρτωση...</div>}

      {!loading && issues.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-lg font-medium">
            {tabStatus === 'open' ? 'Δεν υπάρχουν ανοιχτά προβλήματα!' :
             tabStatus === 'in_progress' ? 'Καμία εκκρεμής εργασία' : 'Καμία κλειστή εγγραφή'}
          </p>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {issues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onEdit={() => setModal(issue)}
              onDelete={() => setDeleting(issue)}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <IssueModal
          issue={modal?.id ? modal : null}
          units={units}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800">Διαγραφή προβλήματος;</h3>
            <p className="text-sm text-gray-600"><strong>{deleting.title}</strong> — {deleting.unit_name}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Ακύρωση</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg">
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
