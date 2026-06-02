import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPortalCase, recordPortalVisit, submitPortalNps, recordPortalReviewClick, submitPortalMessage, uploadPortalFile, getPortalRelatedCases } from '../api'
import { AnaHeader, AnaProperty, AnaIncome, AnaDocChecklist, AnaAdvisorChecklist, AnaBudget } from './AnakainizwPortalSection'
import AnakainizwIntakeSection from './AnakainizwIntakeSection'
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
  DocumentArrowDownIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'Europe/Athens'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })
}

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ })
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

function AfmGate({ clientName, onVerify, programCategory }) {
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isPhone = programCategory === 'ΑΝΑΚΑΙΝΙΖΩ'

  const handleSubmit = async (e) => {
    e.preventDefault()
    const val = credential.trim()
    if (!isPhone && val.length < 9) { setError('Παρακαλώ εισάγετε έγκυρο ΑΦΜ (9 ψηφία)'); return }
    if (isPhone && val.replace(/\D/g, '').length < 10) { setError('Παρακαλώ εισάγετε έγκυρο αριθμό κινητού'); return }
    setLoading(true)
    setError('')
    try {
      await onVerify(val)
    } catch {
      setError(isPhone ? 'Λάθος αριθμός κινητού. Παρακαλώ ελέγξτε και ξαναπροσπαθήστε.' : 'Λάθος ΑΦΜ. Παρακαλώ ελέγξτε και ξαναπροσπαθήστε.')
      setLoading(false)
    }
  }

  const isReady = isPhone ? credential.replace(/\D/g, '').length >= 10 : credential.length === 9

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
            {isPhone
              ? 'Εισάγετε τον αριθμό κινητού σας για πρόσβαση στα στοιχεία της αίτησης.'
              : 'Εισάγετε το ΑΦΜ σας για πρόσβαση στα στοιχεία της υπόθεσης.'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={isPhone ? 15 : 9}
              value={credential}
              onChange={e => setCredential(e.target.value.replace(/\D/g, ''))}
              placeholder={isPhone ? 'Κινητό τηλέφωνο' : 'ΑΦΜ (9 ψηφία)'}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              autoFocus
            />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || !isReady}
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

function StatusTooltip({ description }) {
  const [show, setShow] = useState(false)
  if (!description) return null
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={e => { e.stopPropagation(); setShow(s => !s) }}
        className="w-4 h-4 rounded-full bg-[#1e3a5f]/15 text-[#1e3a5f] flex items-center justify-center text-[9px] font-bold hover:bg-[#1e3a5f]/25"
      >?</button>
      {show && (
        <div className="absolute left-full top-0 ml-2 z-50 w-56 bg-[#1e3a5f] text-white text-xs rounded-lg px-3 py-2 shadow-xl">
          {description}
          <button onClick={() => setShow(false)} className="absolute top-1 right-1.5 text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}
    </div>
  )
}

const EXCEPTION_STYLES = {
  'ΕΝΣΤΑΣΗ':      { bg: 'bg-amber-50',  border: 'border-amber-300',  icon: '⚖️', text: 'text-amber-800',  badge: 'bg-amber-100 text-amber-800 border-amber-300',  dot: 'bg-amber-500'  },
  'ΤΡΟΠΟΠΟΙΗΣΗ':  { bg: 'bg-blue-50',   border: 'border-blue-300',   icon: '🔄', text: 'text-blue-800',   badge: 'bg-blue-100 text-blue-800 border-blue-300',   dot: 'bg-blue-500'   },
  'ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ': { bg: 'bg-gray-50', border: 'border-gray-300', icon: '❄️', text: 'text-gray-700',  badge: 'bg-gray-100 text-gray-700 border-gray-300',   dot: 'bg-gray-400'   },
}
const DEFAULT_EXCEPTION_STYLE = { bg: 'bg-purple-50', border: 'border-purple-300', icon: '⏸', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' }

function ExceptionBanner({ status, description }) {
  const style = EXCEPTION_STYLES[status] || DEFAULT_EXCEPTION_STYLE
  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 ${style.border} ${style.bg} p-5 shadow-sm`}>
      {/* Decorative background circles */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 bg-current" />
      <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full opacity-10 bg-current" />

      <div className="relative flex items-start gap-4">
        {/* Pulsing icon */}
        <div className="flex-shrink-0 relative">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm border ${style.border} bg-white`}>
            {style.icon}
          </div>
          <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${style.dot} ring-2 ring-white animate-pulse`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-widest ${style.text} opacity-70`}>Ενεργή Διαδικασία</span>
          </div>
          <h3 className={`text-lg font-bold ${style.text} mb-1`}>{status}</h3>
          {description ? (
            <p className={`text-sm ${style.text} opacity-80 leading-relaxed`}>{description}</p>
          ) : (
            <p className={`text-sm ${style.text} opacity-70 leading-relaxed`}>
              Η υπόθεση βρίσκεται προσωρινά σε αυτή τη φάση. Η κανονική πορεία θα συνεχιστεί μόλις ολοκληρωθεί η διαδικασία.
            </p>
          )}
        </div>
      </div>

      {/* Bottom strip */}
      <div className={`mt-4 pt-3 border-t ${style.border} border-opacity-40 flex items-center gap-2`}>
        <div className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
        <span className={`text-xs font-medium ${style.text} opacity-60`}>Η πορεία της υπόθεσης παρακάτω δείχνει το στάδιο που βρίσκεστε</span>
      </div>
    </div>
  )
}

