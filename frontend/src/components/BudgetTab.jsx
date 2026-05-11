import { useState } from 'react'
import { createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from '../api'
import { TrashIcon, PlusIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PRESET_CATEGORIES = [
  'Κτηριακά',
  'Εξοπλισμοί',
  'Μισθολογικά',
  'Διαφήμιση',
  'Συμβουλευτικές Υπηρεσίες',
  'Green Δαπάνες',
  'Έμμεσες Δαπάνες',
]

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || 0)

  const handleBlur = () => {
    setEditing(false)
    const n = parseFloat(val) || 0
    if (n !== (value || 0)) onSave(n)
  }

  if (editing) return (
    <input
      className="w-24 border rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-blue-400"
      type="number" step="0.01" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={handleBlur}
      autoFocus
    />
  )
  return (
    <span onClick={() => setEditing(true)} className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded text-sm">
      {fmt(value)}
    </span>
  )
}

export default function BudgetTab({ caseId, caseData, onRefresh }) {
  const cats = caseData?.budget_categories || []
  const [form, setForm] = useState({ category_name: '', approved_amount: '' })
  const [saving, setSaving] = useState(false)

  const existingNames = new Set(cats.map(c => c.category_name))

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.category_name.trim()) return
    setSaving(true)
    try {
      await createBudgetCategory(caseId, {
        category_name: form.category_name,
        approved_amount: parseFloat(form.approved_amount) || 0,
        percent_of_budget: 0,
      })
      toast.success('Κατηγορία προστέθηκε')
      setForm({ category_name: '', approved_amount: '' })
      onRefresh()
    } catch { toast.error('Σφάλμα προσθήκης') } finally { setSaving(false) }
  }

  const handleQuickAdd = async (name) => {
    setSaving(true)
    try {
      await createBudgetCategory(caseId, { category_name: name, approved_amount: 0, percent_of_budget: 0 })
      toast.success(`"${name}" προστέθηκε`)
      onRefresh()
    } catch { toast.error('Σφάλμα προσθήκης') } finally { setSaving(false) }
  }

  const handleUpdate = async (catId, field, value) => {
    try { await updateBudgetCategory(caseId, catId, { [field]: value }); onRefresh() }
    catch { toast.error('Σφάλμα ενημέρωσης') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή κατηγορίας;')) return
    try { await deleteBudgetCategory(caseId, id); toast.success('Διαγράφηκε'); onRefresh() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  // Totals
  const totals = cats.reduce((acc, c) => ({
    approved: acc.approved + (c.approved_amount || 0),
    r1: acc.r1 + (c.certified_request1 || 0),
    r2: acc.r2 + (c.certified_request2 || 0),
    rf: acc.rf + (c.certified_final || 0),
    certified: acc.certified + (c.total_certified || 0),
    remaining: acc.remaining + (c.remaining || 0),
  }), { approved: 0, r1: 0, r2: 0, rf: 0, certified: 0, remaining: 0 })

  const pct = (amount) => totals.approved > 0
    ? `${((amount / totals.approved) * 100).toFixed(1)}%`
    : '—'

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><PlusIcon className="w-4 h-4" />Νέα Κατηγορία</h3>

        {/* Quick-add preset buttons */}
        <div className="flex flex-wrap gap-2">
          {PRESET_CATEGORIES.filter(n => !existingNames.has(n)).map(name => (
            <button
              key={name}
              type="button"
              disabled={saving}
              onClick={() => handleQuickAdd(name)}
              className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              + {name}
            </button>
          ))}
          {PRESET_CATEGORIES.every(n => existingNames.has(n)) && (
            <span className="text-xs text-gray-400 italic">Όλες οι προεπιλεγμένες κατηγορίες έχουν προστεθεί</span>
          )}
        </div>

        {/* Custom add */}
        <form onSubmit={handleAdd} className="flex gap-3 flex-wrap items-end border-t pt-3">
          <div className="flex-1 min-w-32">
            <label className="label">Νέα κατηγορία (ελεύθερο κείμενο)</label>
            <input className="input" value={form.category_name} onChange={e => setForm(p => ({ ...p, category_name: e.target.value }))} placeholder="π.χ. Λογισμικό" />
          </div>
          <div>
            <label className="label">Εγκεκριμένο (€)</label>
            <input className="input w-36" type="number" step="0.01" value={form.approved_amount} onChange={e => setForm(p => ({ ...p, approved_amount: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving || !form.category_name.trim()} className="btn-primary">{saving ? '...' : 'Προσθήκη'}</button>
        </form>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400">Κάντε κλικ σε ένα ποσό για να το επεξεργαστείτε ✏️</p>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {cats.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ChartBarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Δεν υπάρχουν κατηγορίες προϋπολογισμού</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Κατηγορία', '%', 'Εγκεκριμένο', '1ο Αίτημα', '2ο Αίτημα', 'Τελικό', 'Πιστοποιηθέν', 'Απομένει', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cats.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{c.category_name}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono">{pct(c.approved_amount)}</td>
                    <td className="px-3 py-2"><EditableCell value={c.approved_amount} onSave={v => handleUpdate(c.id, 'approved_amount', v)} /></td>
                    <td className="px-3 py-2"><EditableCell value={c.certified_request1} onSave={v => handleUpdate(c.id, 'certified_request1', v)} /></td>
                    <td className="px-3 py-2"><EditableCell value={c.certified_request2} onSave={v => handleUpdate(c.id, 'certified_request2', v)} /></td>
                    <td className="px-3 py-2"><EditableCell value={c.certified_final} onSave={v => handleUpdate(c.id, 'certified_final', v)} /></td>
                    <td className="px-3 py-2 font-semibold text-green-700">{fmt(c.total_certified)}</td>
                    <td className="px-3 py-2 font-semibold text-orange-600">{fmt(c.remaining)}</td>
                    <td className="px-3 py-2"><button onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                <tr className="font-bold text-blue-800">
                  <td className="px-3 py-2" colSpan={2}>ΣΥΝΟΛΑ</td>
                  <td className="px-3 py-2">{fmt(totals.approved)}</td>
                  <td className="px-3 py-2">{fmt(totals.r1)}</td>
                  <td className="px-3 py-2">{fmt(totals.r2)}</td>
                  <td className="px-3 py-2">{fmt(totals.rf)}</td>
                  <td className="px-3 py-2 text-green-700">{fmt(totals.certified)}</td>
                  <td className="px-3 py-2 text-orange-600">{fmt(totals.remaining)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
