import { useEffect, useState } from 'react'
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../api'
import toast from 'react-hot-toast'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const empty = { fullName: '', email: '', phone: '', nationality: '', id_number: '', notes: '' }

function toApiFields(form) {
  const parts = form.fullName.trim().split(' ')
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    email: form.email,
    phone: form.phone,
    nationality: form.nationality,
    id_number: form.id_number,
    notes: form.notes,
  }
}

function CustomerModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState(
    customer
      ? { ...customer, fullName: `${customer.first_name} ${customer.last_name}`.trim() }
      : { ...empty }
  )
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim()) return
    setSaving(true)
    try {
      if (customer?.id) {
        await updateCustomer(customer.id, toApiFields(form))
        toast.success('Ο πελάτης ενημερώθηκε')
      } else {
        await createCustomer(toApiFields(form))
        toast.success('Ο πελάτης δημιουργήθηκε')
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
          <h3 className="font-bold text-gray-800">{customer?.id ? 'Επεξεργασία Πελάτη' : 'Νέος Πελάτης'}</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Ονοματεπώνυμο *</label>
            <input className="input" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="π.χ. Νίκος Παπαδόπουλος" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Τηλέφωνο</label>
              <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Εθνικότητα</label>
              <input className="input" value={form.nationality || ''} onChange={(e) => set('nationality', e.target.value)} placeholder="π.χ. Ελληνική" />
            </div>
          </div>
          <div>
            <label className="label">ΑΔΤ / Διαβατήριο</label>
            <input className="input" value={form.id_number || ''} onChange={(e) => set('id_number', e.target.value)} />
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

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)

  const load = (q) => getCustomers({ search: q || undefined }).then((r) => setCustomers(r.data))
  useEffect(() => { load() }, [])

  const handleSearch = (e) => {
    const v = e.target.value
    setSearch(v)
    clearTimeout(window._cst)
    window._cst = setTimeout(() => load(v), 300)
  }

  const handleDelete = async (c) => {
    if (!confirm(`Διαγραφή πελάτη "${c.first_name} ${c.last_name}";`)) return
    try {
      await deleteCustomer(c.id)
      toast.success('Ο πελάτης διαγράφηκε')
      load(search)
    } catch {
      toast.error('Δεν ήταν δυνατή η διαγραφή (ενδεχομένως έχει κρατήσεις)')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Πελάτες</h2>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-4 w-4" /> Νέος
        </button>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Αναζήτηση ονόματος, email, τηλεφώνου..."
          value={search}
          onChange={handleSearch}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Ονοματεπώνυμο</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Τηλέφωνο</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Εθνικότητα</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {c.first_name} {c.last_name}
                    {c.id_number && <span className="ml-2 text-xs text-gray-400">{c.id_number}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{c.nationality || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setModal(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && (
            <p className="text-center py-10 text-sm text-gray-400">
              {search ? 'Δεν βρέθηκαν αποτελέσματα' : 'Δεν υπάρχουν πελάτες ακόμα'}
            </p>
          )}
        </div>
      </div>

      {modal && (
        <CustomerModal
          customer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(search) }}
        />
      )}
    </div>
  )
}
