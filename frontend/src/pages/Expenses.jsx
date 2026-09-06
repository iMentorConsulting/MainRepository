import { useEffect, useState, useMemo } from 'react'
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  getExpenseCategories, getExpenseUnitTypes, getUnits,
} from '../api'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const EMPTY = {
  date: new Date().toISOString().split('T')[0],
  category: '',
  item: '',
  vendor: '',
  amount: '',
  unit_id: '',
  unit_type: '',
  notes: '',
}

function fmt(n) {
  return Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${last}`
  return [from, to]
}

function ExpenseModal({ categories, units, unitTypes, editing, onClose, onSaved }) {
  const [form, setForm] = useState(editing ? { ...editing } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [customCat, setCustomCat] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.category || !form.item || !form.amount) {
      toast.error('Συμπληρώστε Κατηγορία, Περιγραφή και Ποσό')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        unit_id: form.unit_id ? parseInt(form.unit_id) : null,
        unit_type: form.unit_type || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
      }
      if (editing?.id) {
        await updateExpense(editing.id, payload)
        toast.success('Αποθηκεύτηκε')
      } else {
        await createExpense(payload)
        toast.success('Προστέθηκε')
      }
      onSaved()
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-800">{editing?.id ? 'Επεξεργασία Εξόδου' : 'Νέο Έξοδο'}</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ημερομηνία *</label>
              <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div>
              <label className="label">Ποσό (€) *</label>
              <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label">Κατηγορία *</label>
              <button type="button" onClick={() => setCustomCat(c => !c)}
                className="text-xs text-blue-600 hover:underline">{customCat ? 'Επιλογή από λίστα' : '+ Νέα κατηγορία'}</button>
            </div>
            {customCat
              ? <input className="input" placeholder="Νέα κατηγορία..." value={form.category}
                  onChange={e => set('category', e.target.value.toUpperCase())} required />
              : <select className="input" value={form.category} onChange={e => set('category', e.target.value)} required>
                  <option value="">Επιλέξτε κατηγορία</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            }
          </div>

          <div>
            <label className="label">Περιγραφή *</label>
            <input className="input" placeholder="π.χ. Λογαριασμός ΔΕΗ Ιουλίου" value={form.item}
              onChange={e => set('item', e.target.value)} required />
          </div>

          <div>
            <label className="label">Προμηθευτής</label>
            <input className="input" placeholder="π.χ. ΔΕΗ" value={form.vendor}
              onChange={e => set('vendor', e.target.value)} />
          </div>

          <div>
            <label className="label">Αφορά (προαιρετικό)</label>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.unit_id} onChange={e => { set('unit_id', e.target.value); set('unit_type', '') }}>
                <option value="">Συγκεκριμένη μονάδα</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="input" value={form.unit_type} onChange={e => { set('unit_type', e.target.value); set('unit_id', '') }}
                disabled={!!form.unit_id}>
                <option value="">Τύπος μονάδας</option>
                {unitTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mt-1">Αφήστε κενό για γενικό έξοδο που αφορά όλες τις μονάδες</p>
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

export default function Expenses() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState([])
  const [units, setUnits] = useState([])
  const [unitTypes, setUnitTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const [filterMonth, setFilterMonth] = useState(defaultMonth)
  const [filterCat, setFilterCat] = useState('')
  const [filterUnit, setFilterUnit] = useState('')

  const [modal, setModal] = useState(null) // null | {} (new) | expense obj (edit)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (!showAll) {
        const [from, to] = monthRange(filterMonth)
        params.from_date = from
        params.to_date = to
      }
      if (filterCat) params.category = filterCat
      if (filterUnit) {
        const uid = parseInt(filterUnit)
        if (isNaN(uid)) params.unit_type = filterUnit
        else params.unit_id = uid
      }
      const r = await getExpenses(params)
      setExpenses(r.data.expenses)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getExpenseCategories().then(r => setCategories(r.data))
    getExpenseUnitTypes().then(r => setUnitTypes(r.data))
    getUnits({ active_only: false }).then(r => setUnits(r.data))
  }, [])

  useEffect(() => { load() }, [filterMonth, filterCat, filterUnit, showAll])

  const handleDelete = async (e) => {
    try {
      await deleteExpense(e.id)
      toast.success('Διαγράφηκε')
      setDeleting(null)
      load()
    } catch {
      toast.error('Σφάλμα διαγραφής')
    }
  }

  // Group by month for subtotals
  const grouped = useMemo(() => {
    const map = {}
    expenses.forEach(e => {
      const key = e.date.slice(0, 7)
      if (!map[key]) map[key] = { key, label: e.month_year, items: [] }
      map[key].items.push(e)
    })
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
  }, [expenses])

  const unitLabel = (e) => {
    if (e.unit_id) {
      const u = units.find(u => u.id === e.unit_id)
      return u ? u.name : `#${e.unit_id}`
    }
    if (e.unit_type) return e.unit_type
    return ''
  }

  const filterUnitOptions = [
    ...units.map(u => ({ value: String(u.id), label: u.name })),
    ...unitTypes.map(t => ({ value: t, label: `[Τύπος] ${t}` })),
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">💶 Έξοδα</h2>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-4 w-4" /> Νέο Έξοδο
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
        <FunnelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        {!showAll && (
          <input type="month" className="input w-auto text-sm"
            value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
        )}
        <button onClick={() => setShowAll(s => !s)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showAll ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          {showAll ? 'Όλα τα έξοδα' : 'Εμφάνιση όλων'}
        </button>
        <select className="input w-auto text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Όλες οι κατηγορίες</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
          <option value="">Όλες οι μονάδες</option>
          {filterUnitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(filterCat || filterUnit) && (
          <button onClick={() => { setFilterCat(''); setFilterUnit('') }}
            className="text-xs text-gray-400 hover:text-red-500">✕ Καθαρισμός</button>
        )}
      </div>

      {/* Total banner */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">
          {showAll ? 'Σύνολο εξόδων' : `Σύνολο ${filterMonth.replace('-', '/')}`}
          {filterCat && <span className="ml-2 text-gray-400">· {filterCat}</span>}
        </span>
        <span className="text-2xl font-bold text-red-700">€{fmt(total)}</span>
      </div>

      {loading && <div className="text-center py-10 text-gray-400">Φόρτωση...</div>}

      {/* Table */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-3 w-24">Ημ/νία</th>
                  <th className="text-left px-4 py-3 w-20">Μ-Ε</th>
                  <th className="text-left px-4 py-3">Περιγραφή</th>
                  <th className="text-left px-4 py-3 w-40">Κατηγορία</th>
                  <th className="text-left px-4 py-3 w-32 hidden md:table-cell">Προμηθευτής</th>
                  <th className="text-left px-4 py-3 w-28 hidden lg:table-cell">Μονάδα</th>
                  <th className="text-right px-4 py-3 w-28">Ποσό €</th>
                  <th className="px-3 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">Δεν βρέθηκαν έξοδα</td></tr>
                )}
                {grouped.map(({ key, label, items }) => {
                  const monthTotal = items.reduce((s, e) => s + e.amount, 0)
                  return [
                    // Month header row (only when showing all or multiple months)
                    (showAll || grouped.length > 1) && (
                      <tr key={`hdr-${key}`} className="bg-blue-50 border-y border-blue-100">
                        <td colSpan={6} className="px-4 py-2 text-xs font-bold text-blue-700 uppercase tracking-wide">
                          {label}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-blue-700">
                          €{fmt(monthTotal)}
                        </td>
                        <td />
                      </tr>
                    ),
                    ...items.map(e => (
                      <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(e.date + 'T00:00:00').toLocaleDateString('el-GR')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{e.month_year}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{e.item}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {e.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{e.vendor}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{unitLabel(e)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">€{fmt(e.amount)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setModal(e)} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleting(e)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )),
                  ]
                })}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                    <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-700">ΣΥΝΟΛΟ</td>
                    <td className="px-4 py-3 text-right text-base font-bold text-red-700">€{fmt(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modal !== null && (
        <ExpenseModal
          categories={categories}
          units={units}
          unitTypes={unitTypes}
          editing={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800">Διαγραφή εξόδου;</h3>
            <p className="text-sm text-gray-600">
              <strong>{deleting.item}</strong> — €{fmt(deleting.amount)}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Ακύρωση</button>
              <button onClick={() => handleDelete(deleting)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
