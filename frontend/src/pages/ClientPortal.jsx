import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPortalCase, recordPortalVisit } from '../api'
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
      <header className="bg-[#1e3a5f] text-white px-4 py-5 flex items-center gap-3">
        <BuildingOffice2Icon className="w-8 h-8 text-blue-300 flex-shrink-0" />
        <div>
          <div className="font-bold">iMentor Consulting</div>
          <div className="text-blue-300 text-xs">Πύλη Πελάτη</div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-[#1e3a5f] rounded-full flex items-center justify-center mx-auto mb-4">
            <LockClosedIcon className="w-7 h-7 text-white" />
          </div>
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

  const payment150Idx = full_status_list.findIndex(s => s.status === 'ΠΛΗΡΩΜΗ 150€')
  const payment310Idx = full_status_list.findIndex(s => s.status === 'ΠΛΗΡΩΜΗ 310€')

  const milestoneState = (payIdx) =>
    payIdx < 0 ? 'pending' :
    currentIdx > payIdx ? 'paid' :
    currentIdx === payIdx ? 'due' : 'pending'

  const milestones = [
    { key: 'm1', label: 'Αμοιβή Φάσης 1', amount: '150 €', state: milestoneState(payment150Idx), note: 'Προετοιμασία' },
    { key: 'm2', label: 'Αμοιβή Φάσης 2', amount: '310 €', state: milestoneState(payment310Idx), note: 'Υποβολή HDB' },
  ]

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
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Πληρωμές iMentor</h4>
        <div className="space-y-2">
          {milestones.map(m => (
            <div key={m.key} className={`flex items-center gap-3 p-3 rounded-xl border ${
              m.state === 'paid' ? 'bg-green-50 border-green-200' :
              m.state === 'due'  ? 'bg-orange-50 border-orange-300' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                m.state === 'paid' ? 'bg-green-500 text-white' :
                m.state === 'due'  ? 'bg-orange-500 text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {m.state === 'paid' ? <CheckCircleIcon className="w-5 h-5" /> : <ClockIcon className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${
                  m.state === 'paid' ? 'text-green-700' :
                  m.state === 'due'  ? 'text-orange-700' : 'text-gray-500'
                }`}>{m.label}</div>
                <div className={`text-xs ${
                  m.state === 'paid' ? 'text-green-600' :
                  m.state === 'due'  ? 'text-orange-600' : 'text-gray-400'
                }`}>
                  {m.state === 'paid' ? 'Εξοφλήθηκε ✓' : m.state === 'due' ? 'Απαιτείται τώρα' : `Αναμένει — ${m.note}`}
                </div>
              </div>
              <span className={`text-base font-bold flex-shrink-0 ${
                m.state === 'paid' ? 'text-green-700' :
                m.state === 'due'  ? 'text-orange-700' : 'text-gray-400'
              }`}>{m.amount}</span>
            </div>
          ))}
        </div>
      </div>

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
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <BuildingOffice2Icon className="w-9 h-9 text-blue-300 flex-shrink-0" />
          <div>
            <div className="font-bold text-lg leading-tight">iMentor Consulting</div>
            <div className="text-blue-300 text-xs">Πύλη Πελάτη</div>
          </div>
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
          {data.program_category !== 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' && (
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

        {/* Contact Footer */}
        <div className="bg-[#1e3a5f] text-white rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Επικοινωνία</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="tel:+302101234567" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <PhoneIcon className="w-4 h-4" /> +30 210 123 4567
            </a>
            <a href="mailto:info@i-mentor.gr" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <EnvelopeIcon className="w-4 h-4" /> info@i-mentor.gr
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-blue-300 text-center">
            iMentor Consulting © {new Date().getFullYear()} · Σύστημα Πελάτη
          </div>
        </div>
      </div>
    </div>
  )
}
