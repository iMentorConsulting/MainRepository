import { useState, useEffect, useRef } from 'react'
import { getLeadStats, getAuth } from '../api'

// ── helpers ──────────────────────────────────────────────────────────────────

const GR_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function formatLabel(period, type) {
  if (!period) return ''
  if (type === 'day' || type === 'week') {
    const parts = period.split('-')
    return `${parseInt(parts[2])}/${parseInt(parts[1])}`
  }
  if (type === 'month') {
    const [y, m] = period.split('-')
    return `${GR_MONTHS[parseInt(m) - 1]} '${y.slice(-2)}`
  }
  if (type === 'quarter') {
    const [y, q] = period.split('-')
    return `${q} '${y.slice(-2)}`
  }
  if (type === 'semester') {
    const [y, h] = period.split('-')
    return `${h === 'H1' ? "Α'" : "Β'"} '${y.slice(-2)}`
  }
  return period
}

function niceTicks(max, n = 5) {
  if (max === 0) return [0, 2, 4, 6, 8, 10]
  const raw = max / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice = [1, 2, 5, 10].find(v => v * mag >= raw) * mag
  return Array.from({ length: n + 1 }, (_, i) => nice * i)
}

// ── bar chart (SVG) ───────────────────────────────────────────────────────────

const SLOT = { day: 16, week: 24, month: 38, quarter: 64, semester: 100 }

