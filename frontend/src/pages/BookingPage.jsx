import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

const MONTHS_EL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
  'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
const DAYS_EL = ['Κυ','Δε','Τρ','Τε','Πέ','Πα','Σά']
const COLOR = '#1e3a5f'

function addMonths(d, n) {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseISO(s) {
  const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d)
}
function fmtDate(iso) {
  return new Date(iso+'T00:00').toLocaleDateString('el-GR', { day:'numeric', month:'long', year:'numeric' })
}

function MonthGrid({ year, month, bookedSet, selected, onDateClick }) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month+1, 0)
  const startDay = first.getDay()
  const today = toISO(new Date())

  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)

  return (
    <div>
      <div className="text-center font-semibold text-gray-700 mb-3 text-sm">
        {MONTHS_EL[month]} {year}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_EL.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const past = iso < today
          const booked = bookedSet.has(iso)
          const isCI = selected.checkIn === iso
          const isCO = selected.checkOut === iso
          const inRange = selected.checkIn && selected.checkOut &&
            iso > selected.checkIn && iso < selected.checkOut

          let cls = 'h-9 w-full rounded-lg text-sm flex items-center justify-center transition-all font-medium '
          if (past || booked) {
            cls += booked
              ? 'bg-red-50 text-red-300 cursor-not-allowed line-through text-xs'
              : 'text-gray-300 cursor-not-allowed'
          } else if (isCI || isCO) {
            cls += 'text-white font-bold cursor-pointer shadow-md'
          } else if (inRange) {
            cls += 'bg-blue-50 text-blue-700 cursor-pointer'
          } else {
            cls += 'hover:bg-gray-100 text-gray-700 cursor-pointer hover:scale-105'
          }

          return (
            <button key={i} className={cls}
              style={(isCI || isCO) ? { background: COLOR } : {}}
              disabled={past || booked}
              onClick={() => !past && !booked && onDateClick(iso)}>
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Amenity({ icon, label }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

export default function BookingPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState({ checkIn: null, checkOut: null })
  const [form, setForm] = useState({ guest_name:'', guest_email:'', guest_phone:'', guests:1, message:'' })
  const [step, setStep] = useState('browse') // browse | book | success
  const [submitting, setSubmitting] = useState(false)
  const calendarRef = useRef(null)

  useEffect(() => {
    api.get(`/widget/info/${token}`)
      .then(r => setInfo(r.data))
      .catch(() => setError(true))
  }, [token])

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400 p-8">
        <div className="text-5xl mb-3">🏠</div>
        <p className="text-lg font-semibold text-gray-600">Η σελίδα δεν βρέθηκε</p>
      </div>
    </div>
  )

  if (!info) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-4 border-t-transparent rounded-full" style={{ borderColor: COLOR, borderTopColor: 'transparent' }} />
    </div>
  )

  const bookedSet = new Set(info.booked_dates)
  const now = new Date()
  const months = [0, 1, 2].map(i => addMonths(now, monthOffset + i))

  const handleDateClick = (iso) => {
    if (!selected.checkIn || (selected.checkIn && selected.checkOut)) {
      setSelected({ checkIn: iso, checkOut: null })
    } else {
      if (iso <= selected.checkIn) {
        setSelected({ checkIn: iso, checkOut: null })
      } else {
        const ci = parseISO(selected.checkIn)
        const co = parseISO(iso)
        let cur = new Date(ci); cur.setDate(cur.getDate()+1)
        let conflict = false
        while (cur < co) {
          if (bookedSet.has(toISO(cur))) { conflict = true; break }
          cur.setDate(cur.getDate()+1)
        }
        if (conflict) setSelected({ checkIn: iso, checkOut: null })
        else setSelected({ checkIn: selected.checkIn, checkOut: iso })
      }
    }
  }

  const nights = selected.checkIn && selected.checkOut
    ? Math.round((parseISO(selected.checkOut) - parseISO(selected.checkIn)) / 86400000)
    : 0

  const totalPrice = nights * info.base_price

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await api.post(`/widget/inquiry/${token}`, {
        ...form,
        check_in: selected.checkIn,
        check_out: selected.checkOut,
      })
      setStep('success')
    } catch {
      alert('Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.')
    } finally {
      setSubmitting(false)
    }
  }

  const unitTypeLabel = {
    villa: 'Βίλα', apartment: 'Διαμέρισμα', studio: 'Studio',
    house: 'Κατοικία', room: 'Δωμάτιο',
  }[info.unit_type?.toLowerCase()] || info.unit_type

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl"
          style={{ background: COLOR + '15' }}>🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Το αίτημά σας εστάλη!</h1>
        <p className="text-gray-500 mb-6">
          Θα επικοινωνήσουμε μαζί σας σύντομα στο <strong>{form.guest_email}</strong>
          για την επιβεβαίωση της κράτησής σας.
        </p>
        <div className="bg-gray-50 rounded-2xl p-4 text-left text-sm space-y-2 mb-6">
          <div className="flex justify-between"><span className="text-gray-500">Ακίνητο</span><span className="font-semibold">{info.unit_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Άφιξη</span><span className="font-semibold">{fmtDate(selected.checkIn)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Αναχώρηση</span><span className="font-semibold">{fmtDate(selected.checkOut)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Επισκέπτες</span><span className="font-semibold">{form.guests}</span></div>
        </div>
        <button onClick={() => { setStep('browse'); setSelected({ checkIn:null, checkOut:null }); setForm({ guest_name:'', guest_email:'', guest_phone:'', guests:1, message:'' }) }}
          className="text-sm font-semibold underline" style={{ color: COLOR }}>
          Νέο αίτημα κράτησης
        </button>
      </div>
    </div>
  )

  // ── Main page ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Hero */}
      <div className="relative h-64 sm:h-80 lg:h-96 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${COLOR} 0%, #2d5986 50%, #3a7bd5 100%)` }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <div className="max-w-4xl mx-auto w-full">
            <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-3 backdrop-blur-sm">
              {unitTypeLabel}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2">{info.unit_name}</h1>
            <div className="flex flex-wrap gap-4 text-white/80 text-sm">
              <span>👥 {info.capacity} {info.capacity === 1 ? 'άτομο' : 'άτομα'}</span>
              {info.base_price > 0 && <span>💶 από €{info.base_price}/νύχτα</span>}
              {info.checkin_time && <span>🗝️ Check-in {info.checkin_time}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Left: details */}
          <div className="lg:col-span-2 space-y-6">

            {/* Description */}
            {info.description && (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-3">Περιγραφή</h2>
                <p className="text-gray-600 leading-relaxed text-sm">{info.description}</p>
              </div>
            )}

            {/* Key details */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Στοιχεία Ακινήτου</h2>
              <div className="grid grid-cols-2 gap-3">
                <Amenity icon="👥" label={`${info.capacity} ${info.capacity === 1 ? 'επισκέπτης' : 'επισκέπτες'}`} />
                <Amenity icon="🗝️" label={`Check-in: ${info.checkin_time}`} />
                <Amenity icon="🏷️" label={unitTypeLabel} />
                <Amenity icon="🚪" label={`Check-out: ${info.checkout_time}`} />
                {info.manager_phone && <Amenity icon="📞" label={info.manager_phone} />}
                {info.base_price > 0 && <Amenity icon="💶" label={`€${info.base_price} / νύχτα`} />}
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-2xl shadow-sm p-6" ref={calendarRef}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-gray-900 text-lg">Διαθεσιμότητα</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMonthOffset(o => Math.max(0, o-1))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
                  <button onClick={() => setMonthOffset(o => Math.min(9, o+1))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {months.map((m, i) => (
                  <MonthGrid key={i} year={m.getFullYear()} month={m.getMonth()}
                    bookedSet={bookedSet} selected={selected} onDateClick={handleDateClick} />
                ))}
              </div>

              <div className="flex gap-5 mt-5 text-xs text-gray-500 border-t pt-4">
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md bg-red-50 border border-red-200 inline-block" /> Κατειλημμένο</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md inline-block" style={{ background: COLOR }} /> Επιλεγμένο</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-md bg-blue-50 inline-block" /> Επιλεγμένο εύρος</span>
              </div>
            </div>
          </div>

          {/* Right: booking card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-6">
              <div className="text-center mb-5 pb-5 border-b border-gray-100">
                {info.base_price > 0 ? (
                  <>
                    <span className="text-3xl font-bold text-gray-900">€{info.base_price}</span>
                    <span className="text-gray-400 text-sm"> / νύχτα</span>
                  </>
                ) : (
                  <span className="text-gray-600 font-semibold">Κατόπιν Αιτήματος</span>
                )}
              </div>

              {selected.checkIn && selected.checkOut ? (
                <div className="space-y-3 mb-5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-0.5">Άφιξη</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {new Date(selected.checkIn+'T00:00').toLocaleDateString('el-GR',{day:'numeric',month:'short'})}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-0.5">Αναχώρηση</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {new Date(selected.checkOut+'T00:00').toLocaleDateString('el-GR',{day:'numeric',month:'short'})}
                      </p>
                    </div>
                  </div>
                  {info.base_price > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
                      <span className="text-sm text-gray-500">€{info.base_price} × {nights} νύχτες</span>
                      <span className="font-bold text-gray-900">€{totalPrice.toFixed(0)}</span>
                    </div>
                  )}
                  <button
                    className="w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-lg hover:opacity-90 transition-opacity"
                    style={{ background: COLOR }}
                    onClick={() => setStep('book')}
                  >
                    Αίτημα Κράτησης →
                  </button>
                  <button onClick={() => setSelected({ checkIn:null, checkOut:null })}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 text-center py-1">
                    Εκκαθάριση επιλογής
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 mb-4">
                    {selected.checkIn ? 'Επιλέξτε ημερομηνία αναχώρησης' : 'Επιλέξτε ημερομηνίες από το ημερολόγιο'}
                  </p>
                  <button
                    className="w-full py-3.5 rounded-xl font-bold text-sm border-2 transition-colors"
                    style={{ borderColor: COLOR, color: COLOR }}
                    onClick={() => calendarRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Επιλογή Ημερομηνιών
                  </button>
                </div>
              )}

              {info.manager_phone && (
                <a href={`tel:${info.manager_phone}`}
                  className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 mt-4 pt-4 border-t border-gray-100">
                  <span>📞</span> {info.manager_phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking form modal */}
      {step === 'book' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => e.target === e.currentTarget && setStep('browse')}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Στοιχεία Κράτησης</h2>
                <button onClick={() => setStep('browse')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-lg">×</button>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-2xl p-4 mb-5 text-sm">
                <div className="font-semibold text-gray-800 mb-1">{info.unit_name}</div>
                <div className="text-gray-500">
                  {fmtDate(selected.checkIn)} → {fmtDate(selected.checkOut)} · {nights} νύχτες · {form.guests} {form.guests === 1 ? 'άτομο' : 'άτομα'}
                  {info.base_price > 0 && ` · ~€${totalPrice.toFixed(0)}`}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Ονοματεπώνυμο *</label>
                    <input type="text" placeholder="Γιώργος Παπαδόπουλος"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                      value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Email *</label>
                    <input type="email" placeholder="email@example.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                      value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Τηλέφωνο</label>
                    <input type="tel" placeholder="+30 6900000000"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                      value={form.guest_phone} onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Επισκέπτες</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white"
                      value={form.guests} onChange={e => setForm(f => ({ ...f, guests: +e.target.value }))}>
                      {Array.from({ length: info.capacity }, (_,i) => i+1).map(n => (
                        <option key={n} value={n}>{n} {n === 1 ? 'άτομο' : 'άτομα'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Σχόλια / Ερωτήσεις</label>
                    <textarea rows={3} placeholder="Ειδικές απαιτήσεις, ερωτήσεις..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none"
                      value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
                  </div>
                </div>

                <button
                  className="w-full py-4 rounded-xl text-white font-bold text-sm shadow-lg disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: COLOR }}
                  disabled={!form.guest_name.trim() || !form.guest_email.trim() || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Αποστολή...' : '✉️ Αποστολή Αιτήματος Κράτησης'}
                </button>
                <p className="text-xs text-center text-gray-400">
                  Αυτό είναι αίτημα κράτησης. Θα λάβετε επιβεβαίωση μέσω email.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center py-6 text-xs text-gray-300">Powered by iMentor</div>
    </div>
  )
}
