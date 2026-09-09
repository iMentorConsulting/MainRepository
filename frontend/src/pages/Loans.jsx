import { useEffect, useState } from 'react'
import { getLoans, createLoan, updateLoan, deleteLoan } from '../api'
import toast from 'react-hot-toast'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'

const empty = {
  name: '', lender: '', original_amount: '', interest_rate: '', monthly_installment: '',
  start_date: '', end_date: '', notes: '',
}

function isActive(loan) {
  const today = new Date().toISOString().slice(0, 10)
  return loan.start_date <= today && (!loan.end_date || loan.end_date >= today)
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatEur(v) {
  return `€${Number(v).toLocaleString('el-GR', { minimumFractionDigits: 0 })}`
}

function LoanModal({ loan, onClose, onSaved }) {
  const [form, setForm] = useState(loan ? { ...loan } : { ...empty })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.monthly_installment || !form.start_date) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        lender: form.lender || null,
        original_amount: parseFloat(form.original_amount) || 0,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        monthly_installment: parseFloat(form.monthly_installment),
        start_date: form.start_date,
        end_date: form.end_date || null,
        notes: form.notes || null,
      }
      if (loan?.id) {
        await updateLoan(loan.id, payload)
        toast.success('Το δάνειο ενημερώθηκε')
      } else {
        await createLoan(payload)
        toast.success('Το δάνειο καταχωρήθηκε')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-800">{loan?.id ? 'Επεξεργασία Δανείου' : 'Νέο Δάνειο'}</h3>
          <button onClick={onClose} aria-label="Κλείσιμο"><XMarkIcon className="h-5 w-5 text-gray-500" aria-hidden="true" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Περιγραφή Δανείου *</label>
            <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="π.χ. Στεγαστικό Alpha Bank" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Τράπεζα / Δανειστής</label>
              <input className="input" value={form.lender || ''} onChange={(e) => set('lender', e.target.value)} placeholder="π.χ. Alpha Bank" />
            </div>
            <div>
              <label className="label">Επιτόκιο (% ετήσιο)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.interest_rate || ''} onChange={(e) => set('interest_rate', e.target.value)} placeholder="π.χ. 4.50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Αρχικό Κεφάλαιο (€)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.original_amount || ''} onChange={(e) => set('original_amount', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Μηνιαία Δόση (€) *</label>
              <input className="input" type="number" step="0.01" min="0" required value={form.monthly_installment || ''} onChange={(e) => set('monthly_installment', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ημ/νία Έναρξης *</label>
              <input className="input" type="date" required value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Ημ/νία Λήξης</label>
              <input className="input" type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Ακύρωση</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Loans() {
  const [loans, setLoans] = useState([])
  const [modal, setModal] = useState(null)

  const load = () => getLoans().then((r) => setLoans(r.data.loans || []))
  useEffect(() => { load() }, [])

  const handleDelete = async (l) => {
    if (!confirm(`Διαγραφή δανείου "${l.name}";`)) return
    try {
      await deleteLoan(l.id)
      toast.success('Το δάνειο διαγράφηκε')
      load()
    } catch {
      toast.error('Δεν ήταν δυνατή η διαγραφή')
    }
  }

  const active = loans.filter(isActive)
  const monthlyTotal = active.reduce((s, l) => s + l.monthly_installment, 0)
  const annualTotal = monthlyTotal * 12
  const totalCapital = loans.reduce((s, l) => s + l.original_amount, 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Δανειακές Υποχρεώσεις</h2>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-4 w-4" /> Νέο Δάνειο
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-700 mb-1">Μηνιαία Υποχρέωση</p>
          <p className="text-2xl font-bold text-red-600">{formatEur(monthlyTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">ενεργά δάνεια</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-700 mb-1">Ετήσια Υποχρέωση</p>
          <p className="text-2xl font-bold text-orange-600">{formatEur(annualTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">εκτίμηση έτους</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-700 mb-1">Ενεργά Δάνεια</p>
          <p className="text-2xl font-bold text-gray-700">{active.length}</p>
          <p className="text-xs text-gray-400 mt-1">από {loans.length} σύνολο</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-700 mb-1">Αρχικό Κεφάλαιο</p>
          <p className="text-2xl font-bold text-gray-700">{formatEur(totalCapital)}</p>
          <p className="text-xs text-gray-400 mt-1">συνολικά</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Δάνειο</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Τράπεζα</th>
                <th className="text-right px-4 py-3">Μηνιαία Δόση</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Επιτόκιο</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Αρχικό Κεφ.</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Περίοδος</th>
                <th className="text-center px-4 py-3">Κατάσταση</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loans.map((l) => {
                const active = isActive(l)
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{l.name}</p>
                      {l.notes && <p className="text-xs text-gray-400 truncate max-w-[180px]">{l.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{l.lender || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formatEur(l.monthly_installment)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                      {l.interest_rate != null ? `${l.interest_rate}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden lg:table-cell">
                      {l.original_amount ? formatEur(l.original_amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                      {fmtDate(l.start_date)}{l.end_date ? ` → ${fmtDate(l.end_date)}` : ' →'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {active ? 'Ενεργό' : 'Ολοκλήρωθηκε'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setModal(l)} aria-label="Επεξεργασία" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                          <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button onClick={() => handleDelete(l)} aria-label="Διαγραφή" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {loans.length === 0 && (
            <p className="text-center py-10 text-sm text-gray-400">Δεν υπάρχουν καταχωρημένα δάνεια</p>
          )}
        </div>
      </div>

      {modal && (
        <LoanModal
          loan={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
