import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  ChevronLeftIcon, ChevronRightIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import api from '../api'

// ── API ─────────────────────────────────────────────────────────────────────
const getUnits    = ()           => api.get('/units/')
const getRules    = (p)          => api.get('/availability/', { params: p })
const upsertRule  = (d)          => api.post('/availability/', d)
const deleteRule  = (id)         => api.delete(`/availability/${id}`)
const deleteByDate= (uid, dt)    => api.delete(`/availability/by-date/${uid}/${dt}`)
const bulkUpdate  = (d)          => api.post('/availability/bulk', d)

// ── Constants ────────────────────────────────────────────────────────────────
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const CHECKIN_OPTIONS = [
  { value: 'allowed',       label: 'Allowed',          icon: '✓' },
  { value: 'no_checkin',    label: 'No check-in',      icon: '←' },
  { value: 'no_checkout',   label: 'No check-out',     icon: '→' },
  { value: 'no_checkinout', label: 'No check-in/out',  icon: '↔' },
  { value: 'required',      label: 'Required',         icon: '⇌' },
]

function pad(n) { return String(n).padStart(2,'0') }
function dateStr(y,m,d) { return `${y}-${pad(m+1)}-${pad(d)}` }
function monthDays(year, month) {
  const days = []
  const first = new Date(year, month, 1).getDay() // 0=Sun
  const start = (first === 0 ? 6 : first - 1)     // Mon-based offset
  for (let i = 0; i < start; i++) days.push(null)
  const total = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= total; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)
  return days
}

