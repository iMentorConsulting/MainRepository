import { useEffect, useState } from 'react'
import { getUnits, createUnit, updateUnit, deleteUnit, syncIcalAll, syncIcalUnit } from '../api'
import toast from 'react-hot-toast'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

const TYPES = [
  { value: 'apartment', label: 'Διαμέρισμα' },
  { value: 'room', label: 'Δωμάτιο' },
  { value: 'villa', label: 'Βίλα' },
  { value: 'studio', label: 'Στούντιο' },
  { value: 'house', label: 'Σπίτι' },
  { value: 'other', label: 'Άλλο' },
]
const TYPE_LABELS = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))

const empty = { name: '', type: 'apartment', capacity: 2, description: '', base_price: 0, is_active: true, ical_url: '' }

function UnitModal({ unit, onClose, onSaved }) {
  const [form, setForm] = useState(unit ? { ...unit, ical_url: unit.ical_url || '' } : empty)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, ical_url: form.ical_url || null }
      if (unit?.id) {
        await updateUnit(unit.id, payload)
        toast.success('Η μονάδα ενημερώθηκε')
      } else {
        await createUnit(payload)
        toast.success('Η μονάδα δημιουργήθηκε')
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
      <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-800">{unit?.id ? 'Επεξεργασία Μονάδας' : 'Νέα Μονάδα'}</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Όνομα *</label>
            <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="π.χ. Διαμέρισμα 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Τύπος *</label>
              <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Χωρητικότητα</label>
              <input className="input" type="number" min={1} max={20} value={form.capacity} onChange={(e) => set('capacity', +e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Βασική τιμή/βράδυ (€)</label>
            <input className="input" type="number" min={0} step={0.01} value={form.base_price} onChange={(e) => set('base_price', +e.target.value)} />
          </div>
          <div>
            <label className="label">Περιγραφή</label>
            <textarea className="input" rows={2} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4" />
            <label htmlFor="active" className="text-sm text-gray-700">Ενεργή μονάδα</label>
          </div>

          {/* iCal section */}
          <div className="border-t border-gray-100 pt-4">
            <label className="label">Booking.com iCal URL (προαιρετικό)</label>
            <input
              className="input text-xs"
              type="url"
              value={form.ical_url}
              onChange={(e) => set('ical_url', e.target.value)}
              placeholder="https://admin.booking.com/hotel/hoteladmin/ical.html?..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Booking.com → Κρατήσεις → Εξαγωγή κρατήσεων → Αντιγραφή iCal συνδέσμου
            </p>
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

export default function Units() {
  const [units, setUnits] = useState([])
  const [modal, setModal] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingUnit, setSyncingUnit] = useState(null)

  const load = () => getUnits().then((r) => setUnits(r.data))
  useEffect(() => { load() }, [])

  const handleDelete = async (u) => {
    if (!confirm(`Διαγραφή μονάδας "${u.name}";`)) return
    try {
      await deleteUnit(u.id)
      toast.success('Η μονάδα διαγράφηκε')
      load()
    } catch {
      toast.error('Δεν ήταν δυνατή η διαγραφή')
    }
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const r = await syncIcalAll()
      const { total_added, total_updated } = r.data
      toast.success(`Sync: +${total_added} νέες, ${total_updated} ενημερώθηκαν`)
    } catch {
      toast.error('Σφάλμα συγχρονισμού')
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncUnit = async (u) => {
    setSyncingUnit(u.id)
    try {
      const r = await syncIcalUnit(u.id)
      if (r.data.error) {
        toast.error(`${u.name}: ${r.data.error}`)
      } else {
        toast.success(`${u.name}: +${r.data.added} νέες, ${r.data.updated} ενημερώθηκαν`)
      }
    } catch {
      toast.error('Σφάλμα συγχρονισμού')
    } finally {
      setSyncingUnit(null)
    }
  }

  const hasIcal = units.some(u => u.ical_url)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">Μονάδες</h2>
        <div className="flex items-center gap-2">
          {hasIcal && (
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="btn-secondary flex items-center gap-1 text-sm"
            >
              <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync Booking.com
            </button>
          )}
          <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-4 w-4" /> Νέα
          </button>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-lg mb-2">Δεν υπάρχουν μονάδες ακόμα</p>
          <button onClick={() => setModal('new')} className="btn-primary mt-2">Προσθήκη πρώτης μονάδας</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {units.map((u) => (
            <div key={u.id} className={`bg-white rounded-xl border p-4 ${u.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{u.name}</p>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[u.type] || u.type}
                  </span>
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => setModal(u)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <span>👤 {u.capacity} άτομα</span>
                <span>💶 €{u.base_price}/νύχτα</span>
              </div>
              {u.description && (
                <p className="mt-2 text-xs text-gray-400 line-clamp-2">{u.description}</p>
              )}
              {!u.is_active && (
                <span className="mt-2 inline-block text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Ανενεργή</span>
              )}
              {u.ical_url && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-blue-600 font-medium">📅 Booking.com iCal</span>
                  <button
                    onClick={() => handleSyncUnit(u)}
                    disabled={syncingUnit === u.id}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <ArrowPathIcon className={`h-3 w-3 ${syncingUnit === u.id ? 'animate-spin' : ''}`} />
                    Sync
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <UnitModal
          unit={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
