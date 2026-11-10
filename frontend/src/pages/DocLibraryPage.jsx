import React, { useState, useEffect, useMemo } from 'react'
import {
  getDocSets, getDocSet, createDocSet, updateDocSet, deleteDocSet,
  createDocSetItem, updateDocSetItem, deleteDocSetItem, getDocLibMeta, getAuth,
  getCases, createCaseDocChecklist,
} from '../api'
import {
  BookOpenIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  PrinterIcon,
  FolderOpenIcon,
  ArrowsUpDownIcon,
  PaperAirplaneIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const REQ_COLORS = {
  ΥΠΟΧΡΕΩΤΙΚΟ: 'bg-red-100 text-red-700 border-red-200',
  ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ: 'bg-orange-100 text-orange-700 border-orange-200',
  ΕΝΑΛΛΑΚΤΙΚΑ: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ: 'bg-blue-100 text-blue-700 border-blue-200',
  ΠΡΟΑΙΡΕΤΙΚΟ: 'bg-gray-100 text-gray-600 border-gray-200',
}

const REQ_LABELS = {
  ΥΠΟΧΡΕΩΤΙΚΟ: 'Υποχρεωτικό',
  ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ: 'Υπό Προϋπόθεση',
  ΕΝΑΛΛΑΚΤΙΚΑ: 'Εναλλακτικό',
  ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ: 'Για Βαθμολόγηση',
  ΠΡΟΑΙΡΕΤΙΚΟ: 'Προαιρετικό',
}

const APPLICANT_LABELS = {
  new_business: 'Νέες Επιχειρήσεις',
  existing_business: 'Υφιστάμενες Επιχειρήσεις',
  both: 'Νέες & Υφιστάμενες',
}

function ReqBadge({ type }) {
  const color = REQ_COLORS[type] || 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${color} whitespace-nowrap`}>
      {REQ_LABELS[type] || type}
    </span>
  )
}

// ── Item row ───────────────────────────────────────────────────────────────────

function ItemRow({ item, isAdmin, setId, onUpdated, onDeleted, meta }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...item })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { toast.error('Απαιτείται τίτλος'); return }
    setSaving(true)
    try {
      const saved = await updateDocSetItem(setId, item.id, form)
      onUpdated(saved)
      setEditing(false)
      toast.success('Αποθηκεύτηκε')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const del = async () => {
    if (!confirm(`Διαγραφή "${item.title}";`)) return
    await deleteDocSetItem(setId, item.id)
    onDeleted(item.id)
    toast.success('Διαγράφηκε')
  }

  if (editing) {
    return (
      <div className="border border-blue-300 rounded-xl p-4 bg-blue-50 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Κωδικός</label>
            <input value={form.item_code || ''} onChange={e => set('item_code', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="π.χ. NEW-01" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Κωδικός ΟΠΣΚΕ</label>
            <input value={form.opske_code || ''} onChange={e => set('opske_code', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="π.χ. 02.02" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Ομάδα</label>
            <select value={form.group_code || ''} onChange={e => set('group_code', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none bg-white">
              <option value="">—</option>
              {(meta?.groups || []).map(g => (
                <option key={g.code} value={g.code}>{g.code}: {g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Χαρακτήρας</label>
            <select value={form.requirement_type || 'ΥΠΟΧΡΕΩΤΙΚΟ'} onChange={e => set('requirement_type', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none bg-white">
              {(meta?.requirement_types || Object.keys(REQ_LABELS)).map(r => (
                <option key={r} value={r}>{REQ_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Τίτλος *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            placeholder="Τίτλος δικαιολογητικού" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Περιγραφή / Οδηγίες</label>
          <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none resize-y"
            placeholder="Αναλυτικές οδηγίες για τον πελάτη..." />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Σημείωση προϋπόθεσης</label>
          <input value={form.condition_notes || ''} onChange={e => set('condition_notes', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            placeholder="Πότε εφαρμόζεται (για υπό προϋπόθεση)..." />
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <input type="number" value={form.sort_order ?? 0} onChange={e => set('sort_order', Number(e.target.value))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:border-blue-400 focus:outline-none" />
            <span className="text-xs text-gray-400">σειρά</span>
            <label className="flex items-center gap-1 text-xs text-gray-600 ml-2">
              <input type="checkbox" checked={form.is_active ?? true} onChange={e => set('is_active', e.target.checked)} /> Ενεργό
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm({ ...item }) }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Άκυρο
            </button>
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 text-sm bg-[#1e3a5f] text-white rounded-lg hover:bg-[#162d4a] transition-colors disabled:opacity-50">
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-xl transition-all ${!item.is_active ? 'opacity-50 border-gray-200' : 'border-gray-200 hover:border-gray-300'}`}>
      <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <button className="mt-0.5 text-gray-400 flex-shrink-0">
          {expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.item_code && (
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {item.item_code}
              </span>
            )}
            {item.opske_code && (
              <span className="text-xs text-gray-400">[{item.opske_code}]</span>
            )}
            <span className="text-sm font-semibold text-gray-800">{item.title}</span>
          </div>
          {item.condition_notes && (
            <p className="text-xs text-orange-600 mt-0.5 italic">{item.condition_notes}</p>
          )}
        </div>
        <ReqBadge type={item.requirement_type} />
        {isAdmin && (
          <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditing(true)} title="Επεξεργασία"
              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
              <PencilIcon className="w-4 h-4" />
            </button>
            <button onClick={del} title="Διαγραφή"
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {expanded && item.description && (
        <div className="px-10 pb-3 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-2 mx-3">
          {item.description}
          {item.source_page && (
            <span className="ml-2 text-xs text-gray-400">(σελ. {item.source_page})</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add item form ──────────────────────────────────────────────────────────────

function AddItemForm({ setId, onAdded, meta, onCancel }) {
  const [form, setForm] = useState({
    item_code: '', opske_code: '', group_code: 'G01',
    title: '', description: '', requirement_type: 'ΥΠΟΧΡΕΩΤΙΚΟ',
    condition_notes: '', source_page: '', sort_order: 0,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { toast.error('Απαιτείται τίτλος'); return }
    setSaving(true)
    try {
      const saved = await createDocSetItem(setId, form)
      onAdded(saved)
      toast.success('Προστέθηκε')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  return (
    <div className="border border-green-300 rounded-xl p-4 bg-green-50 space-y-3">
      <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2">
        <PlusIcon className="w-4 h-4" /> Νέο Δικαιολογητικό
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <input value={form.item_code} onChange={e => set('item_code', e.target.value)}
          placeholder="Κωδικός (π.χ. NEW-16)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none" />
        <input value={form.opske_code} onChange={e => set('opske_code', e.target.value)}
          placeholder="Κωδ. ΟΠΣΚΕ (π.χ. 02.02)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select value={form.group_code} onChange={e => set('group_code', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none bg-white">
          {(meta?.groups || []).map(g => (
            <option key={g.code} value={g.code}>{g.code}: {g.name}</option>
          ))}
        </select>
        <select value={form.requirement_type} onChange={e => set('requirement_type', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none bg-white">
          {(meta?.requirement_types || Object.keys(REQ_LABELS)).map(r => (
            <option key={r} value={r}>{REQ_LABELS[r] || r}</option>
          ))}
        </select>
      </div>
      <input value={form.title} onChange={e => set('title', e.target.value)}
        placeholder="Τίτλος δικαιολογητικού *"
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none" />
      <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
        placeholder="Αναλυτικές οδηγίες για τον πελάτη..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none resize-y" />
      <input value={form.condition_notes} onChange={e => set('condition_notes', e.target.value)}
        placeholder="Σημείωση προϋπόθεσης (για υπό προϋπόθεση)"
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none" />
      <div className="flex items-center justify-between">
        <input type="text" value={form.source_page} onChange={e => set('source_page', e.target.value)}
          placeholder="Σελίδα πηγής" className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Άκυρο</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {saving ? 'Αποθήκευση…' : 'Προσθήκη'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Assign-to-case modal ──────────────────────────────────────────────────────

function AssignModal({ docSet, onClose }) {
  const [items, setItems] = useState(() =>
    (docSet.items || []).map(i => ({ ...i, selected: true }))
  )
  const [caseQuery, setCaseQuery] = useState('')
  const [caseResults, setCaseResults] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checklistTitle, setChecklistTitle] = useState(docSet.name)

  useEffect(() => {
    if (!caseQuery.trim()) { setCaseResults([]); return }
    const tid = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await getCases({ search: caseQuery, limit: 10 })
        setCaseResults(res.items || res || [])
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(tid)
  }, [caseQuery])

  const toggleItem = (id) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i))

  const toggleAll = (val) =>
    setItems(prev => prev.map(i => ({ ...i, selected: val })))

  const handleAssign = async () => {
    if (!selectedCase) { toast.error('Επιλέξτε υπόθεση'); return }
    const selected = items.filter(i => i.selected)
    if (selected.length === 0) { toast.error('Επιλέξτε τουλάχιστον ένα δικαιολογητικό'); return }
    setSaving(true)
    try {
      await createCaseDocChecklist(selectedCase.id, {
        doc_set_id: docSet.id,
        title: checklistTitle,
        items: selected.map((i, idx) => ({
          item_code: i.item_code,
          opske_code: i.opske_code,
          group_code: i.group_code,
          group_name: i.group_name,
          title: i.title,
          description: i.description,
          requirement_type: i.requirement_type,
          condition_notes: i.condition_notes,
          is_applicable: true,
          sort_order: idx,
        })),
      })
      toast.success(`Ανατέθηκε στην υπόθεση "${selectedCase.client_name}"`)
      onClose()
    } catch { toast.error('Σφάλμα ανάθεσης') } finally { setSaving(false) }
  }

  const allSelected = items.every(i => i.selected)
  const noneSelected = items.every(i => !i.selected)

  // Group items by group_name for display
  const grouped = useMemo(() => {
    const g = {}
    items.forEach(item => {
      const key = item.group_name || item.group_code || 'Λοιπά'
      if (!g[key]) g[key] = []
      g[key].push(item)
    })
    return g
  }, [items])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-[#1e3a5f]">Ανάθεση σε Υπόθεση</h2>
            <p className="text-xs text-gray-400 mt-0.5">{docSet.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Checklist title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Τίτλος λίστας</label>
            <input value={checklistTitle} onChange={e => setChecklistTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
          </div>

          {/* Case search */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Επιλογή Υπόθεσης *</label>
            {selectedCase ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-green-800">{selectedCase.client_name}</p>
                  <p className="text-xs text-green-600">{selectedCase.service_type} · ΑΦΜ {selectedCase.afm}</p>
                </div>
                <button onClick={() => { setSelectedCase(null); setCaseQuery('') }}
                  className="p-1 text-green-500 hover:text-red-500 rounded">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={caseQuery} onChange={e => setCaseQuery(e.target.value)}
                  placeholder="Αναζήτηση υπόθεσης (όνομα ή ΑΦΜ)…"
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                {(searching || caseResults.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {searching && <p className="text-xs text-gray-400 px-3 py-2">Αναζήτηση…</p>}
                    {caseResults.map(c => (
                      <button key={c.id} onClick={() => { setSelectedCase(c); setCaseQuery(''); setCaseResults([]) }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0">
                        <p className="font-semibold text-gray-800">{c.client_name}</p>
                        <p className="text-xs text-gray-400">{c.service_type} · {c.afm}</p>
                      </button>
                    ))}
                    {!searching && caseResults.length === 0 && caseQuery && (
                      <p className="text-xs text-gray-400 px-3 py-2">Δεν βρέθηκαν υποθέσεις</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Item selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">
                Δικαιολογητικά ({items.filter(i => i.selected).length}/{items.length} επιλεγμένα)
              </label>
              <div className="flex gap-2">
                <button onClick={() => toggleAll(true)} disabled={allSelected}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-40">Όλα</button>
                <button onClick={() => toggleAll(false)} disabled={noneSelected}
                  className="text-xs text-gray-500 hover:underline disabled:opacity-40">Κανένα</button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {Object.entries(grouped).map(([groupName, grpItems]) => (
                <div key={groupName}>
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    {groupName}
                  </div>
                  {grpItems.map(item => (
                    <label key={item.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors ${!item.selected ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={item.selected} onChange={() => toggleItem(item.id)}
                        className="rounded w-4 h-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.item_code && <span className="text-xs font-mono text-gray-400">{item.item_code}</span>}
                          <span className="text-xs text-gray-800 truncate">{item.title}</span>
                        </div>
                      </div>
                      <ReqBadge type={item.requirement_type} />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            {items.filter(i => i.selected).length} δικαιολογητικά θα ανατεθούν
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
              Άκυρο
            </button>
            <button onClick={handleAssign} disabled={saving || !selectedCase}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a] transition-colors disabled:opacity-50">
              <PaperAirplaneIcon className="w-4 h-4" />
              {saving ? 'Ανάθεση…' : 'Ανάθεση'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Set detail panel ───────────────────────────────────────────────────────────

function SetPanel({ setId, isAdmin, meta, onSetUpdated }) {
  const [docSet, setDocSet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [addingItem, setAddingItem] = useState(false)
  const [filterReq, setFilterReq] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [legalFormFilter, setLegalFormFilter] = useState('')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [editingSet, setEditingSet] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingSet, setSavingSet] = useState(false)

  const startEditSet = () => {
    setEditForm({
      name: docSet.name || '',
      program_category: docSet.program_category || '',
      applicant_type: docSet.applicant_type || 'both',
      description: docSet.description || '',
    })
    setEditingSet(true)
  }
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const saveSet = async () => {
    if (!editForm.name.trim()) { toast.error('Απαιτείται όνομα'); return }
    setSavingSet(true)
    try {
      const updated = await updateDocSet(setId, editForm)
      setDocSet(ds => ({ ...ds, ...updated }))
      if (onSetUpdated) onSetUpdated(updated)
      setEditingSet(false)
      toast.success('Αποθηκεύτηκε')
    } catch { toast.error('Σφάλμα') } finally { setSavingSet(false) }
  }

  useEffect(() => {
    if (!setId) return
    setLoading(true)
    getDocSet(setId).then(s => { setDocSet(s); setLoading(false) }).catch(() => setLoading(false))
  }, [setId])

  const handleItemUpdated = (updated) => {
    setDocSet(ds => ({ ...ds, items: ds.items.map(i => i.id === updated.id ? updated : i) }))
  }
  const handleItemDeleted = (id) => {
    setDocSet(ds => ({ ...ds, items: ds.items.filter(i => i.id !== id) }))
  }
  const handleItemAdded = (item) => {
    setDocSet(ds => ({ ...ds, items: [...ds.items, item] }))
    setAddingItem(false)
  }

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const groups = {}
    filteredItems.forEach(item => {
      const g = item.group_name || item.group_code || 'Λοιπά'
      if (!groups[g]) groups[g] = []
      groups[g].push(item)
    })
    win.document.write(`
      <html><head><title>${docSet.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { color: #1e3a5f; font-size: 18px; }
        h2 { color: #1e3a5f; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
        .item { margin: 8px 0; padding: 8px; border: 1px solid #eee; border-radius: 4px; }
        .badge { font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 10px; display: inline-block; }
        .ΥΠΟΧΡΕΩΤΙΚΟ { background: #fee2e2; color: #b91c1c; }
        .ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ { background: #fed7aa; color: #c2410c; }
        .ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ { background: #dbeafe; color: #1d4ed8; }
        .ΕΝΑΛΛΑΚΤΙΚΑ { background: #fef9c3; color: #854d0e; }
        .ΠΡΟΑΙΡΕΤΙΚΟ { background: #f3f4f6; color: #374151; }
        .codes { font-size: 10px; color: #888; }
        .desc { font-size: 12px; color: #555; margin-top: 4px; }
        .cond { font-size: 11px; color: #c2410c; font-style: italic; margin-top: 2px; }
        @media print { body { margin: 10mm; } }
      </style></head><body>
      <h1>${docSet.name}</h1>
      ${docSet.description ? `<p style="font-size:12px;color:#666;">${docSet.description}</p>` : ''}
      <p style="font-size:11px;color:#999;">Εκτυπώθηκε: ${new Date().toLocaleDateString('el-GR')}</p>
    `)
    Object.entries(groups).forEach(([grp, items]) => {
      win.document.write(`<h2>${grp}</h2>`)
      items.forEach((item, idx) => {
        win.document.write(`
          <div class="item">
            <span class="codes">${item.item_code || ''} ${item.opske_code ? '[' + item.opske_code + ']' : ''}</span>
            <span class="badge ${item.requirement_type}" style="margin-left:6px;">${REQ_LABELS[item.requirement_type] || item.requirement_type}</span>
            <strong style="font-size:13px;margin-left:8px;">${item.title}</strong>
            ${item.condition_notes ? `<div class="cond">▸ ${item.condition_notes}</div>` : ''}
            ${item.description ? `<div class="desc">${item.description}</div>` : ''}
          </div>
        `)
      })
    })
    win.document.write('</body></html>')
    win.document.close()
    win.print()
  }

  const filteredItems = useMemo(() => {
    if (!docSet) return []
    let items = docSet.items || []
    if (legalFormFilter) items = items.filter(i => !i.applicable_legal_forms || i.applicable_legal_forms === legalFormFilter)
    if (filterReq !== 'ALL') items = items.filter(i => i.requirement_type === filterReq)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      items = items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.item_code || '').toLowerCase().includes(q) ||
        (i.opske_code || '').toLowerCase().includes(q)
      )
    }
    return items
  }, [docSet, filterReq, searchTerm, legalFormFilter])

  // Group items by group_name
  const grouped = useMemo(() => {
    const g = {}
    filteredItems.forEach(item => {
      const key = item.group_name || item.group_code || 'Λοιπά'
      if (!g[key]) g[key] = []
      g[key].push(item)
    })
    return g
  }, [filteredItems])

  if (!setId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Επιλέξτε ένα σετ δικαιολογητικών από αριστερά</p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Φόρτωση…</div>
  if (!docSet) return <div className="flex-1 flex items-center justify-center text-red-400 text-sm">Σφάλμα φόρτωσης</div>

  const totalCount = docSet.items?.length || 0
  const mandatoryCount = (docSet.items || []).filter(i => i.requirement_type === 'ΥΠΟΧΡΕΩΤΙΚΟ').length

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {assignModalOpen && docSet && (
        <AssignModal docSet={docSet} onClose={() => setAssignModalOpen(false)} />
      )}
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 bg-white">
        {editingSet ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Όνομα σετ *</label>
                <input value={editForm.name} onChange={e => setEF('name', e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none font-semibold" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Κατηγορία</label>
                <select value={editForm.program_category} onChange={e => setEF('program_category', e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-400 focus:outline-none">
                  {['ΕΣΠΑ', 'LEADER', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'Γενικό', ''].map(c => (
                    <option key={c} value={c}>{c || '—'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Τύπος επιχείρησης</label>
                <select value={editForm.applicant_type} onChange={e => setEF('applicant_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-400 focus:outline-none">
                  {Object.entries(APPLICANT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Περιγραφή</label>
                <input value={editForm.description} onChange={e => setEF('description', e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingSet(false)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50">Άκυρο</button>
              <button onClick={saveSet} disabled={savingSet}
                className="px-5 py-1.5 text-sm bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a] disabled:opacity-50">
                {savingSet ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1e3a5f] leading-tight">{docSet.name}</h2>
                <button onClick={startEditSet}
                  className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors flex-shrink-0">
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {docSet.program_category && (
                  <span className="text-xs bg-[#1e3a5f] text-white px-2 py-0.5 rounded-full">{docSet.program_category}</span>
                )}
                {docSet.applicant_type && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{APPLICANT_LABELS[docSet.applicant_type] || docSet.applicant_type}</span>
                )}
                <span className="text-xs text-gray-500">{totalCount} δικαιολογητικά · {mandatoryCount} υποχρεωτικά</span>
              </div>
              {docSet.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{docSet.description}</p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                <PrinterIcon className="w-4 h-4" /> Εκτύπωση
              </button>
              <button onClick={() => setAssignModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#1e3a5f] text-[#1e3a5f] rounded-lg hover:bg-[#1e3a5f] hover:text-white transition-colors">
                <PaperAirplaneIcon className="w-4 h-4" /> Ανάθεση σε Υπόθεση
              </button>
              {isAdmin && (
                <button onClick={() => setAddingItem(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1e3a5f] text-white rounded-lg hover:bg-[#162d4a] transition-colors">
                  <PlusIcon className="w-4 h-4" /> Προσθήκη
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Αναζήτηση…"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none w-48"
          />
          <select
            value={legalFormFilter}
            onChange={e => setLegalFormFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:border-blue-400 focus:outline-none"
          >
            <option value="">Όλες οι νομικές μορφές</option>
            <option value="Ατομική">Ατομική Επιχείρηση</option>
            <option value="ΟΕ/ΕΕ/ΙΚΕ/ΕΠΕ">ΟΕ / ΕΕ / ΙΚΕ / ΕΠΕ</option>
            <option value="ΑΕ">ΑΕ</option>
            <option value="ΚοινΣΕπ">ΚοινΣΕπ</option>
          </select>
          <div className="flex gap-1 flex-wrap">
            {['ALL', ...Object.keys(REQ_LABELS)].map(r => (
              <button key={r}
                onClick={() => setFilterReq(r)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filterReq === r
                    ? (r === 'ALL' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : REQ_COLORS[r] + ' font-semibold')
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {r === 'ALL' ? 'Όλα' : REQ_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {addingItem && (
          <AddItemForm setId={setId} onAdded={handleItemAdded} meta={meta} onCancel={() => setAddingItem(false)} />
        )}

        {filteredItems.length === 0 && !addingItem && (
          <div className="text-center py-12 text-gray-400">
            <DocumentTextIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Δεν βρέθηκαν δικαιολογητικά</p>
          </div>
        )}

        {Object.entries(grouped).map(([groupName, items]) => (
          <div key={groupName}>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="flex-1 border-t border-gray-200" />
              {groupName}
              <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">{items.length}</span>
              <span className="flex-1 border-t border-gray-200" />
            </h3>
            <div className="space-y-1.5">
              {items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  setId={setId}
                  onUpdated={handleItemUpdated}
                  onDeleted={handleItemDeleted}
                  meta={meta}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Set sidebar ────────────────────────────────────────────────────────────────

function SetSidebar({ sets, selectedId, onSelect, isAdmin, onSetCreated, onSetDeleted, onSetUpdated }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', program_category: 'ΕΣΠΑ', program_title: '', applicant_type: 'both', description: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const [editingSetId, setEditingSetId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { toast.error('Απαιτείται όνομα'); return }
    setSaving(true)
    try {
      const saved = await createDocSet(form)
      onSetCreated(saved)
      setCreating(false)
      setForm({ name: '', program_category: 'ΕΣΠΑ', program_title: '', applicant_type: 'both', description: '', sort_order: 0 })
      toast.success('Δημιουργήθηκε')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const startEdit = (s, e) => {
    e.stopPropagation()
    setEditingSetId(s.id)
    setEditForm({ name: s.name, program_category: s.program_category || 'ΕΣΠΑ', program_title: s.program_title || '', applicant_type: s.applicant_type || 'both', description: s.description || '' })
  }

  const saveEdit = async (s, e) => {
    e.stopPropagation()
    if (!editForm.name.trim()) { toast.error('Απαιτείται όνομα'); return }
    setEditSaving(true)
    try {
      const saved = await updateDocSet(s.id, editForm)
      onSetUpdated(saved)
      setEditingSetId(null)
      toast.success('Αποθηκεύτηκε')
    } catch { toast.error('Σφάλμα') } finally { setEditSaving(false) }
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setEditingSetId(null)
  }

  const handleDelete = async (s, e) => {
    e.stopPropagation()
    if (!confirm(`Διαγραφή "${s.name}" και όλων των δικαιολογητικών του;`)) return
    await deleteDocSet(s.id)
    onSetDeleted(s.id)
    toast.success('Διαγράφηκε')
  }

  const grouped = useMemo(() => {
    const g = {}
    sets.forEach(s => {
      const cat = s.program_category || 'Γενικά'
      if (!g[cat]) g[cat] = []
      g[cat].push(s)
    })
    return g
  }, [sets])

  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-[#1e3a5f]" /> Σετ Δικαιολογητικών
          </h2>
          {isAdmin && (
            <button onClick={() => setCreating(c => !c)}
              className="p-1 text-gray-500 hover:text-[#1e3a5f] rounded transition-colors">
              <PlusIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {creating && (
          <div className="mt-3 space-y-2">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Όνομα σετ *"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.program_category} onChange={e => set('program_category', e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none">
                {['ΕΣΠΑ', 'LEADER', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'Γενικό'].map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={form.applicant_type} onChange={e => set('applicant_type', e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none">
                {Object.entries(APPLICANT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <input value={form.program_title} onChange={e => set('program_title', e.target.value)}
              placeholder="Τίτλος προγράμματος (π.χ. Καινοτομώ Κρήτη)"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreating(false)}
                className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Άκυρο</button>
              <button onClick={save} disabled={saving}
                className="px-3 py-1 text-xs bg-[#1e3a5f] text-white rounded-lg hover:bg-[#162d4a] disabled:opacity-50">
                {saving ? '…' : 'Δημιουργία'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.entries(grouped).map(([cat, catSets]) => (
          <div key={cat}>
            <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">{cat}</div>
            {catSets.map(s => (
              <React.Fragment key={s.id}>
              <div
                onClick={() => onSelect(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSelect(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all group cursor-pointer ${
                  selectedId === s.id
                    ? 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'hover:bg-white hover:shadow-sm text-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold truncate ${selectedId === s.id ? 'text-white' : 'text-gray-800'}`}>
                      {s.name}
                    </div>
                    <div className={`text-xs mt-0.5 ${selectedId === s.id ? 'text-blue-200' : 'text-gray-400'}`}>
                      {s.item_count || 0} δικαιολογητικά
                      {s.legal_form && ` · ${s.legal_form}`}
                      {!s.legal_form && s.applicant_type && ` · ${APPLICANT_LABELS[s.applicant_type] || s.applicant_type}`}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                      <button
                        onClick={e => startEdit(s, e)}
                        title="Επεξεργασία"
                        className={`p-1 rounded transition-colors ${
                          selectedId === s.id ? 'text-blue-200 hover:text-white' : 'text-gray-400 hover:text-blue-500'
                        }`}
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => handleDelete(s, e)}
                        title="Διαγραφή"
                        className={`p-1 rounded transition-colors ${
                          selectedId === s.id ? 'text-red-300 hover:text-red-100' : 'text-gray-400 hover:text-red-500'
                        }`}
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline edit form */}
              {isAdmin && editingSetId === s.id && (
                <div className="mx-1 mb-2 p-3 bg-white border border-blue-200 rounded-xl shadow-sm space-y-2" onClick={e => e.stopPropagation()}>
                  <input value={editForm.name} onChange={e => setEF('name', e.target.value)}
                    placeholder="Όνομα σετ *"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={editForm.program_category} onChange={e => setEF('program_category', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none">
                      {['ΕΣΠΑ', 'LEADER', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'Γενικό'].map(c => <option key={c}>{c}</option>)}
                    </select>
                    <select value={editForm.applicant_type} onChange={e => setEF('applicant_type', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none">
                      {Object.entries(APPLICANT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <input value={editForm.program_title} onChange={e => setEF('program_title', e.target.value)}
                    placeholder="Τίτλος προγράμματος (π.χ. Καινοτομώ Κρήτη)"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none" />
                  <textarea value={editForm.description} onChange={e => setEF('description', e.target.value)}
                    placeholder="Περιγραφή (προαιρετικό)"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit}
                      className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Άκυρο</button>
                    <button onClick={e => saveEdit(s, e)} disabled={editSaving}
                      className="px-3 py-1 text-xs bg-[#1e3a5f] text-white rounded-lg hover:bg-[#162d4a] disabled:opacity-50">
                      {editSaving ? '…' : 'Αποθήκευση'}
                    </button>
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
          </div>
        ))}

        {sets.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <FolderOpenIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-xs">Δεν υπάρχουν σετ δικαιολογητικών</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocLibraryPage() {
  const [sets, setSets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)

  const auth = getAuth()
  const isAdmin = auth?.user?.role === 'admin'

  useEffect(() => {
    Promise.all([getDocSets(), getDocLibMeta()])
      .then(([s, m]) => { setSets(s); setMeta(m); if (s.length > 0) setSelectedId(s[0].id) })
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">Φόρτωση βιβλιοθήκης…</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
      <SetSidebar
        sets={sets}
        selectedId={selectedId}
        onSelect={setSelectedId}
        isAdmin={isAdmin}
        onSetCreated={s => setSets(prev => [...prev, s])}
        onSetDeleted={id => {
          setSets(prev => prev.filter(s => s.id !== id))
          if (selectedId === id) setSelectedId(sets.filter(s => s.id !== id)[0]?.id || null)
        }}
        onSetUpdated={updated => setSets(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
      />
      <SetPanel setId={selectedId} isAdmin={isAdmin} meta={meta}
        onSetUpdated={updated => setSets(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))} />
    </div>
  )
}