function StatusTimeline({ fullStatusList, currentStatus, nextStatus, statusDescriptions = {}, statusHistory = [] }) {
  // Detect if current status is an exception (not in the normal pipeline)
  const pipelineStatuses = new Set(fullStatusList.map(s => s.status))
  const isException = currentStatus && !pipelineStatuses.has(currentStatus)

  // Find last known pipeline status from history when in exception mode
  const frozenStatus = isException
    ? [...statusHistory].reverse().find(h => pipelineStatuses.has(h.to_status))?.to_status || null
    : currentStatus

  const currentIdx = fullStatusList.findIndex(s => s.status === frozenStatus)

  // Group flat list into phase buckets
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
    <div className="space-y-3">
      {/* Exception banner */}
      {isException && (
        <ExceptionBanner
          status={currentStatus}
          description={statusDescriptions[currentStatus]}
        />
      )}

      {/* Timeline card */}
      <div className={`bg-white rounded-xl border p-5 shadow-sm transition-all ${isException ? 'border-gray-200 opacity-80' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">Πορεία Υπόθεσης</h3>
            {isException && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200 flex items-center gap-1">
                <span>⏸</span> Παύση
              </span>
            )}
          </div>
          {!isException && nextStatus && (
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
                      <div key={item.idx} className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg ${isActive ? (isException ? 'bg-gray-50 border border-gray-200' : colors.rowBg) : ''}`}>
                        <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                          isDone || isActive ? (isException && isActive ? 'bg-gray-400 text-white' : `${colors.dot} text-white`) : 'bg-gray-200'
                        }`}>
                          {isDone ? <CheckCircleIcon className="w-3 h-3" /> :
                           isActive ? <div className="w-1.5 h-1.5 bg-white rounded-full" /> : null}
                        </div>
                        <span className={`flex-1 leading-tight text-sm ${
                          isDone ? 'text-gray-400' :
                          isActive ? (isException ? 'font-semibold text-gray-500' : `font-bold ${colors.text}`) :
                          'text-gray-400'
                        }`}>
                          {item.status}
                        </span>
                        <StatusTooltip description={statusDescriptions[item.status]} />
                        {isActive && !isException && (
                          <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                            ΤΩΡΑ
                          </span>
                        )}
                        {isActive && isException && (
                          <span className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                            ⏸ Σε αναμονή
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
    </div>
  )
}

// ── ΕΣΠΑ Budget Breakdown ─────────────────────────────────────────────────────

function BudgetBreakdown({ categories, subsidyPercent }) {
  if (!categories?.length) return null
  const total = categories.reduce((s, c) => s + (c.approved_amount || 0), 0)
  const totalCertified = categories.reduce((s, c) => s + (c.total_certified || 0), 0)
  const totalRemaining = categories.reduce((s, c) => s + (c.remaining || 0), 0)
  const subsidyRate = (subsidyPercent || 0) / 100

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
              <th className="text-right py-1.5 px-2 font-medium">Τελικό</th>
              <th className="text-right py-1.5 px-2 font-medium text-green-600">Πιστοποιηθέν</th>
              <th className="text-right py-1.5 pl-2 font-medium text-orange-500">Απομένει</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, idx) => {
              const pct = total > 0 ? ((cat.approved_amount / total) * 100).toFixed(1) : '0.0'
              return (
                <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-3 text-gray-700 font-medium">{cat.category_name}</td>
                  <td className="text-right px-2 text-gray-700">{fmtEuro(cat.approved_amount)}</td>
                  <td className="text-right px-2 text-gray-400">{pct}%</td>
                  <td className="text-right px-2 text-gray-500">{cat.certified_request1 ? fmtEuro(cat.certified_request1) : '—'}</td>
                  <td className="text-right px-2 text-gray-500">{cat.certified_request2 ? fmtEuro(cat.certified_request2) : '—'}</td>
                  <td className="text-right px-2 text-gray-500">{cat.certified_final ? fmtEuro(cat.certified_final) : '—'}</td>
                  <td className="text-right px-2 font-semibold text-green-600">{fmtEuro(cat.total_certified)}</td>
                  <td className="text-right pl-2 font-semibold text-orange-500">{fmtEuro(cat.remaining)}</td>
                </tr>
              )
            })}
            <tr className="font-bold text-gray-800 border-t-2 border-gray-200">
              <td className="py-1.5 pr-3">Σύνολο</td>
              <td className="text-right px-2">{fmtEuro(total)}</td>
              <td className="text-right px-2 text-gray-400">100%</td>
              <td colSpan={3} />
              <td className="text-right px-2 text-green-600">{fmtEuro(totalCertified)}</td>
              <td className="text-right pl-2 text-orange-500">{fmtEuro(totalRemaining)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary cards */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium mb-1">Πιστοποιηθέν σύνολο δαπανών</p>
          <p className="text-lg font-bold text-green-800">{fmtEuro(totalCertified)}</p>
          {subsidyRate > 0 && (
            <p className="text-xs text-green-700 mt-1">
              Επιχορήγηση ({subsidyPercent}%): <span className="font-semibold">{fmtEuro(totalCertified * subsidyRate)}</span>
            </p>
          )}
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-700 font-medium mb-1">Απομένει προς πιστοποίηση</p>
          <p className="text-lg font-bold text-orange-800">{fmtEuro(totalRemaining)}</p>
          {subsidyRate > 0 && (
            <p className="text-xs text-orange-700 mt-1">
              Επιχορήγηση ({subsidyPercent}%): <span className="font-semibold">{fmtEuro(totalRemaining * subsidyRate)}</span>
            </p>
          )}
        </div>
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

      {/* Today info — separate from the track */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full border-2 border-[#1e3a5f] bg-white flex-shrink-0" />
          <span>Σήμερα <span className="font-semibold text-gray-800">{fmtDate(today.toISOString())}</span></span>
        </div>
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          phase === 'before' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
          phase === 'AB'     ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
          phase === 'BC'     ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                               'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {phase === 'before' ? `Β Ορόσημο σε ${Math.ceil((milestoneB - today) / 86400000)} ημέρες` :
           phase === 'AB'     ? `Β Ορόσημο σε ${Math.ceil((milestoneB - today) / 86400000)} ημέρες` :
           phase === 'BC'     ? `Γ Ορόσημο σε ${Math.ceil((milestoneC - today) / 86400000)} ημέρες` :
                                `Γ Ορόσημο ολοκληρώθηκε ✓`}
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

// ── Client Message Form ───────────────────────────────────────────────────────

function ClientMessageForm({ token, onSent }) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    if (!content.trim()) return
    setSending(true)
    try {
      await submitPortalMessage(token, content.trim())
      setSent(true)
      setContent('')
      setTimeout(() => setSent(false), 3000)
      onSent()
    } catch {
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
        rows={3}
        placeholder="Γράψτε το μήνυμά σας προς το γραφείο..."
        value={content}
        onChange={e => setContent(e.target.value)}
        disabled={sending}
      />
      <div className="flex items-center gap-3 justify-end">
        {sent && <span className="text-xs text-green-600 font-medium">✓ Εστάλη!</span>}
        <button
          onClick={handleSend}
          disabled={sending || !content.trim()}
          className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-semibold hover:bg-[#16305a] disabled:opacity-40 transition-colors"
        >
          {sending ? 'Αποστολή...' : 'Αποστολή Μηνύματος'}
        </button>
      </div>
    </div>
  )
}

// ── Client File Upload ────────────────────────────────────────────────────────

function ClientUploadSection({ token, clientDocs, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [desc, setDesc] = useState('')
  const [done, setDone] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      await uploadPortalFile(token, file, desc)
      setDone(true)
      setDesc('')
      fileRef.current.value = ''
      setTimeout(() => setDone(false), 3000)
      onUploaded()
    } catch {
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <ClipboardDocumentIcon className="w-5 h-5 text-gray-400" />
        Αποστολή Εγγράφων
      </h3>
      {clientDocs.length > 0 && (
        <div className="space-y-1.5">
          {clientDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              <ClipboardDocumentIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 truncate">{doc.name}</span>
              <span className="text-xs text-gray-400">{fmtDate(doc.created_at)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                doc.status === 'approved' ? 'bg-green-100 text-green-700' :
                doc.status === 'reviewed' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-500'}`}>
                {doc.status === 'approved' ? '✓ Εγκρίθηκε' : doc.status === 'reviewed' ? 'Ελέγχθηκε' : 'Σε αναμονή'}
              </span>
              <a
                href={`/api/cm/portal/public/${token}/documents/${doc.id}/download`}
                download={doc.name}
                className="text-gray-400 hover:text-blue-500 shrink-0"
                title="Λήψη"
              >
                <DocumentArrowDownIcon className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
        placeholder="Περιγραφή εγγράφου (προαιρετικό)..."
        value={desc}
        onChange={e => setDesc(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <input type="file" ref={fileRef} className="hidden" onChange={e => handleUpload(e.target.files[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors border border-gray-200"
        >
          {uploading ? 'Αποστολή...' : '+ Επιλογή Αρχείου'}
        </button>
        {done && <span className="text-xs text-green-600 font-medium">✓ Ανέβηκε επιτυχώς!</span>}
      </div>
      <p className="text-xs text-gray-400">Αποδεκτές μορφές: PDF, JPG, PNG, DOCX έως 20MB</p>
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
  const [relatedCases, setRelatedCases] = useState([])

  useEffect(() => {
    getPortalCase(token)
      .then(setData)
      .catch(err => setError(err.response?.status === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!verified || !token) return
    getPortalRelatedCases(token)
      .then(data => {
        console.log('[portal] related-cases response:', JSON.stringify(data))
        setRelatedCases(data)
      })
      .catch(err => {
        console.warn('[portal] related-cases error', err?.response?.status, err?.message)
      })
  }, [verified, token])

  const handleAfmVerify = async (afm) => {
    await recordPortalVisit(token, afm)
    setVerified(true)
  }

  const refreshData = () => {
    getPortalCase(token).then(setData).catch(() => {})
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
    return <AfmGate clientName={data?.client_name} onVerify={handleAfmVerify} programCategory={data?.program_category} />
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
        {/* Other active services */}
        {relatedCases.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔗</span>
              <h3 className="text-sm font-bold text-amber-800">Άλλες ενεργές υπηρεσίες σας με την iMentor</h3>
            </div>
            <div className="space-y-2">
              {relatedCases.map(c => {
                const icons = { 'ΕΣΠΑ': '📋', 'ΔΥΠΑ': '🎓', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ': '💶', 'ΑΝΑΚΑΙΝΙΖΩ': '🏠' }
                const labels = { 'ΕΣΠΑ': 'ΕΣΠΑ', 'ΔΥΠΑ': 'ΔΥΠΑ / ΟΑΕΔ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ': 'Μικροπιστώσεις', 'ΑΝΑΚΑΙΝΙΖΩ': 'Ανακαινίζω' }
                return (
                  <a
                    key={c.token}
                    href={`/portal/${c.token}`}
                    className="flex items-center gap-3 bg-white border border-amber-100 rounded-lg px-4 py-3 hover:border-amber-300 hover:bg-amber-50 transition-all group"
                  >
                    <span className="text-xl">{icons[c.program_category] || '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 group-hover:text-amber-800">{labels[c.program_category] || c.program_category}</div>
                      {c.client_name && <div className="text-xs text-gray-600">{c.client_name}</div>}
                      {c.service_type && <div className="text-xs text-gray-500 truncate">{c.service_type}</div>}
                      {c.property_address && <div className="text-xs text-gray-400 truncate">📍 {c.property_address}</div>}
                    </div>
                    <span className="text-xs text-amber-600 font-medium group-hover:underline">Μετάβαση →</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Welcome card — only for non-ΑΝΑΚΑΙΝΙΖΩ (ΑΝΑΚΑΙΝΙΖΩ renders it at position 8) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && (
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
          {data.status_descriptions?.[data.status] && (
            <div className="mt-2 flex items-start gap-2 bg-[#1e3a5f]/5 border border-[#1e3a5f]/10 rounded-lg px-3 py-2 text-xs text-[#1e3a5f]">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center font-bold text-[10px] mt-0.5">?</span>
              <span>{data.status_descriptions[data.status]}</span>
            </div>
          )}
          {data.progress_percent > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Πρόοδος υπόθεσης</span>
                <span className="font-semibold text-gray-600">{data.progress_percent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
                  style={{ width: `${data.progress_percent}%` }}
                />
              </div>
            </div>
          )}
          {data.assigned_agent_name && (
            <p className="mt-2 text-xs text-gray-400">Υπεύθυνος: <span className="font-medium text-gray-600">{data.assigned_agent_name}</span></p>
          )}
        </div>
        )}

        {/* KPIs — not for ΑΝΑΚΑΙΝΙΖΩ (shown in different position) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && (
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
            {data.program_category !== 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' && (
              <KpiCard icon={CalendarDaysIcon} label="Ημερ. Έγκρισης" value={fmtDate(data.approval_date)} color="purple" />
            )}
            {data.program_category !== 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' && (
              <KpiCard icon={CalendarDaysIcon} label="Προθεσμία" value={fmtDate(data.project_deadline)} color="orange" />
            )}
          </div>
        )}

        {/* Vertical Status Timeline — not for ΑΝΑΚΑΙΝΙΖΩ (shown in different position) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && data.full_status_list?.length > 0 && (
          <StatusTimeline
            fullStatusList={data.full_status_list}
            currentStatus={data.status}
            nextStatus={data.next_status}
            statusDescriptions={data.status_descriptions || {}}
            statusHistory={data.status_history || []}
          />
        )}

        {/* ΕΣΠΑ Budget breakdown */}
        {data.program_category === 'ΕΣΠΑ' && data.budget_categories?.length > 0 && (
          <BudgetBreakdown categories={data.budget_categories} subsidyPercent={data.subsidy_percent} />
        )}

        {/* ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ section */}
        {data.program_category === 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ' && (
          <MikroSection data={data} />
        )}

        {/* ΔΥΠΑ / ΟΑΕΔ section */}
        {data.program_category === 'ΔΥΠΑ' && (
          <DypaSection data={data} />
        )}

        {/* ── ΑΝΑΚΑΙΝΙΖΩ: custom card order ─────────────────────────────── */}
        {data.program_category === 'ΑΝΑΚΑΙΝΙΖΩ' && (
          <>
            {/* 2: Program Header */}
            <AnaHeader caseData={data} />

            {/* 3: Επιβεβαίωση Στοιχείων Ακινήτου & Νοικοκυριού */}
            <AnakainizwIntakeSection caseData={data} token={token} onRefresh={refreshData} />

            {/* 4: Στοιχεία Ακινήτου */}
            <AnaProperty caseData={data} />

            {/* 5: Εισοδηματικά Κριτήρια */}
            <AnaIncome caseData={data} />

            {/* 6: Εκκρεμεί Πληρωμή */}
            {data.anakainizw?.inspection_fee_paid === false && (
              <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 shadow-sm">
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-400/10" />
                <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-amber-400/10" />
                <div className="relative">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-amber-400 text-white flex items-center justify-center text-2xl shadow">🏦</div>
                    <div className="flex-1">
                      <div className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-0.5">Εκκρεμεί Πληρωμή</div>
                      <h3 className="text-base font-extrabold text-amber-900">Έλεγχος Ακινήτου &amp; Εισοδηματικών Κριτηρίων</h3>
                      <p className="text-sm text-amber-700 mt-1">Απαιτείται εφάπαξ πληρωμή για τον αρχικό έλεγχο επιλεξιμότητας.</p>
                    </div>
                  </div>
                  <div className="bg-white border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-amber-600 font-medium mb-0.5">Ποσό πληρωμής</div>
                      <div className="text-2xl font-black text-amber-900">60 €</div>
                      <div className="text-xs text-amber-500 mt-0.5">48,38 € + ΦΠΑ 24%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Δικαιούχος</div>
                      <div className="text-sm font-bold text-gray-800">I MENTOR IKE</div>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Τραπεζικοί Λογαριασμοί</div>
                    {[
                      { bank: 'Πειραιώς', iban: 'GR4501714330006433164381388' },
                      { bank: 'Eurobank', iban: 'GR5802601680000060201330648' },
                      { bank: 'Alpha Bank', iban: 'GR2401407750775002330002138' },
                    ].map(({ bank, iban }) => (
                      <div key={bank} className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-gray-700 flex-shrink-0">{bank}</span>
                        <span className="text-xs font-mono text-gray-600 break-all text-right">{iban}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                    <span className="flex-shrink-0 text-base">📲</span>
                    <span>Μετά την πληρωμή, <strong>στείλτε την απόδειξη</strong> στον σύμβουλό σας μέσω της φόρμας επικοινωνίας παρακάτω ή με email.</span>
                  </div>
                </div>
              </div>
            )}
            {data.anakainizw?.inspection_fee_paid === true && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-green-500 text-white flex items-center justify-center text-2xl shadow flex-shrink-0">✅</div>
                <div>
                  <div className="text-sm font-bold text-green-800">Πληρωμή Ελέγχου — Εξοφλημένο</div>
                  <div className="text-xs text-green-600 mt-0.5">Ο έλεγχος ακινήτου &amp; εισοδηματικών κριτηρίων έχει καλυφθεί.</div>
                </div>
              </div>
            )}

            {/* 7: Κατάσταση Εγγράφων */}
            <AnaDocChecklist caseData={data} />

            {/* 8: Welcome card */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{data.client_name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{data.service_type}</p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                  ΑΝΑΚΑΙΝΙΖΩ
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
              {data.status_descriptions?.[data.status] && (
                <div className="mt-2 flex items-start gap-2 bg-[#1e3a5f]/5 border border-[#1e3a5f]/10 rounded-lg px-3 py-2 text-xs text-[#1e3a5f]">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center font-bold text-[10px] mt-0.5">?</span>
                  <span>{data.status_descriptions[data.status]}</span>
                </div>
              )}
              {data.progress_percent > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Πρόοδος υπόθεσης</span>
                    <span className="font-semibold text-gray-600">{data.progress_percent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all" style={{ width: `${data.progress_percent}%` }} />
                  </div>
                </div>
              )}
              {data.assigned_agent_name && (
                <p className="mt-2 text-xs text-gray-400">Υπεύθυνος: <span className="font-medium text-gray-600">{data.assigned_agent_name}</span></p>
              )}
            </div>

            {/* 9: Πορεία Υπόθεσης */}
            {data.full_status_list?.length > 0 && (
              <StatusTimeline
                fullStatusList={data.full_status_list}
                currentStatus={data.status}
                nextStatus={data.next_status}
                statusDescriptions={data.status_descriptions || {}}
                statusHistory={data.status_history || []}
              />
            )}

            {/* 10: KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard icon={CurrencyEuroIcon} label="Εγκεκρ. Προϋπολογισμός" value={budget} color="blue" />
              <KpiCard icon={CalendarDaysIcon} label="Ημερ. Έγκρισης" value={fmtDate(data.approval_date)} color="purple" />
              <KpiCard icon={CalendarDaysIcon} label="Προθεσμία" value={fmtDate(data.project_deadline)} color="orange" />
            </div>

            {/* 11: Εκκρεμότητες */}
            {data.pending_items?.length > 0 && (
              <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
                  <ExclamationCircleIcon className="w-5 h-5" />
                  Εκκρεμότητες που χρειάζονται την προσοχή σας ({data.pending_items.length})
                </h3>
                <div className="space-y-2">
                  {data.pending_items.map((item, idx) => (
                    <div key={item.id} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                      <div>
                        <p className="text-sm text-gray-800 font-medium">{item.item_text}</p>
                        {item.comment && <p className="text-xs text-gray-500 italic mt-0.5">→ {item.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 12: Έλεγχοι Συμβούλου */}
            <AnaAdvisorChecklist caseData={data} />

            {/* 13: Τροποποιήσεις */}
            {data.modifications?.length > 0 && (
              <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-blue-700 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                  Τροποποιήσεις Έργου
                </h3>
                <div className="space-y-3">
                  {data.modifications.map((m, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex-shrink-0 text-xs font-medium text-blue-600 whitespace-nowrap pt-0.5">
                        {m.modification_date ? new Date(m.modification_date + 'T12:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">{m.title}</p>
                        {m.justification && <p className="text-xs text-gray-500 mt-0.5">{m.justification}</p>}
                      </div>
                      <div className="flex-shrink-0 text-xs whitespace-nowrap">
                        {m.approval_date
                          ? <span className="text-green-700 font-medium">Εγκρίθηκε {new Date(m.approval_date + 'T12:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          : <span className="text-orange-500">Εκκρεμεί έγκριση</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 14: Αποστολή Εγγράφων */}
            <ClientUploadSection token={token} clientDocs={data.client_documents || []} onUploaded={() => getPortalCase(token).then(setData)} />

            {/* 15: Προϋπολογισμός Εργασιών */}
            <AnaBudget caseData={data} />

            {/* 16: Επικοινωνία με το Γραφείο */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-gray-400" />
                Επικοινωνία με το Γραφείο
              </h3>
              {data.messages?.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {data.messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 items-start ${msg.sent_by_client ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${msg.sent_by_client ? 'bg-green-500' : 'bg-[#1e3a5f]'}`}>
                        {msg.sent_by_client ? 'Ε' : (msg.author || 'i')[0].toUpperCase()}
                      </div>
                      <div className={`flex-1 rounded-xl px-3 py-2 ${msg.sent_by_client ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-700">{msg.sent_by_client ? 'Εσείς' : (msg.author || 'iMentor')}</span>
                          <span className="text-xs text-gray-400">{fmtDateTime(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-line">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">Δεν υπάρχουν μηνύματα ακόμα.</p>
              )}
              <ClientMessageForm token={token} onSent={() => getPortalCase(token).then(setData)} />
            </div>

            {/* 17: Η γνώμη σας μετράει */}
            <NpsWidget token={token} serviceType={data.service_type} />
          </>
        )}

        {/* Pending Items — non-ΑΝΑΚΑΙΝΙΖΩ only (ΑΝΑΚΑΙΝΙΖΩ renders these at position 11) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && data.pending_items?.length > 0 && (
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

        {/* Modifications — non-ΑΝΑΚΑΙΝΙΖΩ only (ΑΝΑΚΑΙΝΙΖΩ renders these at position 13) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && data.modifications?.length > 0 && (
          <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-blue-700 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Τροποποιήσεις Έργου
            </h3>
            <div className="space-y-3">
              {data.modifications.map((m, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex-shrink-0 text-xs font-medium text-blue-600 whitespace-nowrap pt-0.5">
                    {m.modification_date ? new Date(m.modification_date + 'T12:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{m.title}</p>
                    {m.justification && <p className="text-xs text-gray-500 mt-0.5">{m.justification}</p>}
                  </div>
                  <div className="flex-shrink-0 text-xs whitespace-nowrap">
                    {m.approval_date
                      ? <span className="text-green-700 font-medium">Εγκρίθηκε {new Date(m.approval_date + 'T12:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      : <span className="text-orange-500">Εκκρεμεί έγκριση</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial agreement */}
        {hasFinancial && <FinancialSection data={data} />}

        {/* Status History */}
        {data.status_history?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-gray-400" />
              Ιστορικό Κατάστασης
            </h3>
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
              <div className="space-y-3 pl-8">
                {data.status_history.map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                    <div className="text-xs text-gray-400">{fmtDateTime(h.changed_at)}</div>
                    <div className="text-sm text-gray-800">
                      {h.from_status && <span className="text-gray-400 line-through mr-1">{h.from_status}</span>}
                      <span className="font-medium text-[#1e3a5f]">→ {h.to_status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Portal Files */}
        {data.portal_files?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FolderOpenIcon className="w-5 h-5 text-blue-400" />
              Έγγραφα
            </h3>
            <div className="space-y-3">
              {data.portal_files.map(file => {
                const isWord = file.file_type === 'Word'
                const badgeColor = isWord
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-red-100 text-red-700 border-red-200'
                return (
                  <div key={file.id} className="rounded-xl border border-gray-100 overflow-hidden">
                    <a
                      href={`/api/cm/portal/public/${token}/files/${file.id}/download`}
                      download={file.original_filename}
                      className="flex items-center gap-3 p-3 hover:bg-blue-50 transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 group-hover:bg-blue-100 group-hover:border-blue-200 transition-colors">
                        <DocumentArrowDownIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>{file.file_type}</span>
                          <span className="text-sm font-medium text-gray-800">{file.client_description}</span>
                        </div>
                      </div>
                      <DocumentArrowDownIcon className="w-4 h-4 text-gray-300 group-hover:text-blue-400 shrink-0" />
                    </a>
                    {file.client_instructions && (
                      <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100 text-xs text-blue-800">
                        <span className="font-medium">📋 Οδηγίες: </span>{file.client_instructions}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Messages, Upload, NPS — only for non-ΑΝΑΚΑΙΝΙΖΩ (ΑΝΑΚΑΙΝΙΖΩ includes them above) */}
        {data.program_category !== 'ΑΝΑΚΑΙΝΙΖΩ' && (
          <>
            {/* Messages */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-gray-400" />
                Επικοινωνία με το Γραφείο
              </h3>
              {data.messages?.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {data.messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 items-start ${msg.sent_by_client ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold
                        ${msg.sent_by_client ? 'bg-green-500' : 'bg-[#1e3a5f]'}`}>
                        {msg.sent_by_client ? 'Ε' : (msg.author || 'i')[0].toUpperCase()}
                      </div>
                      <div className={`flex-1 rounded-xl px-3 py-2 ${msg.sent_by_client ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-700">{msg.sent_by_client ? 'Εσείς' : (msg.author || 'iMentor')}</span>
                          <span className="text-xs text-gray-400">{fmtDateTime(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-line">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">Δεν υπάρχουν μηνύματα ακόμα.</p>
              )}
              <ClientMessageForm token={token} onSent={() => getPortalCase(token).then(setData)} />
            </div>

            {/* Client File Upload */}
            <ClientUploadSection token={token} clientDocs={data.client_documents || []} onUploaded={() => getPortalCase(token).then(setData)} />

            {/* NPS Widget */}
            <NpsWidget token={token} serviceType={data.service_type} />
          </>
        )}

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
