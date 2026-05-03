import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPortalCase, recordPortalVisit, submitPortalNps, recordPortalReviewClick } from '../api'
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
  CurrencyEuroIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftEllipsisIcon,
  PhoneIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ChartBarIcon,
  StarIcon,
  ClipboardDocumentIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtEuro(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

const PHASE_COLORS = {
  green:  { dot: 'bg-green-500',  border: 'border-green-400', text: 'text-green-700',  badge: 'bg-green-100 text-green-700 border-green-200',  rowBg: 'bg-green-50 border border-green-200' },
  blue:   { dot: 'bg-blue-500',   border: 'border-blue-400',  text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700 border-blue-200',   rowBg: 'bg-blue-50 border border-blue-200' },
  yellow: { dot: 'bg-yellow-500', border: 'border-yellow-400',text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', rowBg: 'bg-yellow-50 border border-yellow-200' },
  purple: { dot: 'bg-purple-500', border: 'border-purple-400',text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700 border-purple-200', rowBg: 'bg-purple-50 border border-purple-200' },
  orange: { dot: 'bg-orange-500', border: 'border-orange-400',text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700 border-orange-200', rowBg: 'bg-orange-50 border border-orange-200' },
}

// ── AFM Gate ────────────────────────────────────────────────────────────────

function AfmGate({ clientName, onVerify }) {
  const [afm, setAfm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (afm.trim().length < 9) { setError('Παρακαλώ εισάγετε έγκυρο ΑΦΜ (9 ψηφία)'); return }
    setLoading(true)
    setError('')
    try {
      await onVerify(afm.trim())
    } catch {
      setError('Λάθος ΑΦΜ. Παρακαλώ ελέγξτε και ξαναπροσπαθήστε.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#1e3a5f] text-white px-4 py-4 flex items-center">
        <img src="/logo-white.png" alt="iMentor" className="h-24 w-auto object-contain" />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 w-full max-w-sm text-center">
          <img src="/logo-white.png" alt="iMentor" className="h-36 w-auto object-contain mx-auto mb-5" />
          <h2 className="text-xl font-bold text-gray-900 mb-1">Επαλήθευση</h2>
          <p className="text-sm text-gray-500 mb-6">
            Εισάγετε το ΑΦΜ σας για πρόσβαση στα στοιχεία της υπόθεσης.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={afm}
              onChange={e => setAfm(e.target.value.replace(/\D/g, ''))}
              placeholder="ΑΦΜ (9 ψηφία)"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              autoFocus
            />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || afm.length !== 9}
              className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
            >
              {loading ? 'Επαλήθευση...' : 'Είσοδος'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color = 'blue' }) {
  const map = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${map[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
      </div>
    </div>
  )
}

// ── Vertical Status Timeline ──────────────────────────────────────────────────

function StatusTimeline({ fullStatusList, currentStatus, nextStatus }) {
  const currentIdx = fullStatusList.findIndex(s => s.status === currentStatus)

  // Group flat list into phase buckets preserving order
  const phaseGroups = []
  fullStatusList.forEach((item, idx) => {
    const last = phaseGroups[phaseGroups.length - 1]
    if (!last || last.phase_id !== item.phase_id) {
      phaseGroups.push({ phase_id: item.phase_id, phase_label: item.phase_label, color: item.color, items: [{ ...item, idx }] })
    } else {
      last.items.push({ ...item, idx })
    }
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-700">Πορεία Υπόθεσης</h3>
        {nextStatus && (
          <div className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full">
            Επόμενο: <span className="font-semibold">{nextStatus}</span>
          </div>
        )}
      </div>
      <div className="space-y-5">
        {phaseGroups.map((phase) => {
          const colors = PHASE_COLORS[phase.color] || PHASE_COLORS.blue
          const allDone = phase.items.every(item => item.idx < currentIdx)
          const hasActive = phase.items.some(item => item.idx === currentIdx)

          return (
            <div key={phase.phase_id} className={`border-l-2 pl-4 ${allDone || hasActive ? colors.border : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${colors.badge}`}>
                  {allDone && <CheckCircleIcon className="w-3.5 h-3.5" />}
                  {phase.phase_label}
                </span>
                {allDone && <span className="text-xs text-gray-400">Ολοκληρωμένη</span>}
              </div>
              <div className="space-y-1">
                {phase.items.map((item) => {
                  const isDone = item.idx < currentIdx
                  const isActive = item.idx === currentIdx
                  return (
                    <div key={item.idx} className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg ${isActive ? colors.rowBg : ''}`}>
                      <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                        isDone || isActive ? `${colors.dot} text-white` : 'bg-gray-200'
                      }`}>
                        {isDone ? <CheckCircleIcon className="w-3 h-3" /> :
                         isActive ? <div className="w-1.5 h-1.5 bg-white rounded-full" /> : null}
                      </div>
                      <span className={`flex-1 leading-tight text-sm ${
                        isDone ? 'text-gray-400' : isActive ? `font-bold ${colors.text}` : 'text-gray-400'
                      }`}>
                        {item.status}
                      </span>
                      {isActive && (
                        <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                          ΤΩΡΑ
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ΕΣΠΑ Budget Breakdown ─────────────────────────────────────────────────────

function BudgetBreakdown({ categories, approvedBudget }) {
  if (!categories?.length) return null
  const total = categories.reduce((s, c) => s + (c.approved_amount || 0), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ChartBarIcon className="w-5 h-5 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-700">Ανάλυση Εγκεκριμένου Προϋπολογισμού</h3>
      </div>

      {/* Bar chart */}
      <div className="space-y-2 mb-5">
        {categories.map((cat, idx) => {
          const pct = total > 0 ? Math.round((cat.approved_amount / total) * 100) : 0
          const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-yellow-500', 'bg-pink-500', 'bg-teal-500']
          const color = colors[idx % colors.length]
          return (
            <div key={idx}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-700 font-medium truncate max-w-[60%]">{cat.category_name}</span>
                <span className="text-gray-500 shrink-0 ml-2">{fmtEuro(cat.approved_amount)} ({pct}%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left py-1.5 pr-3 font-medium">Κατηγορία</th>
              <th className="text-right py-1.5 px-2 font-medium">Εγκρ. Ποσό</th>
              <th className="text-right py-1.5 px-2 font-medium">%</th>
              <th className="text-right py-1.5 px-2 font-medium">1ο Αίτ.</th>
              <th className="text-right py-1.5 px-2 font-medium">2ο Αίτ.</th>
              <th className="text-right py-1.5 pl-2 font-medium">Τελικό</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, idx) => (
              <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-1.5 pr-3 text-gray-700 font-medium">{cat.category_name}</td>
                <td className="text-right px-2 text-gray-700">{fmtEuro(cat.approved_amount)}</td>
                <td className="text-right px-2 text-gray-400">{cat.percent_of_budget ? `${cat.percent_of_budget}%` : '—'}</td>
                <td className="text-right px-2 text-gray-500">{cat.certified_request1 ? fmtEuro(cat.certified_request1) : '—'}</td>
                <td className="text-right px-2 text-gray-500">{cat.certified_request2 ? fmtEuro(cat.certified_request2) : '—'}</td>
                <td className="text-right pl-2 text-gray-500">{cat.certified_final ? fmtEuro(cat.certified_final) : '—'}</td>
              </tr>
            ))}
            <tr className="font-bold text-gray-800 border-t border-gray-200">
              <td className="py-1.5 pr-3">Σύνολο</td>
              <td className="text-right px-2">{fmtEuro(total)}</td>
              <td className="text-right px-2 text-gray-400">100%</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Μικροπιστώσεις Section ────────────────────────────────────────────────────

function MikroSection({ data }) {
  const { full_status_list, status, approved_budget } = data
  const currentIdx = full_status_list.findIndex(s => s.status === status)

  // Build phase progress data from full_status_list
  const phases = []
  full_status_list.forEach((item, idx) => {
    const last = phases[phases.length - 1]
    if (!last || last.phase_id !== item.phase_id) {
      phases.push({ phase_id: item.phase_id, label: item.phase_label, color: item.color, firstIdx: idx, lastIdx: idx })
    } else {
      last.lastIdx = idx
    }
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <CurrencyEuroIcon className="w-5 h-5 text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-700">Ταμείο Μικροπιστώσεων</h3>
      </div>

      {(approved_budget || 0) > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-purple-700 font-medium">Ποσό Δανείου</span>
          <span className="text-xl font-bold text-purple-800">{fmtEuro(approved_budget)}</span>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Φάσεις</h4>
        <div className="grid grid-cols-2 gap-2">
          {phases.map((phase) => {
            const colors = PHASE_COLORS[phase.color] || PHASE_COLORS.blue
            const isDone   = currentIdx > phase.lastIdx
            const isActive = currentIdx >= phase.firstIdx && currentIdx <= phase.lastIdx
            return (
              <div key={phase.phase_id} className={`p-3 rounded-xl border text-center ${
                isDone ? colors.badge : isActive ? colors.rowBg : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`text-lg font-bold mb-0.5 ${isDone || isActive ? colors.text : 'text-gray-300'}`}>
                  {isDone ? '✓' : isActive ? '→' : '○'}
                </div>
                <div className={`text-xs font-semibold ${isDone || isActive ? colors.text : 'text-gray-400'}`}>
                  {phase.label}
                </div>
                <div className={`text-xs mt-0.5 ${isDone ? 'text-green-600' : isActive ? colors.text : 'text-gray-300'}`}>
                  {isDone ? 'Ολοκληρώθηκε' : isActive ? 'Ενεργή' : 'Αναμένει'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── ΔΥΠΑ Milestone Timeline ───────────────────────────────────────────────────

function DypaMilestoneTimeline({ startDate }) {
  if (!startDate) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-700">
        <span className="font-semibold">Α Ορόσημο δεν έχει οριστεί.</span> Ο σύμβουλός σας θα ενημερώσει την ημερομηνία έναρξης.
      </div>
    )
  }

  const addMonths = (base, n) => {
    const d = new Date(base)
    d.setMonth(d.getMonth() + n)
    return d
  }

  const milestoneA = new Date(startDate)
  const milestoneB = addMonths(startDate, 6)
  const milestoneC = addMonths(startDate, 12)
  const today = new Date()

  // Position of today as % between A and C (clamped 0–100)
  const totalMs = milestoneC - milestoneA
  const elapsedMs = today - milestoneA
  const todayPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))

  // Which segment is today in?
  const phase = today < milestoneA ? 'before'
    : today < milestoneB ? 'AB'
    : today < milestoneC ? 'BC'
    : 'after'

  const phaseLabel = {
    before: 'Πριν την έναρξη',
    AB: 'Α–Β Φάση (0–6 μήνες)',
    BC: 'Β–Γ Φάση (6–12 μήνες)',
    after: 'Μετά το Γ Ορόσημο',
  }[phase]

  const milestones = [
    { key: 'A', label: 'Α Ορόσημο', sublabel: 'Έναρξη', date: milestoneA, pct: 0, color: 'bg-blue-500', textColor: 'text-blue-700' },
    { key: 'B', label: 'Β Ορόσημο', sublabel: '+6 μήνες', date: milestoneB, pct: 50, color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    { key: 'C', label: 'Γ Ορόσημο', sublabel: '+12 μήνες', date: milestoneC, pct: 100, color: 'bg-green-500', textColor: 'text-green-700' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-700">Χρονοδιάγραμμα Ορόσημων</h3>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
          phase === 'after' ? 'bg-green-50 text-green-700 border-green-200' :
          phase === 'BC' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {phaseLabel}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative pt-2 pb-8">
        {/* Background track */}
        <div className="relative h-3 bg-gray-100 rounded-full overflow-visible">
          {/* Filled progress */}
          <div
            className="absolute left-0 top-0 h-3 rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-green-400"
            style={{ width: `${Math.min(100, todayPct)}%` }}
          />

          {/* Milestone dots */}
          {milestones.map(m => (
            <div
              key={m.key}
              className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-md z-10 ${m.color}`}
              style={{ left: `calc(${m.pct}% - 10px)` }}
            />
          ))}

          {/* Today marker */}
          {phase !== 'before' && phase !== 'after' && (
            <div
              className="absolute top-1/2 -translate-y-1/2 z-20"
              style={{ left: `calc(${todayPct}% - 8px)` }}
            >
              <div className="w-4 h-4 bg-white border-2 border-[#1e3a5f] rounded-full shadow-lg flex items-center justify-center">
                <div className="w-2 h-2 bg-[#1e3a5f] rounded-full" />
              </div>
            </div>
          )}
          {phase === 'after' && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 -mr-1">
              <div className="w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-lg" />
            </div>
          )}
        </div>

        {/* Labels below the track */}
        {milestones.map(m => (
          <div
            key={m.key}
            className="absolute top-7 flex flex-col items-center"
            style={{ left: `calc(${m.pct}%)`, transform: m.pct === 0 ? 'translateX(0)' : m.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
          >
            <span className={`text-xs font-bold ${m.textColor}`}>{m.label}</span>
            <span className="text-xs text-gray-400">{m.sublabel}</span>
            <span className="text-xs text-gray-500 font-medium">{fmtDate(m.date.toISOString())}</span>
          </div>
        ))}
      </div>

      {/* Today callout */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">Σήμερα</span>
        <span className="text-xs font-semibold text-[#1e3a5f]">{fmtDate(today.toISOString())}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          phase === 'after' ? 'bg-green-100 text-green-700' :
          phase === 'BC' ? 'bg-yellow-100 text-yellow-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {phase === 'before' ? `Έναρξη σε ${Math.ceil((milestoneA - today) / 86400000)} ημέρες` :
           phase === 'after' ? `${Math.floor((today - milestoneC) / 86400000)} ημέρες μετά Γ` :
           phase === 'AB' ? `${Math.floor(elapsedMs / 86400000)} ημέρες από Α` :
           `${Math.floor((today - milestoneB) / 86400000)} ημέρες από Β`}
        </span>
      </div>
    </div>
  )
}

// ── ΔΥΠΑ / ΟΑΕΔ Section ──────────────────────────────────────────────────────

function DypaSection({ data }) {
  const { full_status_list, status, service_type, dypa_start_date, approval_date } = data
  const currentIdx = full_status_list.findIndex(s => s.status === status)

  const is3059 = /30[-–]?59|οαεδ|ανέργ/i.test(service_type || '')
  const amounts = is3059 ? { a: 4600, b: 6200, g: 6200 } : { a: 4700, b: 6400, g: 6400 }
  const programLabel = is3059 ? 'ΟΑΕΔ 30–59' : 'ΔΥΠΑ 18–29'
  const total = amounts.a + amounts.b + amounts.g

  // Use dypa_start_date as canonical Α ορόσημο; fall back to approval_date
  const milestoneADate = dypa_start_date || approval_date || null

  // Find phase start indices and receipt indices
  const phaseAFirst = full_status_list.findIndex(s => s.phase_id === 'Α_ΑΙΤΗΜΑ')
  const phaseBFirst = full_status_list.findIndex(s => s.phase_id === 'Β_ΑΙΤΗΜΑ')
  const phaseGFirst = full_status_list.findIndex(s => s.phase_id === 'Γ_ΑΙΤΗΜΑ')
  const idx1 = full_status_list.findIndex(s => s.status === '1η ΕΚΤΑΜΙΕΥΣΗ')
  const idx2 = full_status_list.findIndex(s => s.status === '2η ΕΚΤΑΜΙΕΥΣΗ')
  const idx3 = full_status_list.findIndex(s => s.status === '3η / ΤΕΛΙΚΗ ΕΚΤΑΜΙΕΥΣΗ')

  const instState = (phaseFirst, receiptIdx) => {
    if (receiptIdx >= 0 && currentIdx >= receiptIdx) return 'received'
    if (phaseFirst >= 0 && currentIdx >= phaseFirst) return 'submitted'
    return 'pending'
  }

  const addMonths = (base, n) => {
    if (!base) return null
    const d = new Date(base)
    d.setMonth(d.getMonth() + n)
    return d.toISOString()
  }

  const installments = [
    {
      key: 'a', label: "Α' Δόση", amount: amounts.a,
      state: instState(phaseAFirst, idx1),
      desc: 'Υποβολή Α αιτήματος',
      dateHint: milestoneADate ? `Υποβολή ~${fmtDate(addMonths(milestoneADate, 3))}` : null,
    },
    {
      key: 'b', label: "Β' Δόση", amount: amounts.b,
      state: instState(phaseBFirst, idx2),
      desc: '6 μήνες λειτουργίας',
      dateHint: milestoneADate ? `Β Ορόσημο ~${fmtDate(addMonths(milestoneADate, 6))}` : null,
    },
    {
      key: 'g', label: "Γ' Δόση", amount: amounts.g,
      state: instState(phaseGFirst, idx3),
      desc: '12 μήνες λειτουργίας',
      dateHint: milestoneADate ? `Γ Ορόσημο ~${fmtDate(addMonths(milestoneADate, 12))}` : null,
    },
  ]

  const received = installments.filter(i => i.state === 'received').reduce((s, i) => s + i.amount, 0)
  const pct = total > 0 ? Math.round((received / total) * 100) : 0

  return (
    <>
      {/* Milestone timeline */}
      <DypaMilestoneTimeline startDate={milestoneADate} />

      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CurrencyEuroIcon className="w-5 h-5 text-green-500" />
            <h3 className="text-sm font-semibold text-gray-700">Χρηματοδότηση — {programLabel}</h3>
          </div>
          <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
            Σύνολο {fmtEuro(total)}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Εισπράχθηκαν: <span className="font-semibold text-green-600">{fmtEuro(received)}</span></span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Installment cards */}
        <div className="space-y-2">
          {installments.map(inst => (
            <div key={inst.key} className={`flex items-center gap-3 p-3 rounded-xl border ${
              inst.state === 'received' ? 'bg-green-50 border-green-200' :
              inst.state === 'submitted' ? 'bg-blue-50 border-blue-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                inst.state === 'received' ? 'bg-green-500 text-white' :
                inst.state === 'submitted' ? 'bg-blue-500 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {inst.state === 'received' ? <CheckCircleIcon className="w-5 h-5" /> :
                 inst.state === 'submitted' ? <ClockIcon className="w-5 h-5" /> :
                 <span className="text-xs font-bold">{inst.key.toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${
                  inst.state === 'received' ? 'text-green-700' :
                  inst.state === 'submitted' ? 'text-blue-700' : 'text-gray-500'
                }`}>{inst.label}</div>
                <div className="text-xs text-gray-400 leading-tight">{inst.desc}</div>
                {inst.dateHint && <div className="text-xs text-gray-400 mt-0.5">{inst.dateHint}</div>}
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-base font-bold ${
                  inst.state === 'received' ? 'text-green-700' :
                  inst.state === 'submitted' ? 'text-blue-700' : 'text-gray-400'
                }`}>{fmtEuro(inst.amount)}</div>
                <div className={`text-xs font-medium ${
                  inst.state === 'received' ? 'text-green-600' :
                  inst.state === 'submitted' ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {inst.state === 'received' ? 'Εισπράχθηκε ✓' :
                   inst.state === 'submitted' ? 'Αίτημα σε εξέλιξη' : 'Αναμένει'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* iMentor fees */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <div className="text-xs font-semibold text-blue-700 mb-2">Αμοιβές iMentor</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-600">
            <span>Υποβολή αίτησης</span><span className="font-semibold text-right">300 €</span>
            <span>Α' αίτημα εκταμίευσης</span><span className="font-semibold text-right">300 €</span>
            <span>Β' αίτημα εκταμίευσης</span><span className="font-semibold text-right">300 €</span>
            <span>Γ' αίτημα εκταμίευσης</span><span className="font-semibold text-right">300 €</span>
            <span className="font-bold text-blue-800 border-t border-blue-200 pt-1.5">Σύνολο αμοιβής</span>
            <span className="font-bold text-blue-800 text-right border-t border-blue-200 pt-1.5">1.200 €</span>
          </div>
        </div>
      </div>
    </>
  )
}

// ── NPS Widget ───────────────────────────────────────────────────────────────

const GOOGLE_REVIEW_URL = 'https://g.page/r/CcQfrN7jonGaEBM/review'

const REVIEW_TEMPLATES = (svc) => [
  `Συνεργάστηκα με την i-Mentor για το πρόγραμμα "${svc}" και ήταν μια εξαιρετική εμπειρία. Επαγγελματισμός, άμεση ανταπόκριση και αποτελέσματα που μίλησαν από μόνα τους. Τους συνιστώ ανεπιφύλακτα!`,
  `Με την υποστήριξη της i-Mentor εντάχθηκα επιτυχώς στο "${svc}". Η ομάδα με καθοδήγησε σε κάθε βήμα, ήταν πάντα διαθέσιμη και παρέδωσε αποτέλεσμα. Πολύ ευχαριστημένος/η από τη συνεργασία!`,
  `Η i-Mentor αποδείχθηκε ο ιδανικός συνεργάτης για το "${svc}". Γνώστες του αντικειμένου, οργανωμένοι, με κρατούσαν ενήμερο σε κάθε εξέλιξη. Θα τους επέλεγα ξανά χωρίς δεύτερη σκέψη.`,
  `Εξαιρετική δουλειά από την i-Mentor για το πρόγραμμα "${svc}". Ανέλαβαν τα πάντα με επαγγελματισμό, απλοποίησαν μια πολύπλοκη διαδικασία και πέτυχαν το στόχο. Ευχαριστώ πολύ!`,
  `Πολύ ικανοποιημένος/η από την i-Mentor για το "${svc}". Αξιόπιστοι, ειλικρινείς και αποτελεσματικοί — ακριβώς αυτό που χρειαζόμουν. Σίγουρα θα τους προτείνω σε φίλους και συνεργάτες.`,
  `Με την i-Mentor η ένταξη στο "${svc}" έγινε εύκολα και χωρίς άγχος. Γνώριζαν κάθε λεπτομέρεια, απαντούσαν άμεσα σε κάθε απορία και ολοκλήρωσαν τη διαδικασία με άψογο τρόπο.`,
]

function NpsWidget({ token, serviceType }) {
  const [score, setScore] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [templateIdx, setTemplateIdx] = useState(() => Math.floor(Math.random() * REVIEW_TEMPLATES('').length))

  const svc = serviceType || 'χρηματοδοτικό πρόγραμμα'
  const templates = REVIEW_TEMPLATES(svc)
  const currentTemplate = templates[templateIdx]

  const handleScore = async (n) => {
    setScore(n)
    try { await submitPortalNps(token, n) } catch {}
    setSubmitted(true)
  }

  const handleReviewClick = async () => {
    try { await recordPortalReviewClick(token) } catch {}
    window.open(GOOGLE_REVIEW_URL, '_blank', 'noopener')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(currentTemplate).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const nextTemplate = () => setTemplateIdx(i => (i + 1) % templates.length)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <StarIcon className="w-5 h-5 text-yellow-400" />
        <h3 className="text-sm font-semibold text-gray-700">Η γνώμη σας μετράει</h3>
      </div>

      {!submitted ? (
        <>
          <p className="text-sm text-gray-600 mb-4">
            Πόσο πιθανό είναι να μας προτείνετε σε γνωστό σας; <span className="text-gray-400">(0 = καθόλου, 10 = σίγουρα)</span>
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                onClick={() => handleScore(n)}
                className={`w-10 h-10 rounded-lg font-bold text-sm transition-colors border-2 ${
                  n <= 6 ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' :
                  n <= 8 ? 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' :
                           'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >{n}</button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2 px-1">
            <span>Καθόλου πιθανό</span>
            <span>Σίγουρα</span>
          </div>
        </>
      ) : score >= 9 ? (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-2xl mb-1">🎉</div>
            <p className="text-sm font-semibold text-gray-800">Σας ευχαριστούμε πολύ!</p>
            <p className="text-xs text-gray-500 mt-1">Θα χαρούμε αν μοιραστείτε την εμπειρία σας στο Google.</p>
          </div>

          {/* Pre-filled text with shuffle */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400 font-medium">Προτεινόμενο κείμενο (προαιρετικό)</span>
              <button
                onClick={nextTemplate}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                Άλλο κείμενο →
              </button>
            </div>
            <p className="text-xs text-gray-600 italic leading-relaxed">{currentTemplate}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                {copied ? 'Αντιγράφηκε ✓' : 'Αντιγραφή'}
              </button>
              <span className="text-xs text-gray-300">{templateIdx + 1} / {templates.length}</span>
            </div>
          </div>

          <button
            onClick={handleReviewClick}
            className="w-full flex items-center justify-center gap-2 bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold hover:bg-[#16305a] transition-colors"
          >
            <GlobeAltIcon className="w-5 h-5" />
            Γράψτε κριτική στο Google
          </button>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            <span className="font-semibold">🎁 Early access:</span> Όσοι μοιράζονται το feedback τους λαμβάνουν πρώτοι ενημερώσεις για νέα χρηματοδοτικά προγράμματα.
          </div>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <div className="text-2xl">🙏</div>
          <p className="text-sm font-semibold text-gray-800">Ευχαριστούμε για το feedback!</p>
          <p className="text-xs text-gray-500">Ο σύμβουλός σας θα επικοινωνήσει μαζί σας για να κατανοήσουμε πώς μπορούμε να βελτιωθούμε.</p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            <span className="font-semibold">🎁 Early access:</span> Το feedback σας μάς βοηθά να σας ενημερώνουμε πρώτους για νέα χρηματοδοτικά προγράμματα.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Financial Section ─────────────────────────────────────────────────────────

function FinancialSection({ data }) {
  const { agreed_fee_application, agreed_fee_implementation, total_agreed, total_paid, balance } = data
  const pct = total_agreed > 0 ? Math.min(100, Math.round((total_paid / total_agreed) * 100)) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <CurrencyEuroIcon className="w-5 h-5 text-green-500" />
        <h3 className="text-sm font-semibold text-gray-700">Οικονομική Συμφωνία</h3>
      </div>
      <div className="space-y-2 text-sm">
        {agreed_fee_application > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Αμοιβή Αίτησης</span>
            <span className="font-medium text-gray-700">{fmtEuro(agreed_fee_application)}</span>
          </div>
        )}
        {agreed_fee_implementation > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Αμοιβή Υλοποίησης</span>
            <span className="font-medium text-gray-700">{fmtEuro(agreed_fee_implementation)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="text-gray-600 font-medium">Συνολική Αμοιβή</span>
          <span className="font-bold text-gray-800">{fmtEuro(total_agreed)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Έχετε Καταβάλει</span>
          <span className="font-semibold text-green-600">{fmtEuro(total_paid)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="text-gray-600 font-medium">Υπόλοιπο</span>
          <span className={`font-bold text-lg ${balance > 0.01 ? 'text-orange-600' : 'text-green-600'}`}>
            {balance > 0.01 ? fmtEuro(balance) : 'Εξοφλήθηκε ✓'}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Εξόφληση</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Main Portal Page ─────────────────────────────────────────────────────────

export default function ClientPortal() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [verified, setVerified] = useState(isPreview)

  useEffect(() => {
    getPortalCase(token)
      .then(setData)
      .catch(err => setError(err.response?.status === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false))
  }, [token])

  const handleAfmVerify = async (afm) => {
    await recordPortalVisit(token, afm)
    setVerified(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <BuildingOffice2Icon className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">Η σελίδα δεν βρέθηκε</h2>
        <p className="text-gray-500 text-sm max-w-md">
          Ο σύνδεσμος δεν είναι έγκυρος ή έχει απενεργοποιηθεί. Επικοινωνήστε με τον σύμβουλό σας.
        </p>
        <div className="mt-6 text-xs text-gray-400">iMentor Consulting © {new Date().getFullYear()}</div>
      </div>
    )
  }

  if (!verified) {
    return <AfmGate clientName={data?.client_name} onVerify={handleAfmVerify} />
  }

  const subsidy = data.subsidy_percent ? `${data.subsidy_percent}%` : '—'
  const budget = data.approved_budget ? fmtEuro(data.approved_budget) : '—'
  const hasFinancial = (data.total_agreed || 0) > 0

  return (
    <div className="min-h-screen bg-gray-50">
      {isPreview && (
        <div className="bg-orange-500 text-white text-center text-xs py-1.5 font-medium">
          Προεπισκόπηση Εσωτερικής Χρήσης — Δεν μετράει ως επίσκεψη πελάτη
        </div>
      )}

      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
          <img src="/logo-white.png" alt="iMentor" className="h-24 w-auto object-contain" />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Welcome card */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{data.client_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{data.service_type}</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border
              ${data.program_category === 'ΕΣΠΑ' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                data.program_category === 'ΔΥΠΑ' ? 'bg-green-50 text-green-700 border-green-200' :
                'bg-purple-50 text-purple-700 border-purple-200'}`}>
              {data.program_category}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e3a5f] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              <ClockIcon className="w-4 h-4" />
              {data.status}
            </span>
            {data.next_status && (
              <span className="text-xs text-gray-400">→ <span className="text-gray-600">{data.next_status}</span></span>
            )}
          </div>
          {data.assigned_agent_name && (
            <p className="mt-2 text-xs text-gray-400">Υπεύθυνος: <span className="font-medium text-gray-600">{data.assigned_agent_name}</span></p>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={CurrencyEuroIcon}
            label={data.program_category === 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' ? 'Ποσό Δανείου' : 'Εγκεκρ. Προϋπολογισμός'}
            value={budget}
            color="blue"
          />
          {data.program_category === 'ΕΣΠΑ' && (
            <KpiCard icon={CurrencyEuroIcon} label="Επιχορήγηση" value={subsidy} color="green" />
          )}
          <KpiCard icon={CalendarDaysIcon} label="Ημερ. Έγκρισης" value={fmtDate(data.approval_date)} color="purple" />
          <KpiCard icon={CalendarDaysIcon} label="Προθεσμία" value={fmtDate(data.project_deadline)} color="orange" />
        </div>

        {/* Vertical Status Timeline */}
        {data.full_status_list?.length > 0 && (
          <StatusTimeline
            fullStatusList={data.full_status_list}
            currentStatus={data.status}
            nextStatus={data.next_status}
          />
        )}

        {/* ΕΣΠΑ Budget breakdown */}
        {data.program_category === 'ΕΣΠΑ' && data.budget_categories?.length > 0 && (
          <BudgetBreakdown categories={data.budget_categories} approvedBudget={data.approved_budget} />
        )}

        {/* ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ section */}
        {data.program_category === 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' && (
          <MikroSection data={data} />
        )}

        {/* ΔΥΠΑ / ΟΑΕΔ section */}
        {data.program_category === 'ΔΥΠΑ' && (
          <DypaSection data={data} />
        )}

        {/* Pending Items */}
        {data.pending_items?.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
              <ExclamationCircleIcon className="w-5 h-5" />
              Εκκρεμότητες που χρειάζονται την προσοχή σας ({data.pending_items.length})
            </h3>
            <div className="space-y-2">
              {data.pending_items.map((item, idx) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm text-gray-800 font-medium">{item.item_text}</p>
                    {item.comment && (
                      <p className="text-xs text-gray-500 italic mt-0.5">→ {item.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial agreement */}
        {hasFinancial && <FinancialSection data={data} />}

        {/* Messages */}
        {data.messages?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-gray-400" />
              Ενημερώσεις από το Γραφείο
            </h3>
            <div className="space-y-3">
              {data.messages.map(msg => (
                <div key={msg.id} className="flex gap-3 items-start">
                  <div className="w-7 h-7 bg-[#1e3a5f] rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                    {(msg.author || 'i')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{msg.author || 'iMentor'}</span>
                      <span className="text-xs text-gray-400">{fmtDate(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NPS Widget */}
        <NpsWidget token={token} serviceType={data.service_type} />

        {/* Contact Footer */}
        <div className="bg-[#1e3a5f] text-white rounded-xl p-5">
          <img src="/logo-white.png" alt="iMentor" className="h-24 w-auto object-contain mb-4 mx-auto block" />
          <div className="flex flex-col gap-2 text-sm">
            <a href="tel:+302810363007" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <PhoneIcon className="w-4 h-4" /> 2810 363007
            </a>
            <a href="mailto:info@i-mentor.gr" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <EnvelopeIcon className="w-4 h-4" /> info@i-mentor.gr
            </a>
            <a href="https://www.i-mentor.gr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <GlobeAltIcon className="w-4 h-4" /> www.i-mentor.gr
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-blue-300 text-center">
            © {new Date().getFullYear()} iMentor Consulting · Σύστημα Πελάτη
          </div>
        </div>
      </div>
    </div>
  )
}
