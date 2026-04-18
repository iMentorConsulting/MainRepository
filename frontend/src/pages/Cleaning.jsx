import { useEffect, useState } from 'react'
import { getDailyTasks, getCleaningSettings, saveCleaningSettings } from '../api'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import { ArrowPathIcon, PrinterIcon, ChevronLeftIcon, ChevronRightIcon, Cog6ToothIcon, XMarkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const TASK_STYLE = {
  turnover:        { bg: 'bg-red-100 border-red-400',    text: 'text-red-800',    icon: '🔄' },
  departure:       { bg: 'bg-orange-100 border-orange-400', text: 'text-orange-800', icon: '🚪' },
  arrival:         { bg: 'bg-green-100 border-green-400', text: 'text-green-800',  icon: '✅' },
  midstay_linen:   { bg: 'bg-blue-100 border-blue-400',  text: 'text-blue-800',   icon: '🛏️' },
  midstay_laundry: { bg: 'bg-purple-100 border-purple-400', text: 'text-purple-800', icon: '🧺' },
  midstay:         { bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-800', icon: '🧹' },
  occupied:        { bg: 'bg-gray-50 border-gray-300',   text: 'text-gray-500',   icon: '🛌' },
  empty:           { bg: 'bg-gray-50 border-gray-200',   text: 'text-gray-400',   icon: '—' },
}

function SettingsModal({ onClose }) {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCleaningSettings().then(r => setCfg(r.data)).catch(() => toast.error('Σφάλμα φόρτωσης ρυθμίσεων'))
  }, [])

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await saveCleaningSettings(cfg)
      toast.success('Ρυθμίσεις αποθηκεύτηκαν')
      onClose()
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  if (!cfg) return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-gray-400">Φόρτωση...</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-800">Ρυθμίσεις Καθαριότητας</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Καθαρισμός κάθε X ημέρες (mid-stay)</label>
            <input className="input" type="number" min={0} max={30} value={cfg.clean_every_days}
              onChange={e => set('clean_every_days', +e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">0 = χωρίς ενδιάμεσο καθαρισμό</p>
          </div>
          <div>
            <label className="label">Αλλαγή σεντόνια κάθε X ημέρες</label>
            <input className="input" type="number" min={0} max={30} value={cfg.linen_every_days}
              onChange={e => set('linen_every_days', +e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">0 = χωρίς αυτόματη αλλαγή σεντόνιων</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Παραλαβή απλύτων: ημέρα</label>
              <input className="input" type="number" min={0} max={20} value={cfg.laundry_on_day}
                onChange={e => set('laundry_on_day', +e.target.value)} />
            </div>
            <div>
              <label className="label">Ελάχ. διαμονή (νύχτες)</label>
              <input className="input" type="number" min={0} max={30} value={cfg.laundry_min_stay}
                onChange={e => set('laundry_min_stay', +e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-gray-400">Παραλαβή απλύτων: την X ημέρα διαμονής, μόνο για κρατήσεις ≥ Y νυχτών</p>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Ακύρωση</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Cleaning() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Ρυθμίσεις">
            <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
          </button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1">
            <PrinterIcon className="h-4 w-4" /> Εκτύπωση
          </button>
        </div>
      </div>

      {/* Print header */}
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
        <div className="print-card flex flex-wrap gap-2 justify-center print:justify-start">
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
            const isOccupied = t.task_type === 'occupied'
            return (
              <div key={t.unit_id} className={`print-card rounded-xl border-2 p-4 md:p-5 ${style.bg} ${isOccupied ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="text-3xl flex-shrink-0">{style.icon}</span>
                  <div className="flex-1">
                    <p className={`font-bold leading-tight ${isOccupied ? 'text-xl text-gray-600' : 'text-2xl md:text-3xl text-gray-800'}`}>{t.unit_name}</p>
                    <p className={`font-bold mt-1 ${isOccupied ? 'text-base' : 'text-lg md:text-xl'} ${style.text}`}>{t.task_label}</p>
                    <p className={`mt-2 leading-relaxed ${isOccupied ? 'text-sm' : 'text-base'} ${style.text}`}>{t.task_description}</p>

                    {t.booking_info?.departing && (
                      <p className="text-sm mt-2 text-gray-600"><strong>Αναχώρηση:</strong> {t.booking_info.departing.join(', ')}</p>
                    )}
                    {t.booking_info?.arriving && (
                      <p className="text-sm mt-1 text-gray-600"><strong>Άφιξη:</strong> {t.booking_info.arriving.join(', ')}</p>
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

          {/* Empty rooms */}
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

      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); load() }} />}
    </div>
  )
}
