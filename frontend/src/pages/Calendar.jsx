import { useEffect, useState, useRef } from 'react'
import { getUnits, getBookings } from '../api'
import { format, addMonths, subMonths, getDaysInMonth, startOfMonth, eachDayOfInterval, addDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const CHANNEL_BG = {
  booking: 'bg-blue-600',
  airbnb: 'bg-red-500',
  direct: 'bg-emerald-500',
  other: 'bg-gray-400',
}
const CHANNEL_LABELS = { booking: 'Booking', airbnb: 'Airbnb', direct: 'Απευθείας', other: 'Άλλο' }

const STATUS_OPACITY = { confirmed: '', pending: 'opacity-60', cancelled: 'opacity-30 line-through' }

export default function Calendar() {
  const [units, setUnits] = useState([])
  const [bookings, setBookings] = useState([])
  const [month, setMonth] = useState(new Date())
  const scrollRef = useRef(null)

  const year = month.getFullYear()
  const mon = month.getMonth()
  const daysInMonth = getDaysInMonth(month)
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, mon, i + 1))

  const fromDate = format(startOfMonth(month), 'yyyy-MM-dd')
  const toDate = format(addDays(startOfMonth(addMonths(month, 1)), -1), 'yyyy-MM-dd')

  useEffect(() => {
    getUnits({ active_only: true }).then((r) => setUnits(r.data))
  }, [])

  useEffect(() => {
    getBookings({ from_date: fromDate, to_date: toDate, limit: 1000 }).then((r) =>
      setBookings(r.data)
    )
  }, [month])

  // Build a map: unitId -> list of bookings in this month
  const bookingsByUnit = {}
  units.forEach((u) => { bookingsByUnit[u.id] = [] })
  bookings.forEach((b) => {
    if (bookingsByUnit[b.unit_id] !== undefined) {
      bookingsByUnit[b.unit_id].push(b)
    }
  })

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Ημερολόγιο</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold min-w-[120px] text-center">
            {format(month, 'MMMM yyyy', { locale: el })}
          </span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm inline-block ${CHANNEL_BG[k]}`} />
            {v}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" ref={scrollRef}>
        <div style={{ minWidth: `${56 + daysInMonth * 36}px` }}>
          {/* Day headers */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="w-40 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200">
              Μονάδα
            </div>
            {days.map((d) => {
              const ds = format(d, 'yyyy-MM-dd')
              const isToday = ds === today
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={ds}
                  className={`w-9 flex-shrink-0 text-center py-2 text-xs border-r border-gray-100 ${
                    isToday ? 'bg-blue-50 font-bold text-blue-700' : isWeekend ? 'text-gray-500 bg-gray-50' : 'text-gray-400'
                  }`}
                >
                  <div className="font-medium">{format(d, 'd')}</div>
                  <div style={{ fontSize: '9px' }}>{format(d, 'EEE', { locale: el })}</div>
                </div>
              )
            })}
          </div>

          {/* Unit rows */}
          {units.map((u) => (
            <div key={u.id} className="flex border-b border-gray-100 hover:bg-gray-50/50">
              <div className="w-40 flex-shrink-0 px-3 py-2 border-r border-gray-200">
                <p className="text-xs font-semibold text-gray-700 truncate">{u.name}</p>
                <p className="text-xs text-gray-400">{u.type}</p>
              </div>
              <div className="flex relative">
                {days.map((d) => {
                  const ds = format(d, 'yyyy-MM-dd')
                  const isToday = ds === today
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div
                      key={ds}
                      className={`w-9 flex-shrink-0 h-12 border-r border-gray-100 ${
                        isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''
                      }`}
                    />
                  )
                })}

                {/* Booking blocks overlaid */}
                {(bookingsByUnit[u.id] || []).map((b) => {
                  if (b.status === 'cancelled') return null
                  const bIn = new Date(b.check_in + 'T00:00:00')
                  const bOut = new Date(b.check_out + 'T00:00:00')
                  const monthStart = new Date(year, mon, 1)
                  const monthEnd = new Date(year, mon, daysInMonth + 1)

                  const dispStart = bIn < monthStart ? monthStart : bIn
                  const dispEnd = bOut > monthEnd ? monthEnd : bOut

                  const startDay = dispStart.getDate() - 1
                  const endDay = dispEnd.getDate() - 1
                  const span = endDay - startDay
                  if (span <= 0) return null

                  const left = startDay * 36
                  const width = span * 36 - 2

                  return (
                    <div
                      key={b.id}
                      title={`${b.customer.first_name} ${b.customer.last_name}\n${b.check_in} – ${b.check_out}\n${CHANNEL_LABELS[b.channel]}`}
                      className={`absolute top-1.5 rounded text-white text-xs flex items-center px-1 overflow-hidden cursor-pointer ${CHANNEL_BG[b.channel]} ${STATUS_OPACITY[b.status]}`}
                      style={{ left: `${left}px`, width: `${width}px`, height: '36px' }}
                    >
                      <span className="truncate text-xs font-medium leading-tight">
                        {b.customer.last_name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {units.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Δεν υπάρχουν μονάδες. Προσθέστε πρώτα μονάδες.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
