import { useEffect, useState } from 'react'
import { getPricingRates, createPricingRate, updatePricingRate, deletePricingRate, checkPrice, getUnits } from '../api'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const SEASON_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-red-100 text-red-800 border-red-200',
]

const UNIT_TYPES = ['Villa', 'Apartment', 'Studio', 'Room', 'Suite', 'Bungalow']

const EMPTY_RATE = {
  name: '', unit_id: null, unit_type: '', date_from: '', date_to: '',
  price_per_night: '', min_stay: 1, notes: '',
}

function fmt(n) {
  return `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateFmt(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function nightsDiff(from, to) {
  if (!from || !to) return 0
  return Math.max(0, (new Date(to) - new Date(from)) / 86400000)
}

// ── Rate Modal ────────────────────────────────────────────────────────────────
function RateModal({ rate, units, onClose, onSaved }) {
  const [form, setForm] = useState(rate ? { ...rate } : { ...EMPTY_RATE })
  const [scope, setScope] = useState(rate?.unit_id ? 'unit' : rate?.unit_type ? 'type' : 'all')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleScopeChange = (v) => {
    setScope(v)
    if (v !== 'unit') setForm(f => ({ ...f, unit_id: null }))
    if (v !== 'type') setForm(f => ({ ...f, unit_type: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) return toast.error('Συμπληρώστε όνομα περιόδου')
    if (!form.date_from || !form.date_to) return toast.error('Συμπληρώστε ημερομηνίες')
    if (new Date(form.date_to) <= new Date(form.date_from)) return toast.error('Η λήξη πρέπει να είναι μετά την έναρξη')
    if (!form.price_per_night) return toast.error('Συμπληρώστε τιμή')
    setSaving(true)
    try {
      const payload = {
        ...form,
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        unit_type: form.unit_type || null,
        price_per_night: parseFloat(form.price_per_night),
        min_stay: parseInt(form.min_stay) || 1,
      }
      if (rate?.id) await updatePricingRate(rate.id, payload)
      else await createPricingRate(payload)
      toast.success('Αποθηκεύτηκε')
      onSaved()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-800">{rate?.id ? 'Επεξεργασία Περιόδου' : 'Νέα Τιμολογιακή Περίοδος'}</h3>
          <button onClick={onClose} aria-label="Κλείσιμο"><XMarkIcon className="h-5 w-5 text-gray-500" aria-hidden="true" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          <div>
            <label className="label">Όνομα Περιόδου *</label>
            <input className="input" placeholder="π.χ. Καλοκαίρι 2025, Πάσχα, Low Season"
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ημ. Έναρξης *</label>
              <input className="input" type="date" value={form.date_from} onChange={e => set('date_from', e.target.value)} required />
            </div>
            <div>
              <label className="label">Ημ. Λήξης *</label>
              <input className="input" type="date" value={form.date_to} onChange={e => set('date_to', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Τιμή / Νύχτα (€) *</label>
              <input className="input" type="number" min="0" step="0.5"
                value={form.price_per_night} onChange={e => set('price_per_night', e.target.value)} required />
            </div>
            <div>
              <label className="label">Ελάχιστη Διαμονή (νύχτες)</label>
              <input className="input" type="number" min="1"
                value={form.min_stay} onChange={e => set('min_stay', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Εφαρμογή σε</label>
            <div className="flex gap-2 mt-1">
              {[['all', 'Όλες τις μονάδες'], ['type', 'Τύπο μονάδας'], ['unit', 'Συγκεκριμένη μονάδα']].map(([v, l]) => (
                <button key={v} type="button"
                  className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${scope === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}
                  onClick={() => handleScopeChange(v)}>{l}</button>
              ))}
            </div>
          </div>

          {scope === 'type' && (
            <div>
              <label className="label">Τύπος Μονάδας</label>
              <select className="input" value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
                <option value="">Επιλέξτε τύπο</option>
                {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {scope === 'unit' && (
            <div>
              <label className="label">Μονάδα</label>
              <select className="input" value={form.unit_id || ''} onChange={e => set('unit_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Επιλέξτε μονάδα</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium">Ακύρωση</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Price Checker ─────────────────────────────────────────────────────────────
function PriceChecker({ units }) {
  const [unitId, setUnitId] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleCheck = async () => {
    if (!unitId || !checkIn || !checkOut) return toast.error('Συμπληρώστε όλα τα πεδία')
    setLoading(true)
    try {
      const { data } = await checkPrice({ unit_id: unitId, check_in: checkIn, check_out: checkOut })
      setResult(data)
    } catch { toast.error('Σφάλμα') } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
        <MagnifyingGlassIcon className="h-5 w-5 text-blue-600" />
        Έλεγχος Τιμής για Κράτηση
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Μονάδα</label>
          <select className="input" value={unitId} onChange={e => { setUnitId(e.target.value); setResult(null) }}>
            <option value="">Επιλέξτε μονάδα</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Check-in</label>
          <input className="input" type="date" value={checkIn} onChange={e => { setCheckIn(e.target.value); setResult(null) }} />
        </div>
        <div>
          <label className="label">Check-out</label>
          <input className="input" type="date" value={checkOut} onChange={e => { setCheckOut(e.target.value); setResult(null) }} />
        </div>
      </div>
      <button onClick={handleCheck} disabled={loading}
        className="mt-3 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {loading ? 'Έλεγχος…' : 'Εύρεση Τιμής'}
      </button>

      {result && (
        <div className={`mt-4 p-4 rounded-xl border-2 ${result.rate ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm text-gray-600">
                {result.rate ? (
                  <><span className="font-semibold text-green-700">{result.rate.name}</span> — {fmt(result.rate.price_per_night)}/νύχτα</>
                ) : 'Δεν βρέθηκε ειδική τιμολογιακή περίοδος — χρησιμοποιείται βασική τιμή'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{result.nights} νύχτες</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-800">{fmt(result.suggested_price)}</div>
              <div className="text-xs text-gray-500">Συνολικό κόστος</div>
            </div>
          </div>
          {result.rate?.min_stay > 1 && (
            <div className="mt-2 text-xs text-orange-600 font-medium">
              ⚠ Ελάχιστη διαμονή {result.rate.min_stay} νύχτες για αυτή την περίοδο
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Pricing() {
  const currentYear = new Date().getFullYear()
  const [rates, setRates] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(currentYear)
  const [filterUnit, setFilterUnit] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [ratesRes, unitsRes] = await Promise.all([
        getPricingRates({ year, ...(filterUnit ? { unit_id: filterUnit } : {}) }),
        getUnits(),
      ])
      setRates(ratesRes.data)
      setUnits(unitsRes.data.filter(u => u.is_active !== false))
    } catch { toast.error('Αποτυχία φόρτωσης') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year, filterUnit])

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή τιμολογιακής περιόδου;')) return
    try {
      await deletePricingRate(id)
      toast.success('Διαγράφηκε')
      load()
    } catch { toast.error('Σφάλμα') }
  }

  // detect overlaps for same unit
  const overlapping = new Set()
  rates.forEach((a, i) => {
    rates.forEach((b, j) => {
      if (i >= j) return
      const sameScope = (a.unit_id && a.unit_id === b.unit_id) || (!a.unit_id && !b.unit_id && a.unit_type === b.unit_type)
      if (!sameScope) return
      if (a.date_from <= b.date_to && a.date_to >= b.date_from) {
        overlapping.add(a.id); overlapping.add(b.id)
      }
    })
  })

  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Τιμολόγηση</h1>
          <p className="text-sm text-gray-500 mt-0.5">Εποχιακές τιμές ανά μονάδα ή τύπο</p>
        </div>
        <button onClick={() => setModal({})}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm">
          <PlusIcon className="h-4 w-4" /> Νέα Περίοδος
        </button>
      </div>

      {/* Price Checker */}
      <PriceChecker units={units} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {years.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${year === y ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {y}
            </button>
          ))}
        </div>
        <select className="input py-1.5 text-sm w-auto" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
          <option value="">Όλες οι μονάδες</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="text-sm text-gray-500">{rates.length} περίοδοι</span>
      </div>

      {/* Overlap warning */}
      {overlapping.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          ⚠ Εντοπίστηκαν <strong>{overlapping.size / 2} αλληλεπικαλυπτόμενες</strong> περίοδοι για την ίδια μονάδα/τύπο. Ελέγξτε τα επισημασμένα.
        </div>
      )}

      {/* Rates list */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : rates.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="font-medium">Δεν υπάρχουν τιμολογιακές περίοδοι για {year}</p>
          <p className="text-sm mt-1">Προσθέστε εποχιακές τιμές με το κουμπί "Νέα Περίοδος"</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rates.map((r, idx) => {
            const color = SEASON_COLORS[idx % SEASON_COLORS.length]
            const nights = nightsDiff(r.date_from, r.date_to)
            const overlap = overlapping.has(r.id)
            return (
              <div key={r.id}
                className={`bg-white rounded-2xl border p-4 flex flex-col md:flex-row md:items-center gap-3 transition-all ${overlap ? 'border-amber-400 shadow-amber-100 shadow-md' : 'border-gray-200 hover:border-blue-200 hover:shadow-sm'}`}>

                {/* Color badge + name */}
                <div className="flex-1 flex items-start gap-3">
                  <div className={`mt-0.5 px-2.5 py-1 rounded-lg border text-xs font-bold flex-shrink-0 ${color}`}>
                    {r.date_from.slice(0, 4)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{r.name}</span>
                      {overlap && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">⚠ Επικάλυψη</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5 flex items-center flex-wrap gap-x-3 gap-y-0.5">
                      <span>{dateFmt(r.date_from)} → {dateFmt(r.date_to)}</span>
                      <span className="text-gray-300">|</span>
                      <span>{nights} ημέρες</span>
                      <span className="text-gray-300">|</span>
                      <span>
                        {r.unit_id ? r.unit_name : r.unit_type ? `Τύπος: ${r.unit_type}` : 'Όλες οι μονάδες'}
                      </span>
                      {r.min_stay > 1 && <><span className="text-gray-300">|</span><span>Min stay: {r.min_stay}N</span></>}
                    </div>
                    {r.notes && <div className="text-xs text-gray-400 mt-1 italic">{r.notes}</div>}
                  </div>
                </div>

                {/* Price + actions */}
                <div className="flex items-center gap-4 md:gap-6 justify-between md:justify-end">
                  <div className="text-right">
                    <div className="text-xl font-bold text-blue-700">{fmt(r.price_per_night)}</div>
                    <div className="text-xs text-gray-400">ανά νύχτα</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal(r)}
                      className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal !== null && (
        <RateModal
          rate={modal?.id ? modal : null}
          units={units}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
