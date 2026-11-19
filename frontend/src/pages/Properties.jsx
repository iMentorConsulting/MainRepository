import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, PencilSquareIcon, TrashIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline'
import {
  getProperties, createProperty, updateProperty, deleteProperty,
  createRoomType, updateRoomType, deleteRoomType, addRoomTypeUnits,
} from '../api'

const emptyProperty = { name: '', legal_name: '', vat_number: '', address: '', is_active: true }
const emptyType = { name: '', unit_prefix: '', capacity: 2, base_price: 0, description: '', quantity: 1 }
const eur = (v) => `€${Math.round(Number(v) || 0).toLocaleString('el-GR')}`
const errMsg = (e, fallback) => e.response?.data?.detail || fallback

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>
}

function PropertyForm({ initial, onCancel, onSaved }) {
  const [f, setF] = useState({ ...emptyProperty, ...initial })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Δώστε όνομα καταλύματος')
    setSaving(true)
    try {
      initial?.id ? await updateProperty(initial.id, f) : await createProperty(f)
      toast.success(initial?.id ? 'Αποθηκεύτηκε' : 'Το κατάλυμα δημιουργήθηκε')
      onSaved()
    } catch (e) { toast.error(errMsg(e, 'Σφάλμα αποθήκευσης')) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={save} className="grid sm:grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
      <Field label="Όνομα καταλύματος *"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="π.χ. Riviera Suites" /></Field>
      <Field label="Επωνυμία εταιρείας"><input className="input" value={f.legal_name || ''} onChange={e => set('legal_name', e.target.value)} /></Field>
      <Field label="ΑΦΜ"><input className="input" value={f.vat_number || ''} onChange={e => set('vat_number', e.target.value)} /></Field>
      <Field label="Διεύθυνση"><input className="input" value={f.address || ''} onChange={e => set('address', e.target.value)} /></Field>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Ακύρωση</button>
        <button disabled={saving} className="btn-primary text-sm">{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</button>
      </div>
    </form>
  )
}

function TypeForm({ propertyId, initial, onCancel, onSaved }) {
  const [f, setF] = useState({ ...emptyType, ...initial })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const isNew = !initial?.id
  const prefix = (f.unit_prefix || f.name || 'Μονάδα').trim()
  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Δώστε όνομα τύπου')
    setSaving(true)
    const payload = { ...f, property_id: propertyId, capacity: +f.capacity || 1, base_price: +f.base_price || 0, quantity: isNew ? +f.quantity || 0 : 0 }
    try {
      isNew ? await createRoomType(payload) : await updateRoomType(initial.id, payload)
      toast.success(isNew ? `Ο τύπος δημιουργήθηκε${payload.quantity ? ` με ${payload.quantity} μονάδες` : ''}` : 'Αποθηκεύτηκε')
      onSaved()
    } catch (e) { toast.error(errMsg(e, 'Σφάλμα αποθήκευσης')) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-blue-50/50 border border-blue-100 rounded-lg p-4">
      <Field label="Όνομα τύπου *" className="col-span-2"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="π.χ. Riviera Loft" /></Field>
      <Field label="Όνομα μονάδων" className="col-span-2"><input className="input" value={f.unit_prefix || ''} onChange={e => set('unit_prefix', e.target.value)} placeholder="π.χ. Loft" /></Field>
      <Field label="Άτομα"><input type="number" min={1} className="input" value={f.capacity} onChange={e => set('capacity', e.target.value)} /></Field>
      <Field label="Βασική τιμή/νύχτα"><input type="number" min={0} className="input" value={f.base_price} onChange={e => set('base_price', e.target.value)} /></Field>
      {isNew && (
        <Field label="Πλήθος μονάδων"><input type="number" min={0} max={200} className="input" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
      )}
      <Field label="Περιγραφή" className={isNew ? 'col-span-2 sm:col-span-5' : 'col-span-2 sm:col-span-6'}>
        <input className="input" value={f.description || ''} onChange={e => set('description', e.target.value)} />
      </Field>
      {isNew && +f.quantity > 0 && (
        <p className="col-span-2 sm:col-span-6 text-xs text-gray-600">
          Θα δημιουργηθούν {+f.quantity} μονάδες: <strong>{prefix} 1</strong>{+f.quantity > 1 && <> … <strong>{prefix} {+f.quantity}</strong></>}
        </p>
      )}
      {!isNew && <p className="col-span-2 sm:col-span-6 text-xs text-gray-500">Άτομα και βασική τιμή ενημερώνονται σε όλες τις μονάδες του τύπου.</p>}
      <div className="col-span-2 sm:col-span-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Ακύρωση</button>
        <button disabled={saving} className="btn-primary text-sm">{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</button>
      </div>
    </form>
  )
}

export default function Properties() {
  const [props, setProps] = useState(null)
  const [editingProp, setEditingProp] = useState(null)   // 'new' | property
  const [editingType, setEditingType] = useState(null)   // { propertyId, type? }

  const load = () => getProperties().then(r => {
    setProps(r.data)
    window.dispatchEvent(new Event('istay:properties-changed'))
  }).catch(() => toast.error('Σφάλμα φόρτωσης'))
  useEffect(() => { load() }, [])

  async function removeProperty(p) {
    if (!confirm(`Διαγραφή του καταλύματος «${p.name}»;`)) return
    try { await deleteProperty(p.id); toast.success('Διαγράφηκε'); load() } catch (e) { toast.error(errMsg(e, 'Σφάλμα διαγραφής')) }
  }
  async function removeType(t) {
    if (!confirm(`Διαγραφή του τύπου «${t.name}» και των ${t.units.length} μονάδων του;`)) return
    try { await deleteRoomType(t.id); toast.success('Διαγράφηκε'); load() } catch (e) { toast.error(errMsg(e, 'Σφάλμα διαγραφής')) }
  }
  async function addUnits(t) {
    const n = parseInt(prompt(`Πόσες μονάδες να προστεθούν στον τύπο «${t.name}»;`, '1'), 10)
    if (!n || n < 1) return
    try { await addRoomTypeUnits(t.id, n); toast.success(`Προστέθηκαν ${n} μονάδες`); load() } catch (e) { toast.error(errMsg(e, 'Σφάλμα')) }
  }

  if (!props) return <div className="p-6 text-sm text-gray-400">Φόρτωση…</div>

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BuildingOffice2Icon className="w-7 h-7 text-blue-600" /> Καταλύματα & Τύποι
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Ο <strong>τύπος</strong> είναι αυτό που πουλάτε στις πλατφόρμες (π.χ. Riviera Loft) και οι <strong>μονάδες</strong> του
            είναι οι πραγματικές σουίτες. Μια βίλα είναι τύπος με 1 μονάδα.
          </p>
        </div>
        <button onClick={() => setEditingProp('new')} className="btn-primary text-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Νέο κατάλυμα
        </button>
      </div>

      {editingProp === 'new' && <PropertyForm onCancel={() => setEditingProp(null)} onSaved={() => { setEditingProp(null); load() }} />}

      {props.map(p => (
        <section key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">{p.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {p.room_types.length} {p.room_types.length === 1 ? 'τύπος' : 'τύποι'} · {p.unit_count} {p.unit_count === 1 ? 'μονάδα' : 'μονάδες'}
                {p.legal_name && <> · {p.legal_name}</>}{p.vat_number && <> · ΑΦΜ {p.vat_number}</>}
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditingType({ propertyId: p.id })} className="btn-secondary text-xs flex items-center gap-1"><PlusIcon className="w-3.5 h-3.5" /> Νέος τύπος</button>
              <button onClick={() => setEditingProp(p)} title="Επεξεργασία" className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><PencilSquareIcon className="w-4 h-4" /></button>
              <button onClick={() => removeProperty(p)} title="Διαγραφή" className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {editingProp?.id === p.id && <PropertyForm initial={p} onCancel={() => setEditingProp(null)} onSaved={() => { setEditingProp(null); load() }} />}
            {editingType?.propertyId === p.id && !editingType.type && (
              <TypeForm propertyId={p.id} onCancel={() => setEditingType(null)} onSaved={() => { setEditingType(null); load() }} />
            )}

            {p.room_types.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Δεν υπάρχουν τύποι ακόμα — προσθέστε τον πρώτο με «Νέος τύπος».</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {p.room_types.map(t => (
                  <li key={t.id} className="py-3 space-y-2">
                    {editingType?.type?.id === t.id ? (
                      <TypeForm propertyId={p.id} initial={t} onCancel={() => setEditingType(null)} onSaved={() => { setEditingType(null); load() }} />
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {t.name}
                            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 tabular-nums">
                              διαθεσιμότητα {t.quantity}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{t.capacity} άτομα · {eur(t.base_price)}/νύχτα βασική τιμή</p>
                          {t.units.length > 1 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {t.units.map(u => (
                                <span key={u.id} className={`text-[11px] px-2 py-0.5 rounded border ${u.is_active ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-white border-dashed border-gray-300 text-gray-400 line-through'}`}>{u.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => addUnits(t)} className="btn-secondary text-xs">+ Μονάδες</button>
                          <button onClick={() => setEditingType({ propertyId: p.id, type: t })} title="Επεξεργασία" className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><PencilSquareIcon className="w-4 h-4" /></button>
                          <button onClick={() => removeType(t)} title="Διαγραφή" className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
