import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getUnits, getBookings, getPricingRates, createCustomer, createBooking, blockDates } from '../api'
import { format, addMonths, subMonths, getDaysInMonth, startOfMonth, addDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline'

const CHANNEL_BG = {
  booking: 'bg-blue-600',
  airbnb: 'bg-red-500',
  direct: 'bg-emerald-500',
  oga: 'bg-purple-500',
  social_tourism: 'bg-teal-500',
  blocked: 'bg-gray-500',
  other: 'bg-gray-400',
}
const CHANNEL_LABELS = {
  booking: 'Booking', airbnb: 'Airbnb', direct: 'Απευθείας',
  oga: 'ΟΓΑ', social_tourism: 'Κοιν.Τουρ.', other: 'Άλλο',
}
const BOOKING_CHANNELS = ['airbnb', 'booking', 'direct', 'oga', 'social_tourism', 'other']
const STATUS_OPACITY = { confirmed: '', pending: 'opacity-60', cancelled: 'opacity-30 line-through' }
const DAY_W = 48   // wider squares to fit more content
const ROW_H = 64   // taller rows for name + rate + guests

export default function Calendar() {
  const navigate = useNavigate()
  const [units, setUnits] = useState([])
  const [bookings, setBookings] = useState([])
  const [rates, setRates] = useState([])
  const [month, setMonth] = useState(new Date())
  const scrollRef = useRef(null)

  const [drag, setDrag] = useState(null)   // { unitId, startDay, endDay }
  const [popup, setPopup] = useState(null)
  const [modal, setModal] = useState(null)

  const year = month.getFullYear()
  const mon = month.getMonth()
  const daysInMonth = getDaysInMonth(month)
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, mon, i + 1))

  const fromDate = format(startOfMonth(month), 'yyyy-MM-dd')
  const toDate = format(addDays(startOfMonth(addMonths(month, 1)), -1), 'yyyy-MM-dd')

  const loadBookings = useCallback(() => {
    getBookings({ from_date: fromDate, to_date: toDate, limit: 1000 }).then(r => setBookings(r.data))
  }, [fromDate, toDate])

  useEffect(() => { getUnits({ active_only: true }).then(r => setUnits(r.data)) }, [])
  useEffect(() => { loadBookings() }, [loadBookings])
  useEffect(() => {
    getPricingRates({ year }).then(r => setRates(r.data)).catch(() => {})
  }, [year])

  // Cancel drag on window mouseup (fires after cell onMouseUp so popup is shown first)
  useEffect(() => {
    const up = () => setDrag(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const bookingsByUnit = {}
  units.forEach(u => { bookingsByUnit[u.id] = [] })
  bookings.forEach(b => { if (bookingsByUnit[b.unit_id] !== undefined) bookingsByUnit[b.unit_id].push(b) })

  const today = format(new Date(), 'yyyy-MM-dd')
  const selMin = drag ? Math.min(drag.startDay, drag.endDay) : null
  const selMax = drag ? Math.max(drag.startDay, drag.endDay) : null

  // Find pricing rate for a unit+date (unit-specific wins over global)
  const findRate = useCallback((unitId, dateStr) => {
    const match = rates.filter(r =>
      dateStr >= r.date_from && dateStr <= r.date_to &&
      (r.unit_id === unitId || !r.unit_id)
    ).sort((a, b) => (b.unit_id ? 1 : 0) - (a.unit_id ? 1 : 0))
    return match[0] || null
  }, [rates])

  // Build a set of dates covered by any booking per unit (for empty-cell rate display)
  const bookedDates = {}
  units.forEach(u => { bookedDates[u.id] = new Set() })
  bookings.forEach(b => {
    if (b.status === 'cancelled') return
    if (bookedDates[b.unit_id] === undefined) return
    const bIn = new Date(b.check_in + 'T00:00:00')
    const bOut = new Date(b.check_out + 'T00:00:00')
    let cur = new Date(bIn)
    while (cur < bOut) {
      bookedDates[b.unit_id].add(format(cur, 'yyyy-MM-dd'))
      cur = addDays(cur, 1)
    }
  })

  const handleDayMouseDown = (e, unitId, dayNum) => {
    e.preventDefault()
    setPopup(null)
    setDrag({ unitId, startDay: dayNum, endDay: dayNum })
  }

  const handleDayMouseEnter = (unitId, dayNum) => {
    if (drag && drag.unitId === unitId) {
      setDrag(d => d ? { ...d, endDay: dayNum } : d)
    }
  }

  const handleDayMouseUp = (e, unitId, dayNum, unitName) => {
    if (!drag || drag.unitId !== unitId) return
    const min = Math.min(drag.startDay, dayNum)
    const max = Math.max(drag.startDay, dayNum)
    const checkIn = format(new Date(year, mon, min), 'yyyy-MM-dd')
    const checkOut = format(new Date(year, mon, max + 1), 'yyyy-MM-dd')
    setDrag(null)
    if (checkIn >= checkOut) return
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup({ unitId, checkIn, checkOut, unitName, top: rect.bottom + 6, left: rect.left })
  }

  return (
    <div className="p-4 md:p-6 space-y-4" onMouseLeave={() => setDrag(null)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Ημερολόγιο</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold min-w-[120px] text-center">
            {format(month, 'MMMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm inline-block ${CHANNEL_BG[k]}`} /> {v}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-gray-500" /> Μπλοκ</span>
        <span className="flex items-center gap-1 text-gray-400">✓ = Τιμολογήθηκε</span>
        <span className="text-gray-400 ml-2">· Σύρτε για νέα κράτηση / μπλοκ</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white select-none" ref={scrollRef}>
        <div style={{ minWidth: `${160 + daysInMonth * DAY_W}px` }}>
          {/* Day headers */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="w-40 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200">Μονάδα</div>
            {days.map(d => {
              const ds = format(d, 'yyyy-MM-dd')
              const isToday = ds === today
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={ds} style={{ width: `${DAY_W}px` }} className={`flex-shrink-0 text-center py-1.5 text-xs border-r border-gray-100 ${
                  isToday ? 'bg-blue-50 font-bold text-blue-700' : isWeekend ? 'text-gray-500 bg-gray-50' : 'text-gray-400'
                }`}>
                  <div className="font-medium leading-tight">{format(d, 'd')}</div>
                  <div style={{ fontSize: '9px' }}>{format(d, 'EEE', { locale: el })}</div>
                </div>
              )
            })}
          </div>

          {/* Unit rows */}
          {units.map(u => (
            <div key={u.id} className="flex border-b border-gray-100 hover:bg-gray-50/30">
              <div className="w-40 flex-shrink-0 px-3 border-r border-gray-200 flex items-center" style={{ height: `${ROW_H}px` }}>
                <p className="text-xs font-semibold text-gray-700 truncate">{u.name}</p>
              </div>
              <div className="flex relative" style={{ height: `${ROW_H}px` }}>
                {days.map(d => {
                  const ds = format(d, 'yyyy-MM-dd')
                  const dayNum = d.getDate()
                  const isToday = ds === today
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const isSelected = drag?.unitId === u.id && dayNum >= selMin && dayNum <= selMax
                  const isBooked = bookedDates[u.id]?.has(ds)
                  const rate = !isBooked ? findRate(u.id, ds) : null
                  return (
                    <div
                      key={ds}
                      style={{ width: `${DAY_W}px`, height: `${ROW_H}px` }}
                      className={`flex-shrink-0 border-r border-gray-100 cursor-crosshair relative transition-colors ${
                        isSelected ? 'bg-blue-200' :
                        isToday ? 'bg-blue-50' :
                        isWeekend ? 'bg-gray-50' : ''
                      }`}
                      onMouseDown={e => handleDayMouseDown(e, u.id, dayNum)}
                      onMouseEnter={() => handleDayMouseEnter(u.id, dayNum)}
                      onMouseUp={e => handleDayMouseUp(e, u.id, dayNum, u.name)}
                    >
                      {/* Pricing rate on vacant cells only */}
                      {rate && (
                        <span className="absolute bottom-1 left-0 right-0 text-center text-gray-300 pointer-events-none"
                          style={{ fontSize: '10px', lineHeight: 1 }}>
                          €{Math.round(rate.price_per_night)}
                        </span>
                      )}
                    </div>
                  )
                })}

                {/* Booking blocks */}
                {(bookingsByUnit[u.id] || []).map(b => {
                  if (b.status === 'cancelled') return null
                  const bIn = new Date(b.check_in + 'T00:00:00')
                  const bOut = new Date(b.check_out + 'T00:00:00')
                  const monthStart = new Date(year, mon, 1)
                  const monthEnd = new Date(year, mon + 1, 1)
                  const dispStart = bIn < monthStart ? monthStart : bIn
                  const dispEnd = bOut > monthEnd ? monthEnd : bOut
                  const startDay = dispStart.getDate() - 1
                  // Fix: if dispEnd equals monthEnd (first of next month), use daysInMonth as end index
                  const endDay = dispEnd >= monthEnd ? daysInMonth : dispEnd.getDate() - 1
                  const span = endDay - startDay
                  if (span <= 0) return null

                  const left = startDay * DAY_W
                  const width = span * DAY_W - 2
                  const nights = Math.round((bOut - bIn) / 86400000)
                  const isBlocked = b.channel === 'blocked' || b.customer?.first_name === 'BLOCKED'
                  const dailyRate = !isBlocked && nights > 0 && b.total_price > 0
                    ? Math.round(b.total_price / nights)
                    : null
                  // For blocked days, show the configured pricing rate
                  const blockedRate = isBlocked ? findRate(u.id, b.check_in) : null
                  const showSecondLine = width > 46 // enough room for rate/guests

                  return (
                    <div
                      key={b.id}
                      title={isBlocked
                        ? `🔒 Μπλοκ ${b.check_in} – ${b.check_out}\n${b.notes || ''}`
                        : `${b.customer.first_name} ${b.customer.last_name}\n${b.check_in} – ${b.check_out} (${nights} νύχτες)\nΑ: ${b.guests}  Σύνολο: €${b.total_price}  Ημ/νύχτα: €${dailyRate || '—'}`
                      }
                      onClick={() => !isBlocked && navigate(`/bookings?edit=${b.id}`)}
                      className={`absolute rounded text-white flex flex-col justify-center px-1.5 overflow-hidden transition-all pointer-events-auto
                        ${isBlocked ? 'cursor-default opacity-80 bg-gray-500' : `cursor-pointer hover:brightness-110 ${CHANNEL_BG[b.channel] || 'bg-gray-400'}`}
                        ${STATUS_OPACITY[b.status]}`}
                      style={{ top: '4px', left: `${left}px`, width: `${width}px`, height: `${ROW_H - 8}px`, zIndex: 1 }}
                    >
                      {/* Name / lock line */}
                      <span className="truncate font-semibold leading-tight" style={{ fontSize: '11px' }}>
                        {isBlocked ? '🔒 Μπλοκ' : `${b.customer.last_name}${b.is_billed ? ' ✓' : ''}`}
                      </span>

                      {/* Rate + guests line — always show when there's room */}
                      {showSecondLine && (
                        <span className="truncate leading-tight text-white/75 flex items-center gap-1.5" style={{ fontSize: '10px' }}>
                          {isBlocked
                            ? (blockedRate ? `€${Math.round(blockedRate.price_per_night)}` : null)
                            : dailyRate
                              ? <>€{dailyRate}/ν {b.guests > 0 && <span className="opacity-80">·{b.guests}👤</span>}</>
                              : (b.guests > 0 ? `${b.guests}👤` : null)
                          }
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {units.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Δεν υπάρχουν μονάδες.</div>
          )}
        </div>
      </div>

      {popup && (
        <SelectionPopup
          popup={popup}
          onBook={() => { setModal({ mode: 'booking', ...popup }); setPopup(null) }}
          onBlock={() => { setModal({ mode: 'block', ...popup }); setPopup(null) }}
          onClose={() => setPopup(null)}
        />
      )}

      {modal && (
        <QuickModal
          modal={modal}
          units={units}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadBookings() }}
        />
      )}
    </div>
  )
}

function SelectionPopup({ popup, onBook, onBlock, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const safeTop = Math.min(popup.top, window.innerHeight - 170)
  const safeLeft = Math.min(popup.left, window.innerWidth - 250)

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 shadow-xl rounded-xl p-3 space-y-2 w-56"
      style={{ top: safeTop, left: safeLeft }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 truncate">{popup.unitName}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><XMarkIcon className="w-4 h-4" /></button>
      </div>
      <p className="text-xs text-gray-500">{popup.checkIn} → {popup.checkOut}</p>
      <button onClick={onBook}
        className="w-full text-left px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-medium transition-colors">
        📅 Νέα Κράτηση
      </button>
      <button onClick={onBlock}
        className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium transition-colors">
        🔒 Μπλοκάρισμα
      </button>
    </div>
  )
}

function QuickModal({ modal, units, onClose, onSaved }) {
  const isBlock = modal.mode === 'block'
  const [form, setForm] = useState({
    first_name: '', last_name: '', channel: 'direct',
    total_price: '', guests: '2', notes: '',
    unit_id: modal.unitId, check_in: modal.checkIn, check_out: modal.checkOut,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const nightCount = (() => {
    try { return Math.round((new Date(form.check_out) - new Date(form.check_in)) / 86400000) } catch { return 0 }
  })()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isBlock) {
        await blockDates({ unit_id: Number(form.unit_id), check_in: form.check_in, check_out: form.check_out, notes: form.notes || 'Μπλοκαρισμένο' })
        toast.success('Οι ημέρες μπλοκαρίστηκαν!')
      } else {
        if (!form.first_name.trim()) { toast.error('Εισάγετε όνομα επισκέπτη'); setSaving(false); return }
        const cust = await createCustomer({ first_name: form.first_name.trim(), last_name: form.last_name.trim() || '—' })
        await createBooking({
          unit_id: Number(form.unit_id),
          customer_id: cust.data.id,
          channel: form.channel,
          check_in: form.check_in,
          check_out: form.check_out,
          guests: Number(form.guests) || 1,
          total_price: parseFloat(form.total_price) || 0,
          notes: form.notes,
          status: 'confirmed',
        })
        toast.success('Κράτηση δημιουργήθηκε!')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">
            {isBlock ? '🔒 Μπλοκάρισμα Ημερών' : '📅 Νέα Κράτηση'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-2">
            <div className="flex gap-3 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Μονάδα</p>
                <select className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none"
                  value={form.unit_id} onChange={e => set('unit_id', e.target.value)}>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Check-in</p>
                <input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)}
                  className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Check-out</p>
                <input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)}
                  className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none" />
              </div>
            </div>
            {nightCount > 0 && <p className="text-xs text-gray-400">{nightCount} νύχτες</p>}
          </div>

          {isBlock ? (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Σημείωση (προαιρετικά)</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="π.χ. Συντήρηση, Ιδιόχρηση..." value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Όνομα *</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    placeholder="Όνομα" value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Επώνυμο</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    placeholder="Επώνυμο" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Κανάλι</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    value={form.channel} onChange={e => set('channel', e.target.value)}>
                    {BOOKING_CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Σύνολο (€)</label>
                  <input type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    placeholder="0.00" value={form.total_price} onChange={e => set('total_price', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Άτομα</label>
                  <input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    value={form.guests} onChange={e => set('guests', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Σημειώσεις</label>
                <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  placeholder="Προαιρετικά..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50">
              Ακύρωση
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                isBlock ? 'bg-gray-600 hover:bg-gray-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}>
              {saving ? 'Αποθήκευση…' : isBlock ? '🔒 Μπλοκάρισμα' : '📅 Δημιουργία Κράτησης'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
