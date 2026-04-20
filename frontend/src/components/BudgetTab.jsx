import { useState } from 'react'
import { createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from '../api'
import { TrashIcon, PlusIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

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
  const [form, setForm] = useState({ category_name: '', approved_amount: '', percent_of_budget: '' })
  const [saving, setSaving] = useState(false)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.category_name.trim()) return
    setSaving(true)
    try {
      await createBudgetCategory(caseId, {
        category_name: form.category_name,
        approved_amount: parseFloat(form.approved_amount) || 0,
        percent_of_budget: parseFloat(form.percent_of_budget) || 0,
      })
      toast.success('Κατηγορία προστέθηκε')
      setForm({ category_name: '', approved_amount: '', percent_of_budget: '' })
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

  return (
    <div className="space-y-5">
      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><PlusIcon className="w-4 h-4" />Νέα Κατηγορία</h3>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-32"><label className="label">Κατηγορία *</label><input className="input" required value={form.category_name} onChange={e => setForm(p => ({ ...p, category_name: e.target.value }))} /></div>
          <div><label className="label">Εγκεκριμένο (€)</label><input className="input w-36" type="number" step="0.01" value={form.approved_amount} onChange={e => setForm(p => ({ ...p, approved_amount: e.target.value }))} /></div>
          <div><label className="label">% Προϋπολογισμού</label><input className="input w-28" type="number" step="0.1" value={form.percent_of_budget} onChange={e => setForm(p => ({ ...p, percent_of_budget: e.target.value }))} /></div>
          <div className="flex items-end"><button type="submit" disabled={saving} className="btn-primary">{saving ? '...' : 'Προσθήκη'}</button></div>
        </div>
      </form>

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
                    <td className="px-3 py-2 text-gray-500">{c.percent_of_budget || 0}%</td>
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
