import { useEffect, useState } from 'react'
import { getDailyTasks } from '../api'
import { format, addDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { ArrowPathIcon, PrinterIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const TASK_STYLE = {
  turnover:        { bg: 'bg-red-100 border-red-400',    text: 'text-red-800',    badge: 'bg-red-500 text-white',    icon: '🔄' },
  departure:       { bg: 'bg-orange-100 border-orange-400', text: 'text-orange-800', badge: 'bg-orange-500 text-white', icon: '🚪' },
  arrival:         { bg: 'bg-green-100 border-green-400', text: 'text-green-800',  badge: 'bg-green-500 text-white',  icon: '✅' },
  midstay_linen:   { bg: 'bg-blue-100 border-blue-400',  text: 'text-blue-800',   badge: 'bg-blue-500 text-white',   icon: '🛏️' },
  midstay_laundry: { bg: 'bg-purple-100 border-purple-400', text: 'text-purple-800', badge: 'bg-purple-500 text-white', icon: '🧺' },
  midstay:         { bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-400 text-white', icon: '🧹' },
  empty:           { bg: 'bg-gray-50 border-gray-200',   text: 'text-gray-400',   badge: 'bg-gray-300 text-gray-600', icon: '—' },
}

export default function Cleaning() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async (d = date) => {
    setLoading(true)
    try {
      const r = await getDailyTasks({ date: d })
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [date])

  const changeDate = (days) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(d.toISOString().split('T')[0])
  }

  const tasks = data?.tasks || []
  const activeTasks = tasks.filter(t => t.task_type !== 'empty')
  const s = data?.summary

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <h2 className="text-xl font-bold text-gray-800">🧹 Πρόγραμμα Καθαριότητας</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <input
            type="date"
            className="input text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={() => changeDate(1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <button onClick={() => load()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowPathIcon className={`h-5 w-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1">
            <PrinterIcon className="h-4 w-4" /> Εκτύπωση
          </button>
        </div>
      </div>

      {/* Print header - only shows when printing */}
      <div className="hidden print:block text-center border-b pb-3 mb-4">
        <h1 className="text-2xl font-bold">ΠΡΟΓΡΑΜΜΑ ΚΑΘΑΡΙΟΤΗΤΑΣ</h1>
        <p className="text-xl mt-1">{data && format(new Date(date + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: el })}</p>
      </div>

      {/* Date display */}
      {data && (
        <div className="text-center print:hidden">
          <p className="text-lg font-semibold text-gray-700 capitalize">
            {format(new Date(date + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: el })}
          </p>
        </div>
      )}

      {/* Summary pills */}
      {s && (
        <div className="flex flex-wrap gap-2 justify-center print:justify-start">
          {s.turnover > 0 && <span className="bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-full">🔄 Αλλαγή πελάτη: {s.turnover}</span>}
          {s.departures > 0 && <span className="bg-orange-100 text-orange-700 text-sm font-semibold px-3 py-1 rounded-full">🚪 Αναχωρήσεις: {s.departures}</span>}
          {s.arrivals > 0 && <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">✅ Αφίξεις: {s.arrivals}</span>}
          {s.linen_change > 0 && <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full">🛏️ Αλλαγή σεντόνια: {s.linen_change}</span>}
          {s.midstay > 0 && <span className="bg-yellow-100 text-yellow-700 text-sm font-semibold px-3 py-1 rounded-full">🧹 Καθαρισμός: {s.midstay}</span>}
        </div>
      )}

      {loading && <div className="text-center py-12 text-gray-400 text-lg">Φόρτωση...</div>}

      {/* Task cards */}
      {!loading && (
        <div className="space-y-3">
          {activeTasks.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">😴</p>
              <p className="text-lg font-medium">Δεν υπάρχει δουλειά σήμερα!</p>
              <p className="text-sm">Όλα τα δωμάτια είναι κενά.</p>
            </div>
          )}

          {tasks.map((t) => {
            if (t.task_type === 'empty') return null
            const style = TASK_STYLE[t.task_type] || TASK_STYLE.midstay
            return (
              <div key={t.unit_id} className={`rounded-xl border-2 p-4 md:p-5 ${style.bg}`}>
                <div className="flex items-start gap-3">
                  <span className="text-3xl flex-shrink-0">{style.icon}</span>
                  <div className="flex-1">
                    {/* Unit name - very large for easy reading */}
                    <p className="text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.unit_name}</p>
                    {/* Task label - large */}
                    <p className={`text-lg md:text-xl font-bold mt-1 ${style.text}`}>{t.task_label}</p>
                    {/* Description */}
                    <p className={`text-base mt-2 leading-relaxed ${style.text}`}>{t.task_description}</p>

                    {/* Guest info */}
                    {t.booking_info?.departing && (
                      <p className="text-sm mt-2 text-gray-600">
                        <strong>Αναχώρηση:</strong> {t.booking_info.departing.join(', ')}
                      </p>
                    )}
                    {t.booking_info?.arriving && (
                      <p className="text-sm mt-1 text-gray-600">
                        <strong>Άφιξη:</strong> {t.booking_info.arriving.join(', ')}
                      </p>
                    )}
                    {t.booking_info?.guest && (
                      <p className="text-sm mt-2 text-gray-600">
                        <strong>Πελάτης:</strong> {t.booking_info.guest}
                        {t.booking_info.check_out && (
                          <span className="ml-2">· Αναχωρεί: {new Date(t.booking_info.check_out + 'T00:00:00').toLocaleDateString('el-GR')}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Empty rooms - compact list */}
          {tasks.some(t => t.task_type === 'empty') && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 print:hidden">
              <p className="text-sm text-gray-500 font-medium mb-1">Κενά δωμάτια (χωρίς εργασία):</p>
              <p className="text-sm text-gray-400">
                {tasks.filter(t => t.task_type === 'empty').map(t => t.unit_name).join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
