import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalyticsCalendar } from '../api'
import { ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'

const TYPE_CONFIG = {
  deadline: { label: 'Προθεσμία', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  dypa:     { label: 'ΔΥΠΑ Ορόσημο', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  followup: { label: 'Follow-up', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export default function DeadlineCalendar() {
  const navigate = useNavigate()
  const today = isoToday()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  useEffect(() => {
    getAnalyticsCalendar()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const eventMap = {}
  events.forEach(ev => {
    if (!eventMap[ev.date]) eventMap[ev.date] = []
    eventMap[ev.date].push(ev)
  })

  const monthName = new Date(year, month, 1).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
  const DAYS_EL = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']

  const selectedDateStr = selected
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selected).padStart(2, '0')}`
    : null
  const selectedEvents = selectedDateStr ? (eventMap[selectedDateStr] || []) : []

  const cells = Array.from({ length: startOffset + daysInMonth }, (_, i) =>
    i < startOffset ? null : i - startOffset + 1
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ημερολόγιο Προθεσμιών</h1>
        <p className="text-sm text-gray-500">Όλες οι προθεσμίες, ορόσημα και follow-ups</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="font-semibold text-gray-800 capitalize">{monthName}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center">
            {DAYS_EL.map(d => (
              <div key={d} className="text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEvents = eventMap[dateStr] || []
              const isToday = dateStr === today
              const isSelected = day === selected
              const types = [...new Set(dayEvents.map(e => e.type))]

              return (
                <button
                  key={idx}
                  onClick={() => setSelected(day === selected ? null : day)}
                  className={`relative flex flex-col items-center p-1 rounded-lg transition-colors min-h-[44px] ${
                    isSelected ? 'bg-[#1e3a5f] text-white' :
                    isToday ? 'bg-blue-50 text-blue-700 font-bold' :
                    dayEvents.length > 0 ? 'hover:bg-gray-50' : 'hover:bg-gray-50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-medium">{day}</span>
                  {types.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {types.map(t => (
                        <span key={t} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : TYPE_CONFIG[t]?.dot || 'bg-gray-400'}`} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          {!selectedDateStr ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <CalendarDaysIcon className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Επιλέξτε ημέρα για να δείτε τα ορόσημα</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">
                {new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-gray-400">Δεν υπάρχουν ορόσημα</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev, i) => {
                    const cfg = TYPE_CONFIG[ev.type] || { badge: 'bg-gray-100 text-gray-600', label: ev.type }
                    return (
                      <button
                        key={i}
                        onClick={() => navigate(`/cases/${ev.case_id}`)}
                        className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${cfg.badge}`}>
                          {cfg.label}
                        </div>
                        <div className="text-sm font-medium text-gray-800">{ev.client_name}</div>
                        {ev.done && <div className="text-xs text-gray-400 mt-0.5">✓ Ολοκληρωμένη</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-700">Επόμενες 30 Ημέρες</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events
              .filter(ev => {
                const t30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
                return ev.date >= today && ev.date <= t30
              })
              .slice(0, 20)
              .map((ev, i) => {
                const cfg = TYPE_CONFIG[ev.type] || { badge: 'bg-gray-100 text-gray-600', label: ev.type }
                const dt = new Date(ev.date + 'T12:00:00')
                return (
                  <button key={i} onClick={() => navigate(`/cases/${ev.case_id}`)}
                    className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center gap-4">
                    <div className="text-center min-w-[48px]">
                      <div className="text-lg font-bold text-gray-800 leading-none">{dt.getDate()}</div>
                      <div className="text-xs text-gray-400">{dt.toLocaleDateString('el-GR', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{ev.client_name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                  </button>
                )
              })}
            {events.filter(ev => ev.date >= today && ev.date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Κανένα ορόσημο στις επόμενες 30 ημέρες</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