function BarChart({ data, type, color = '#4f46e5' }) {
  const [tip, setTip] = useState(null)

  if (!data?.length) return (
    <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Δεν υπάρχουν δεδομένα</div>
  )

  const slotW  = SLOT[type] || 38
  const padL   = 44, padR = 12, padT = 16, padB = 40
  const plotH  = 190
  const H      = plotH + padT + padB
  const W      = Math.max(data.length * slotW + padL + padR, 200)
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const ticks  = niceTicks(maxVal, 5)
  const topTick = ticks[ticks.length - 1]
  const yScale = plotH / topTick
  const barW   = Math.max(slotW * 0.68, 4)

  return (
    <div className="relative overflow-x-auto" onMouseLeave={() => setTip(null)}>
      {tip && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap z-10">
          <span className="text-gray-400">{formatLabel(tip.period, type)}</span>
          <span className="font-bold ml-2">{tip.count} leads</span>
        </div>
      )}
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* grid + y-labels */}
        {ticks.slice(1).map(t => {
          const y = padT + plotH - t * yScale
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#d1d5db">{t}</text>
            </g>
          )
        })}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#e5e7eb" />

        {/* bars */}
        {data.map((d, i) => {
          const x  = padL + i * slotW + (slotW - barW) / 2
          const bH = Math.max(d.count * yScale, d.count > 0 ? 2 : 0)
          const y  = padT + plotH - bH
          const cx = padL + i * slotW + slotW / 2
          const lY = padT + plotH + 14
          const small = slotW < 28
          const label = formatLabel(d.period, type)
          return (
            <g key={i} onMouseEnter={() => setTip(d)} style={{ cursor: 'default' }}>
              {/* invisible hit target */}
              <rect x={padL + i * slotW} y={padT} width={slotW} height={plotH} fill="transparent" />
              <rect
                x={x} y={y} width={barW} height={bH}
                fill={color} rx={2}
                style={{ opacity: tip?.period === d.period ? 0.65 : 1, transition: 'opacity .1s' }}
              />
              <text
                x={cx} y={lY} textAnchor="middle" fontSize={9} fill="#9ca3af"
                transform={small ? `rotate(-50,${cx},${lY})` : undefined}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── horizontal bar rows ───────────────────────────────────────────────────────

function HBars({ rows, getColor, maxVal, showDeals = false }) {
  if (!rows?.length) return <div className="text-gray-300 text-sm py-4 text-center">—</div>
  const max = maxVal || Math.max(...rows.map(r => r.count), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const label = r.label || r.program || r.title || r.status || r.name || '—'
        const pct   = (r.count / max) * 100
        const color = getColor(r, i)
        const dealPct = r.deals != null && r.count > 0 ? Math.round(r.deals / r.count * 100) : null
        return (
          <div key={i} className="flex items-center gap-2 group">
            <div className="w-36 shrink-0 text-right text-xs text-gray-500 truncate pr-1" title={label}>
              {label}
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(pct, r.count > 0 ? 1 : 0)}%`, backgroundColor: color }}
              />
            </div>
            <div className="w-10 shrink-0 text-xs font-semibold text-gray-700 text-right">{r.count}</div>
            {showDeals && (
              <div className="w-14 shrink-0 text-xs text-emerald-600 text-right">
                {dealPct !== null ? `${dealPct}% ✓` : ''}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent = '#4f46e5', subGreen, subRed }) {
  const subClass = subGreen ? 'text-emerald-600' : subRed ? 'text-red-500' : 'text-gray-400'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mb-1" style={{ color: accent }}>{value}</div>
      <div className={`text-xs ${subClass}`}>{sub}</div>
    </div>
  )
}

// ── palettes ─────────────────────────────────────────────────────────────────

const CAT = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#dc2626','#0d9488','#9333ea','#db2777','#65a30d']

const PROG_C = {
  'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ': '#4f46e5',
  'ΔΥΠΑ':           '#0891b2',
  'ΕΣΠΑ':           '#059669',
  'ΑΝΑΚΑΙΝΙΖΩ':     '#d97706',
}

const STATUS_C = {
  'NEW LEAD': '#fbbf24',
  'CALL':     '#60a5fa',
  'HOT':      '#f87171',
  'ACTIVE':   '#fb923c',
  'DEAL':     '#34d399',
  'CANCEL':   '#9ca3af',
}

// ── period tabs ───────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'day',      label: 'Ημέρα',      hint: 'τελ. 60 ημέρες' },
  { key: 'week',     label: 'Εβδομάδα',   hint: 'τελ. 26 εβδ.' },
  { key: 'month',    label: 'Μήνας',      hint: 'τελ. 24 μήνες' },
  { key: 'quarter',  label: 'Τρίμηνο',    hint: 'τελ. 3 χρόνια' },
  { key: 'semester', label: 'Εξάμηνο',    hint: 'τελ. 3 χρόνια' },
]

// ── page ──────────────────────────────────────────────────────────────────────

export default function LeadsStats() {
  const auth = getAuth()
  const [stats,   setStats]   = useState(null)
  const [period,  setPeriod]  = useState('month')
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    if (!auth || auth.role !== 'admin') return
    getLeadStats()
      .then(setStats)
      .catch(e => setErr(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [])

  if (!auth || auth.role !== 'admin') return (
    <div className="p-10 text-center text-red-600 font-semibold">Πρόσβαση μόνο για διαχειριστές.</div>
  )
  if (loading) return (
    <div className="p-10 text-center text-gray-400">Φόρτωση στατιστικών…</div>
  )
  if (err) return (
    <div className="p-10 text-center text-red-500">{err}</div>
  )
  if (!stats) return null

  const s = stats.summary
  const delta = s.this_month - s.last_month
  const periodData = {
    day: stats.by_day, week: stats.by_week, month: stats.by_month,
    quarter: stats.by_quarter, semester: stats.by_semester,
  }[period] || []

  const maxProg  = Math.max(...(stats.by_program || []).map(r => r.count), 1)
  const maxTitle = Math.max(...(stats.by_program_title || []).map(r => r.count), 1)
  const maxStat  = Math.max(...(stats.by_status || []).map(r => r.count), 1)
  const maxCons  = Math.max(...(stats.by_consultant || []).map(r => r.count), 1)

  return (
    <div className="p-5 lg:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Στατιστικά Leads</h1>
        <p className="text-sm text-gray-400 mt-0.5">Συνολική εικόνα εισερχόμενων leads ανά περίοδο, πρόγραμμα και σύμβουλο</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Σύνολο Leads"
          value={s.total.toLocaleString('el-GR')}
          sub="από αρχής"
          accent="#4f46e5"
        />
        <KpiTile
          label="Ενεργά τώρα"
          value={s.active.toLocaleString('el-GR')}
          sub={`${s.total ? Math.round(s.active / s.total * 100) : 0}% του συνόλου`}
          accent="#0891b2"
        />
        <KpiTile
          label="Deals"
          value={s.deals.toLocaleString('el-GR')}
          sub={`Ποσοστό μετατροπής ${s.deal_rate}%`}
          accent="#059669"
          subGreen
        />
        <KpiTile
          label="Τρέχων μήνας"
          value={s.this_month.toLocaleString('el-GR')}
          sub={delta === 0 ? `ίδιο με τον προηγ. μήνα` : delta > 0 ? `+${delta} vs προηγ. μήνα` : `${delta} vs προηγ. μήνα`}
          accent={delta >= 0 ? '#059669' : '#dc2626'}
          subGreen={delta > 0}
          subRed={delta < 0}
        />
      </div>

      {/* Time-series chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Leads ανά χρονική περίοδο</h2>
            <p className="text-xs text-gray-400 mt-0.5">{PERIODS.find(p => p.key === period)?.hint}</p>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === p.key
                    ? 'bg-white shadow-sm text-indigo-700 ring-1 ring-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={periodData} type={period} color="#4f46e5" />
      </div>

      {/* Program breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Κατηγορία Προγράμματος</h2>
          <p className="text-xs text-gray-400 mb-4">ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ · ΔΥΠΑ · ΕΣΠΑ · ΑΝΑΚΑΙΝΙΖΩ</p>
          <HBars
            rows={stats.by_program}
            getColor={r => PROG_C[r.program] || CAT[4]}
            maxVal={maxProg}
            showDeals
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Τίτλο Προγράμματος</h2>
          <p className="text-xs text-gray-400 mb-4">Top 20 · ποσοστό deals στήλη δεξιά</p>
          <HBars
            rows={(stats.by_program_title || []).map(r => ({ ...r, label: r.title }))}
            getColor={(_, i) => CAT[i % CAT.length]}
            maxVal={maxTitle}
            showDeals
          />
        </div>
      </div>

      {/* Status + Consultant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Ανά Status</h2>
          <HBars
            rows={(stats.by_status || []).map(r => ({ ...r, label: r.status }))}
            getColor={r => STATUS_C[r.status] || '#9ca3af'}
            maxVal={maxStat}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Σύμβουλο</h2>
          <p className="text-xs text-gray-400 mb-4">Συνολικά leads · ποσοστό deals δεξιά</p>
          <HBars
            rows={(stats.by_consultant || []).map(r => ({ ...r, label: r.name }))}
            getColor={(_, i) => CAT[i % CAT.length]}
            maxVal={maxCons}
            showDeals
          />
        </div>
      </div>

    </div>
  )
}
