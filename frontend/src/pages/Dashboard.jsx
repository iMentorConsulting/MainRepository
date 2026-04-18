import { useEffect, useState } from 'react'
import { getDashboard, getBookings, getGapAlerts } from '../api'
import { format, addDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import {
  ArrowRightIcon, ExclamationTriangleIcon, BellIcon,
} from '@heroicons/react/24/outline'

const CHANNEL_LABELS = {
  booking: 'Booking.com', airbnb: 'Airbnb', direct: 'Απευθείας',
  oga: 'ΟΓΑ', social_tourism: 'Κοιν.Τουρισμός', other: 'Άλλο',
}
const CHANNEL_COLORS = {
  booking: 'bg-blue-100 text-blue-800', airbnb: 'bg-red-100 text-red-800',
  direct: 'bg-green-100 text-green-800', oga: 'bg-purple-100 text-purple-800',
  social_tourism: 'bg-teal-100 text-teal-800', other: 'bg-gray-100 text-gray-700',
}

function StatCard({ label, value, sub, color = 'blue' }) {
  const ring = { blue: 'border-blue-200 bg-blue-50', green: 'border-green-200 bg-green-50', amber: 'border-amber-200 bg-amber-50', purple: 'border-purple-200 bg-purple-50' }[color]
  const text = { blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-700', purple: 'text-purple-700' }[color]
  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [arrivals, setArrivals] = useState([])
  const [departures, setDepartures] = useState([])
  const [tomorrowArrivals, setTomorrowArrivals] = useState([])
  const [gaps, setGaps] = useState([])
  const [error, setError] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = addDays(new Date(), 1).toISOString().split('T')[0]

  useEffect(() => {
    getDashboard()
      .then((r) => setStats(r.data))
      .catch(() => setError(true))
    getBookings({ from_date: today, to_date: today, limit: 100 })
      .then((r) => {
        setArrivals(r.data.filter((b) => b.check_in === today))
        setDepartures(r.data.filter((b) => b.check_out === today))
      })
      .catch(() => {})
    getBookings({ from_date: tomorrow, to_date: tomorrow, limit: 100 })
      .then((r) => setTomorrowArrivals(r.data.filter((b) => b.check_in === tomorrow)))
      .catch(() => {})
    getGapAlerts({ max_gap_days: 3 })
      .then((r) => setGaps(r.data.alerts.slice(0, 5)))
      .catch(() => {})
  }, [])

  if (error) return (
    <div className="p-6 text-center">
      <p className="text-red-500 font-medium mb-2">Δεν ήταν δυνατή η σύνδεση με τον server.</p>
      <p className="text-gray-400 text-sm mb-4">Δοκιμάστε ξανά σε 30 δευτερόλεπτα.</p>
      <button onClick={() => { setError(false); getDashboard().then((r) => setStats(r.data)).catch(() => setError(true)) }} className="btn-primary">Ανανέωση</button>
    </div>
  )

  if (!stats) return (
    <div className="p-6 text-center">
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl"/>)}
        </div>
        <div className="h-48 bg-gray-200 rounded-xl"/>
      </div>
      <p className="text-gray-400 text-sm mt-4">Φόρτωση...</p>
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Αρχική</h2>
        <p className="text-sm text-gray-500">{format(new Date(), "EEEE, d MMMM yyyy", { locale: el })}</p>
      </div>

      {/* Tomorrow arrivals banner */}
      {tomorrowArrivals.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <BellIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-blue-800">Αύριο: {tomorrowArrivals.length} {tomorrowArrivals.length === 1 ? 'άφιξη' : 'αφίξεις'}</span>
            <span className="text-sm text-blue-700 ml-2">
              {tomorrowArrivals.map(b => b.unit.name).join(', ')}
            </span>
          </div>
          <Link to="/cleaning" className="text-xs text-blue-600 hover:underline flex-shrink-0 font-medium">
            Πρόγραμμα →
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Αφίξεις Σήμερα" value={stats.arrivals_today} color="blue" />
        <StatCard label="Αναχωρήσεις" value={stats.departures_today} color="amber" />
        <StatCard label="Πληρότητα" value={`${stats.occupancy_rate}%`} sub={`${stats.currently_occupied}/${stats.total_units} μονάδες`} color="green" />
        <StatCard label="Έσοδα Μήνα" value={`€${stats.monthly_revenue.toLocaleString('el-GR')}`} sub={`${stats.upcoming_bookings} επερχόμενες`} color="purple" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Arrivals */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">Αφίξεις Σήμερα</h3>
            <Link to="/bookings" className="text-xs text-blue-600 flex items-center gap-1">Όλες <ArrowRightIcon className="h-3 w-3" /></Link>
          </div>
          {arrivals.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Καμία άφιξη σήμερα</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {arrivals.map((b) => (
                <li key={b.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{b.customer.first_name} {b.customer.last_name}</p>
                    <p className="text-xs text-gray-500">{b.unit.name} · {b.guests} άτομα</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[b.channel] || 'bg-gray-100 text-gray-600'}`}>
                    {CHANNEL_LABELS[b.channel] || b.channel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Departures */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">Αναχωρήσεις Σήμερα</h3>
            <Link to="/cleaning" className="text-xs text-blue-600 flex items-center gap-1">Καθαριότητα <ArrowRightIcon className="h-3 w-3" /></Link>
          </div>
          {departures.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Καμία αναχώρηση σήμερα</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {departures.map((b) => (
                <li key={b.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{b.customer.first_name} {b.customer.last_name}</p>
                    <p className="text-xs text-gray-500">{b.unit.name}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Gap Alerts */}
      {gaps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold text-amber-800 text-sm">Ειδοποιήσεις Μικρών Κενών ({gaps.length})</h3>
            </div>
            <Link to="/smart-advisor" className="text-xs text-amber-700 flex items-center gap-1">Όλα <ArrowRightIcon className="h-3 w-3" /></Link>
          </div>
          <ul className="divide-y divide-amber-100">
            {gaps.map((g, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs flex items-center justify-center font-bold">{g.gap_days}</span>
                <div>
                  <p className="text-sm font-medium text-amber-900">{g.unit_name}</p>
                  <p className="text-xs text-amber-700">{g.recommendation}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
