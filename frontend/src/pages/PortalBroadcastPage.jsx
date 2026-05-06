import { useEffect, useState, useMemo } from 'react'
import { getCases, bulkActivateNotify, activateAllPortals } from '../api'
import {
  GlobeAltIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  BellAlertIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const DEFAULT_TEMPLATE = `Αγαπητέ/ή {client_name},

Σας ενημερώνουμε ότι η iMentor Consulting έχει ενεργοποιήσει για εσάς την **Πύλη Πελάτη** για το πρόγραμμα **{service_type}**.

🔗 {portal_url}

Για είσοδο χρειάζεστε μόνο το ΑΦΜ σας.

Μέσα από την Πύλη Πελάτη μπορείτε να:
✅ Παρακολουθείτε σε πραγματικό χρόνο την πορεία της υπόθεσής σας
📋 Δείτε τις εκκρεμότητες που χρειαζόμαστε από εσάς
📅 Ενημερωθείτε για τα επόμενα βήματα και τις σημαντικές ημερομηνίες
💬 Διαβάσετε τις ενημερώσεις του συμβούλου σας

Η ομάδα iMentor`

const PROGRAM_OPTIONS = ['', 'ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PORTAL_OPTIONS = [
  { value: '', label: 'Όλοι' },
  { value: 'active', label: 'Ήδη ενεργό' },
  { value: 'inactive', label: 'Ανενεργό / Χωρίς πύλη' },
]

const fmtDt = (iso) =>
  iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : null

export default function PortalBroadcastPage() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterPortal, setFilterPortal] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortCol, setSortCol] = useState('client_name')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState(new Set())
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [showTemplate, setShowTemplate] = useState(false)
  const [notifType, setNotifType] = useState('viber') // viber | email | both
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  useEffect(() => {
    getCases()
      .then(data => {
        const list = Array.isArray(data) ? data : (data.cases || data.items || [])
        setCases(list.filter(c => c.status !== 'ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ' && c.status !== 'ΑΚΥΡΩΣΗ' && c.status !== 'ΠΑΡΑΙΤΗΣΗ' && c.status !== 'ΑΠΟΡΡΙΨΗ'))
      })
      .finally(() => setLoading(false))
  }, [])

  const allStatuses = useMemo(() => {
    const s = new Set(cases.map(c => c.status).filter(Boolean))
    return [...s].sort()
  }, [cases])

  const filtered = useMemo(() => {
    const arr = cases.filter(c => {
      if (search && !c.client_name?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterProgram && c.program_category !== filterProgram) return false
      if (filterPortal === 'active' && !c.portal_active) return false
      if (filterPortal === 'inactive' && c.portal_active) return false
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
    return [...arr].sort((a, b) => {
      const va = a[sortCol]
      const vb = b[sortCol]
      if (va == null && vb == null) return 0
      if (va == null) return sortDir === 'asc' ? 1 : -1
      if (vb == null) return sortDir === 'asc' ? -1 : 1
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'el') : va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [cases, search, filterProgram, filterPortal, filterStatus, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const someSelected = filtered.some(c => selected.has(c.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    if (selected.size === 0) { toast.error('Δεν έχετε επιλέξει κανέναν πελάτη'); return }
    setSending(true)
    setResults(null)
    try {
      const portalBase = window.location.origin
      const res = await bulkActivateNotify({
        case_ids: [...selected],
        portal_base_url: portalBase,
        message_template: template,
        activate: true,
        notify: true,
        notification_type: notifType,
      })
      setResults(res.results)
      toast.success(`Ενεργοποιήθηκαν: ${res.activated} · Ειδοποιήθηκαν: ${res.notified}`)
      // Refresh case list to reflect new portal_active states
      getCases().then(data => {
        const list = Array.isArray(data) ? data : (data.cases || data.items || [])
        setCases(list.filter(c => c.status !== 'ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ' && c.status !== 'ΑΚΥΡΩΣΗ' && c.status !== 'ΠΑΡΑΙΤΗΣΗ' && c.status !== 'ΑΠΟΡΡΙΨΗ'))
      })
      setSelected(new Set())
    } catch (err) {
      toast.error('Σφάλμα κατά την αποστολή')
    } finally {
      setSending(false)
    }
  }

  const [activatingAll, setActivatingAll] = useState(false)

  const handleActivateAll = async () => {
    if (!confirm('Ενεργοποίηση πύλης για ΟΛΟΥΣ τους πελάτες χωρίς ειδοποίηση; Δεν αποστέλλεται κανένα μήνυμα.')) return
    setActivatingAll(true)
    try {
      const res = await activateAllPortals()
      toast.success(`Ενεργοποιήθηκαν ${res.activated} από ${res.total} υποθέσεις`)
      getCases().then(data => {
        const list = Array.isArray(data) ? data : (data.cases || data.items || [])
        setCases(list.filter(c => c.status !== 'ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ' && c.status !== 'ΑΚΥΡΩΣΗ' && c.status !== 'ΠΑΡΑΙΤΗΣΗ' && c.status !== 'ΑΠΟΡΡΙΨΗ'))
      })
    } catch {
      toast.error('Σφάλμα ενεργοποίησης')
    } finally {
      setActivatingAll(false)
    }
  }

  const selectedCount = selected.size
  const noPhoneCount = [...selected].filter(id => !cases.find(x => x.id === id)?.phone).length
  const noEmailCount = [...selected].filter(id => !cases.find(x => x.id === id)?.email).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GlobeAltIcon className="w-7 h-7 text-[#1e3a5f]" />
            Ενεργοποίηση Πύλης Πελάτη
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Επιλέξτε πελάτες, ενεργοποιήστε την πύλη τους και στείλτε ειδοποίηση Viber με τον σύνδεσμο.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleActivateAll}
            disabled={activatingAll}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
            title="Ενεργοποίηση όλων χωρίς αποστολή μηνύματος"
          >
            <GlobeAltIcon className="w-4 h-4" />
            {activatingAll ? 'Ενεργοποίηση...' : 'Ενεργοποίηση Όλων (χωρίς μήνυμα)'}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || selectedCount === 0}
            className="flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BellAlertIcon className="w-5 h-5" />
            {sending ? 'Αποστολή...' : `Ενεργοποίηση & Αποστολή${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      </div>

      {/* Notification type selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">Αποστολή μέσω:</span>
        {[
          { value: 'viber', label: 'Viber' },
          { value: 'email', label: 'Email' },
          { value: 'both', label: 'Viber & Email' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setNotifType(value)}
            className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${
              notifType === value
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#1e3a5f]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Warnings */}
      {(notifType === 'viber' || notifType === 'both') && noPhoneCount > 0 && selectedCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          {noPhoneCount} από τους επιλεγμένους δεν έχουν αριθμό τηλεφώνου — δεν θα σταλεί Viber σε αυτούς.
        </div>
      )}
      {(notifType === 'email' || notifType === 'both') && noEmailCount > 0 && selectedCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          {noEmailCount} από τους επιλεγμένους δεν έχουν email — δεν θα σταλεί email σε αυτούς.
        </div>
      )}

      {/* Message template toggle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setShowTemplate(p => !p)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700"
        >
          <span>Μήνυμα {notifType === 'viber' ? 'Viber' : notifType === 'email' ? 'Email' : 'Viber / Email'} (προεπισκόπηση & επεξεργασία)</span>
          {showTemplate ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </button>
        {showTemplate && (
          <div className="px-5 pb-5 border-t border-gray-50 pt-3">
            <p className="text-xs text-gray-400 mb-2">Χρησιμοποιήστε <code className="bg-gray-100 px-1 rounded">{'{client_name}'}</code> και <code className="bg-gray-100 px-1 rounded">{'{portal_url}'}</code> ως μεταβλητές.</p>
            <textarea
              rows={10}
              value={template}
              onChange={e => setTemplate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-y"
            />
            <button
              onClick={() => setTemplate(DEFAULT_TEMPLATE)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Επαναφορά στο προεπιλεγμένο
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Αναζήτηση πελάτη..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
          />
        </div>
        <select
          value={filterProgram}
          onChange={e => setFilterProgram(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        >
          <option value="">Όλα τα Προγράμματα</option>
          {PROGRAM_OPTIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterPortal}
          onChange={e => setFilterPortal(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        >
          {PORTAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent max-w-[220px]"
        >
          <option value="">Όλες οι Καταστάσεις</option>
          {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="text-sm text-gray-500 self-center ml-auto">
          {filtered.length} εγγραφές · {selectedCount} επιλεγμένοι
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                </th>
                {[
                  { label: 'Πελάτης', key: 'client_name' },
                  { label: 'Πρόγραμμα', key: 'program_category' },
                  { label: 'Κατάσταση', key: 'status' },
                  { label: 'Τηλέφωνο', key: 'phone' },
                  { label: 'Πύλη', key: 'portal_active' },
                  { label: 'Τελευταίο Άνοιγμα', key: 'portal_last_visit_at' },
                  { label: 'Σύνολο Ανοιγμάτων', key: 'portal_visit_count' },
                  { label: 'Τελευταίο Μήνυμα', key: 'last_msg_at' },
                  { label: 'Σύνολο Μηνυμάτων', key: 'total_msgs_sent' },
                ].map(({ label, key }) => (
                  <th key={key} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap text-xs">
                    <button onClick={() => toggleSort(key)} className="flex items-center gap-1 hover:text-gray-900 transition-colors">
                      {label}
                      <span className="text-[10px] text-gray-400">{sortIcon(key)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">Δεν βρέθηκαν εγγραφές</td></tr>
              )}
              {filtered.map(c => (
                <tr
                  key={c.id}
                  onClick={() => toggleOne(c.id)}
                  className={`cursor-pointer transition-colors ${selected.has(c.id) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 text-sm">{c.client_name}</div>
                    {c.service_type && <div className="text-xs text-gray-400 mt-0.5">{c.service_type}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${
                      c.program_category === 'ΕΣΠΑ' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      c.program_category === 'ΔΥΠΑ' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-purple-50 text-purple-700 border-purple-200'
                    }`}>{c.program_category || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">{c.status || '—'}</td>
                  <td className="px-4 py-3">
                    {c.phone
                      ? <span className="text-gray-700 font-mono text-xs">{c.phone}</span>
                      : <span className="text-red-400 text-xs">— χωρίς τηλ.</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {c.portal_active
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><CheckCircleIcon className="w-3.5 h-3.5" />Ενεργό</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">Ανενεργό</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {fmtDt(c.portal_last_visit_at) || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.portal_visit_count > 0
                      ? <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{c.portal_visit_count}</span>
                      : <span className="text-gray-300 text-xs">0</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {fmtDt(c.last_msg_at) || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.total_msgs_sent > 0
                      ? <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{c.total_msgs_sent}</span>
                      : <span className="text-gray-300 text-xs">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results panel */}
      {results && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BellAlertIcon className="w-5 h-5 text-blue-500" />
            Αποτελέσματα Αποστολής
          </h3>
          <div className="flex gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.filter(r => r.notified).length}</div>
              <div className="text-xs text-gray-500">Ειδοποιήθηκαν</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{results.filter(r => !r.notified).length}</div>
              <div className="text-xs text-gray-500">Αποτυχία / Χωρίς τηλ.</div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {results.map(r => (
              <div key={r.case_id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                r.notified ? 'bg-green-50' : 'bg-red-50'
              }`}>
                {r.notified
                  ? <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  : <XCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                }
                <span className="font-medium text-gray-800 flex-1">{r.client_name}</span>
                <span className="text-xs text-gray-500">{r.phone || '—'}</span>
                {r.error && <span className="text-xs text-red-500 ml-2">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
