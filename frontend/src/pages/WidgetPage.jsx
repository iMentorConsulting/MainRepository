import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

const MONTHS_EL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
  'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
const DAYS_EL = ['Κυ','Δε','Τρ','Τε','Πέ','Πα','Σά']

function addMonths(d, n) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parseISO(s) {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}

function MonthCalendar({ year, month, bookedSet, selected, onDateClick, color }) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month+1, 0)
  const startDay = first.getDay()
  const today = toISO(new Date())

  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)

  return (
    <div className="select-none">
      <div className="text-center font-semibold text-gray-700 mb-3 text-sm">
        {MONTHS_EL[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS_EL.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const past = iso < today
          const booked = bookedSet.has(iso)
          const isCI = selected.checkIn === iso
          const isCO = selected.checkOut === iso
          const inRange = selected.checkIn && selected.checkOut &&
            iso > selected.checkIn && iso < selected.checkOut

          let cls = 'h-8 w-full rounded text-xs flex items-center justify-center transition-colors '
          if (past || booked) {
            cls += booked
              ? 'bg-red-100 text-red-300 cursor-not-allowed line-through'
              : 'text-gray-300 cursor-not-allowed'
          } else if (isCI || isCO) {
            cls += 'text-white font-bold cursor-pointer'
          } else if (inRange) {
            cls += 'bg-blue-100 text-blue-800 cursor-pointer'
          } else {
            cls += 'hover:bg-gray-100 text-gray-700 cursor-pointer'
          }

          return (
            <button
              key={i}
              className={cls}
              style={(isCI || isCO) ? { background: color } : {}}
              disabled={past || booked}
              onClick={() => !past && !booked && onDateClick(iso)}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function WidgetPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState({ checkIn: null, checkOut: null })
  const [form, setForm] = useState({ guest_name:'', guest_email:'', guest_phone:'', guests:1, message:'' })
  const [step, setStep] = useState('calendar') // calendar | form | success
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get(`/widget/info/${token}`)
      .then(r => setInfo(r.data))
      .catch(() => setError(true))
  }, [token])

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center text-gray-500">
        <div className="text-4xl mb-2">🏠</div>
        <p className="font-medium">Widget not found</p>
      </div>
    </div>
  )

  if (!info) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const color = info.primary_color || '#1e3a5f'
  const bookedSet = new Set(info.booked_dates)
  const now = new Date()
  const m1 = addMonths(now, monthOffset)
  const m2 = addMonths(now, monthOffset + 1)

  const handleDateClick = (iso) => {
    if (!selected.checkIn || (selected.checkIn && selected.checkOut)) {
      setSelected({ checkIn: iso, checkOut: null })
    } else {
      if (iso <= selected.checkIn) {
        setSelected({ checkIn: iso, checkOut: null })
      } else {
        // Check no booked dates in range
        const ci = parseISO(selected.checkIn)
        const co = parseISO(iso)
        let cur = new Date(ci); cur.setDate(cur.getDate()+1)
        let conflict = false
        while (cur < co) {
          if (bookedSet.has(toISO(cur))) { conflict = true; break }
          cur.setDate(cur.getDate()+1)
        }
        if (conflict) {
          setSelected({ checkIn: iso, checkOut: null })
        } else {
          setSelected({ checkIn: selected.checkIn, checkOut: iso })
        }
      }
    }
  }

  const nights = selected.checkIn && selected.checkOut
    ? Math.round((parseISO(selected.checkOut) - parseISO(selected.checkIn)) / 86400000)
    : 0

  const handleSubmit = async () => {
    if (!form.guest_name.trim() || !form.guest_email.trim()) return
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

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl overflow-hidden shadow-sm mb-4"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div className="px-6 py-5 text-white">
            {info.logo_url && (
              <img src={info.logo_url} alt="" className="h-10 mb-3 object-contain" />
            )}
            <h1 className="text-xl font-bold">{info.unit_name}</h1>
            <p className="text-sm opacity-80">{info.property_name}</p>
            <div className="flex gap-4 mt-2 text-xs opacity-70">
              <span>👥 {info.capacity} guests</span>
              <span>🏠 {info.unit_type}</span>
              {info.base_price > 0 && <span>💶 από €{info.base_price}/νύχτα</span>}
            </div>
          </div>
        </div>

        {step === 'success' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Αίτημα Απεστάλη!</h2>
            <p className="text-gray-500 text-sm">
              Θα επικοινωνήσουμε μαζί σας σύντομα στο <strong>{form.guest_email}</strong>.
            </p>
            <button
              className="mt-6 text-sm text-blue-600 underline"
              onClick={() => { setStep('calendar'); setSelected({ checkIn:null, checkOut:null }); setForm({ guest_name:'', guest_email:'', guest_phone:'', guests:1, message:'' }) }}
            >
              Νέο αίτημα
            </button>
          </div>
        )}

        {step === 'calendar' && (
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Διαθεσιμότητα</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setMonthOffset(o => Math.max(0, o-1))}
                  className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-sm">‹</button>
                <button onClick={() => setMonthOffset(o => Math.min(10, o+1))}
                  className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-sm">›</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <MonthCalendar year={m1.getFullYear()} month={m1.getMonth()}
                bookedSet={bookedSet} selected={selected} onDateClick={handleDateClick} color={color} />
              <MonthCalendar year={m2.getFullYear()} month={m2.getMonth()}
                bookedSet={bookedSet} selected={selected} onDateClick={handleDateClick} color={color} />
            </div>

            <div className="flex gap-4 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" /> Κατειλημμένο</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: color }} /> Επιλεγμένο</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Εύρος</span>
            </div>

            {selected.checkIn && selected.checkOut ? (
              <div className="mt-5 p-4 rounded-xl border-2 flex items-center justify-between"
                style={{ borderColor: color + '40', background: color + '08' }}>
                <div className="text-sm">
                  <p className="font-semibold text-gray-800">
                    {new Date(selected.checkIn+'T00:00').toLocaleDateString('el-GR')} →{' '}
                    {new Date(selected.checkOut+'T00:00').toLocaleDateString('el-GR')}
                  </p>
                  <p className="text-gray-500">{nights} νύχτες{info.base_price > 0 ? ` · ~€${(nights * info.base_price).toFixed(0)}` : ''}</p>
                </div>
                <button
                  className="text-white text-sm font-semibold px-5 py-2 rounded-xl"
                  style={{ background: color }}
                  onClick={() => setStep('form')}
                >
                  Συνέχεια →
                </button>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-gray-400">
                {selected.checkIn ? 'Επιλέξτε ημερομηνία αναχώρησης' : 'Επιλέξτε ημερομηνία άφιξης'}
              </p>
            )}
          </div>
        )}

        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
            <button onClick={() => setStep('calendar')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
              ← Πίσω στο ημερολόγιο
            </button>
            <h2 className="font-semibold text-gray-800 mb-1">Στοιχεία Επικοινωνίας</h2>
            <div className="text-xs text-gray-500 mb-4 p-3 rounded-lg bg-gray-50">
              📅 {new Date(selected.checkIn+'T00:00').toLocaleDateString('el-GR')} →{' '}
              {new Date(selected.checkOut+'T00:00').toLocaleDateString('el-GR')} · {nights} νύχτες
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Ονοματεπώνυμο *</label>
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email *</label>
                <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Τηλέφωνο</label>
                  <input type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    value={form.guest_phone} onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Επισκέπτες</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    value={form.guests} onChange={e => setForm(f => ({ ...f, guests: +e.target.value }))}>
                    {Array.from({ length: info.capacity }, (_,i) => i+1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Σχόλια (προαιρετικό)</label>
                <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              </div>

              <button
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: color }}
                disabled={!form.guest_name.trim() || !form.guest_email.trim() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Αποστολή...' : 'Αποστολή Αιτήματος ✉️'}
              </button>
              <p className="text-xs text-center text-gray-400">
                Θα λάβετε επιβεβαίωση μέσω email σύντομα.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-4">Powered by iMentor</p>
      </div>
    </div>
  )
}
