import { useState } from 'react'
import { createPayment, deletePayment } from '../api'
import { TrashIcon, PlusIcon, CurrencyEuroIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

const TYPE_LABELS = { application: 'Αίτηση', implementation: 'Υλοποίηση', partial: 'Μερική', other: 'Άλλο' }
const TYPE_COLORS = { application: 'bg-blue-100 text-blue-700', implementation: 'bg-purple-100 text-purple-700', partial: 'bg-green-100 text-green-700', other: 'bg-gray-100 text-gray-600' }

export default function PaymentsTab({ caseId, caseData, onRefresh }) {
  const payments = caseData?.payments || []
  const [form, setForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_type: 'partial', description: '' })
  const [saving, setSaving] = useState(false)
  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Εισάγετε ποσό'); return }
    setSaving(true)
    try {
      await createPayment(caseId, { amount: parseFloat(form.amount), payment_date: form.payment_date, payment_type: form.payment_type, description: form.description })
      toast.success('Πληρωμή καταχωρήθηκε')
      setForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_type: 'partial', description: '' })
      onRefresh()
    } catch { toast.error('Σφάλμα καταχώρησης') } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή πληρωμής;')) return
    try { await deletePayment(caseId, id); toast.success('Διαγράφηκε'); onRefresh() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalAgreed = (caseData?.agreed_fee_application || 0) + (caseData?.agreed_fee_implementation || 0)

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Συμφωνηθέν', value: fmt(totalAgreed), cls: 'text-gray-900' },
          { label: 'Εισπραχθέν', value: fmt(totalPaid), cls: 'text-green-600' },
          { label: 'Υπόλοιπο', value: fmt(totalAgreed - totalPaid), cls: totalAgreed - totalPaid > 0.01 ? 'text-orange-600' : 'text-green-600' },
        ].map(r => (
          <div key={r.label} className="bg-white rounded-xl border p-4 text-center">
            <p className="text-xs text-gray-500">{r.label}</p>
            <p className={`text-xl font-bold mt-1 ${r.cls}`}>{r.value}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <PlusIcon className="w-4 h-4" /> Νέα Πληρωμή
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="label">Ποσό (€) *</label><input className="input" type="number" step="0.01" required {...f('amount')} /></div>
          <div><label className="label">Ημερομηνία</label><input className="input" type="date" {...f('payment_date')} /></div>
          <div>
            <label className="label">Τύπος</label>
            <select className="input" {...f('payment_type')}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="label">Περιγραφή</label><input className="input" {...f('description')} /></div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary mt-3">{saving ? 'Αποθήκευση...' : 'Καταχώρηση'}</button>
      </form>

      {/* Payment list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {payments.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CurrencyEuroIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Δεν υπάρχουν πληρωμές</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ημερομηνία', 'Τύπος', 'Ποσό', 'Περιγραφή', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('el-GR') : '—'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[p.payment_type] || 'bg-gray-100 text-gray-600'}`}>{TYPE_LABELS[p.payment_type] || p.payment_type}</span></td>
                  <td className="px-4 py-3 font-bold text-green-700">{fmt(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.description || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(p.id)} className="text-gray-300 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