// ── Day cell ─────────────────────────────────────────────────────────────────
function DayCell({ day, year, month, rule, onClick }) {
  if (!day) return <div className="h-16 bg-gray-50/50 rounded" />
  const ds = dateStr(year, month, day)
  const today = new Date().toISOString().slice(0,10)
  const isPast = ds < today
  const hasRule = !!rule
  const stopped = rule?.status === 'stop_sales'

  return (
    <button
      onClick={() => onClick(day, ds, rule)}
      className={`h-16 rounded-lg border text-left px-1.5 py-1 transition-all relative group
        ${isPast ? 'opacity-40' : 'hover:ring-2 hover:ring-blue-400'}
        ${stopped ? 'bg-red-50 border-red-200' : hasRule ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}
      `}
    >
      <span className={`text-xs font-semibold block ${stopped ? 'text-red-600' : 'text-gray-700'}`}>
        {day}
      </span>
      {rule && (
        <div className="mt-0.5 space-y-0.5">
          {stopped && (
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide block leading-none">Stop</span>
          )}
          {rule.min_stay && (
            <span className="text-[9px] text-gray-500 block leading-none">Min {rule.min_stay}n</span>
          )}
          {rule.availability != null && (
            <span className="text-[9px] text-gray-500 block leading-none">Avail {rule.availability}</span>
          )}
          {rule.checkin_restriction && rule.checkin_restriction !== 'allowed' && (
            <span className="text-[9px] text-blue-500 block leading-none">
              {CHECKIN_OPTIONS.find(o=>o.value===rule.checkin_restriction)?.icon}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────
const EMPTY = {
  action: 'update',
  status: 'open',
  availability: '',
  min_stay: '',
  max_stay: '',
  checkin_restriction: 'allowed',
  applyType: 'single',    // single | range
  date_to: '',
  days_of_week: [0,1,2,3,4,5,6],
}

function Modal({ unitName, day, dateStr: ds, rule, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    status: rule?.status || 'open',
    availability: rule?.availability ?? '',
    min_stay: rule?.min_stay ?? '',
    max_stay: rule?.max_stay ?? '',
    checkin_restriction: rule?.checkin_restriction || 'allowed',
    date_to: ds,
  }))
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f => ({...f, [k]: v}))

  const toggleDow = (d) => setForm(f => {
    const next = f.days_of_week.includes(d)
      ? f.days_of_week.filter(x=>x!==d)
      : [...f.days_of_week, d].sort()
    return {...f, days_of_week: next}
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form, ds, rule)
      onClose()
    } catch { toast.error('Σφάλμα αποθήκευσης') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex gap-4 text-sm">
            {['update','delete'].map(a => (
              <label key={a} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={form.action===a} onChange={()=>set('action',a)} className="accent-blue-600" />
                <span className="font-medium text-gray-700 capitalize">{a === 'update' ? 'Update' : 'Delete'}</span>
              </label>
            ))}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 text-gray-400">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Unit + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-medium">Unit</label>
              <div className="input mt-1 bg-gray-50 text-gray-700 text-sm">{unitName}</div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium">Date</label>
              <div className="input mt-1 bg-gray-50 text-gray-700 text-sm">{ds}</div>
            </div>
          </div>

          {form.action === 'update' && (
            <>
              {/* Open / Stop Sales */}
              <div className="flex gap-3">
                <button
                  onClick={() => set('status','open')}
                  className={`flex-1 py-2 rounded-xl font-bold text-sm border-2 transition-all ${
                    form.status==='open' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 text-gray-400'
                  }`}
                >● OPEN</button>
                <button
                  onClick={() => set('status','stop_sales')}
                  className={`flex-1 py-2 rounded-xl font-bold text-sm border-2 transition-all ${
                    form.status==='stop_sales' ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-400'
                  }`}
                >■ STOP SALES</button>
              </div>

              {/* Availability + Min/Max stay */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium">Availability</label>
                  <input type="number" min="0" className="input mt-1 text-center"
                    value={form.availability}
                    onChange={e=>set('availability', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="∞"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium">Min stay</label>
                  <input type="number" min="1" className="input mt-1 text-center"
                    value={form.min_stay}
                    onChange={e=>set('min_stay', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium">Max stay</label>
                  <input type="number" min="1" className="input mt-1 text-center"
                    value={form.max_stay}
                    onChange={e=>set('max_stay', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Check-in/out */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Check-in / out</label>
                <div className="space-y-1">
                  {CHECKIN_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="checkin" checked={form.checkin_restriction===opt.value}
                        onChange={()=>set('checkin_restriction', opt.value)} className="accent-blue-600" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                      <span className="text-gray-400 text-sm">{opt.icon}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Apply to range */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={form.applyType==='single'} onChange={()=>set('applyType','single')} className="accent-blue-600"/>
                    <span className="text-gray-700">This day only</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={form.applyType==='range'} onChange={()=>set('applyType','range')} className="accent-blue-600"/>
                    <span className="text-gray-700">Date range</span>
                  </label>
                </div>

                {form.applyType === 'range' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10">To</span>
                      <input type="date" className="input flex-1 text-sm" min={ds}
                        value={form.date_to} onChange={e=>set('date_to',e.target.value)} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Days of week</p>
                      <div className="flex gap-1">
                        {DOW.map((d,i) => (
                          <button key={i} onClick={()=>toggleDow(i)}
                            className={`flex-1 text-[10px] py-1 rounded font-semibold transition-colors ${
                              form.days_of_week.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                            }`}>
                            {d[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {form.action === 'delete' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
              This will remove all restrictions for <strong>{ds}</strong>, reverting to defaults.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50 transition-colors ${
              form.action==='delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#1e3a5f] hover:bg-[#162d4a]'
            }`}
          >
            {saving ? 'Saving...' : form.action === 'delete' ? 'Delete Restrictions' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Availability() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [units, setUnits] = useState([])
  const [unitId, setUnitId] = useState(null)
  const [rules, setRules] = useState({}) // date -> rule
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getUnits().then(r => {
      setUnits(r.data)
      if (r.data.length > 0) setUnitId(r.data[0].id)
    })
  }, [])

  const loadRules = useCallback(() => {
    if (!unitId) return
    const from = dateStr(year, month, 1)
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = dateStr(year, month, lastDay)
    setLoading(true)
    getRules({ unit_id: unitId, date_from: from, date_to: to })
      .then(r => {
        const map = {}
        r.data.forEach(rule => { map[rule.date] = rule })
        setRules(map)
      })
      .finally(() => setLoading(false))
  }, [unitId, year, month])

  useEffect(() => { loadRules() }, [loadRules])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y-1); setMonth(11) }
    else setMonth(m => m-1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y+1); setMonth(0) }
    else setMonth(m => m+1)
  }

  const openModal = (day, ds, rule) => setModal({ day, ds, rule })

  const handleSave = async (form, ds, existingRule) => {
    const unitObj = units.find(u => u.id === unitId)
    if (form.action === 'delete') {
      if (existingRule) await deleteRule(existingRule.id)
      else await deleteByDate(unitId, ds)
    } else if (form.applyType === 'range') {
      await bulkUpdate({
        unit_id: unitId,
        date_from: ds,
        date_to: form.date_to || ds,
        days_of_week: form.days_of_week,
        status: form.status,
        availability: form.availability === '' ? null : form.availability,
        min_stay: form.min_stay === '' ? null : form.min_stay,
        max_stay: form.max_stay === '' ? null : form.max_stay,
        checkin_restriction: form.checkin_restriction,
      })
    } else {
      await upsertRule({
        unit_id: unitId,
        date: ds,
        status: form.status,
        availability: form.availability === '' ? null : form.availability,
        min_stay: form.min_stay === '' ? null : form.min_stay,
        max_stay: form.max_stay === '' ? null : form.max_stay,
        checkin_restriction: form.checkin_restriction,
      })
    }
    toast.success('Saved')
    loadRules()
  }

  const days = monthDays(year, month)
  const selectedUnit = units.find(u => u.id === unitId)
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Availability Plan</h1>
            <p className="text-xs text-gray-400">Manage open/stop sales, min stay & check-in restrictions</p>
          </div>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            {/* Unit selector */}
            <select
              className="input text-sm py-1.5"
              value={unitId || ''}
              onChange={e => setUnitId(Number(e.target.value))}
            >
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            {/* Month navigation */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-1 py-1">
              <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white transition-colors">
                <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
              </button>
              <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">
                {monthNames[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white transition-colors">
                <ChevronRightIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="max-w-5xl mx-auto px-4 pb-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block"/>&nbsp;Open with restrictions</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block"/>&nbsp;Stop sales</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-gray-200 inline-block"/>&nbsp;No restriction (default open)</span>
        </div>
      </div>

      {/* Calendar */}
      <div className="max-w-5xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Day of week headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {DOW.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((day, idx) => (
                <DayCell
                  key={idx}
                  day={day}
                  year={year}
                  month={month}
                  rule={day ? rules[dateStr(year, month, day)] : null}
                  onClick={openModal}
                />
              ))}
            </div>

            {/* Quick summary */}
            {Object.keys(rules).length > 0 && (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">This month</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="font-bold text-red-600">{Object.values(rules).filter(r=>r.status==='stop_sales').length}</span>
                    <span className="text-gray-500 ml-1">days stopped</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-800">{Object.keys(rules).length}</span>
                    <span className="text-gray-500 ml-1">days with rules</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          unitName={selectedUnit?.name || ''}
          day={modal.day}
          dateStr={modal.ds}
          rule={modal.rule}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
