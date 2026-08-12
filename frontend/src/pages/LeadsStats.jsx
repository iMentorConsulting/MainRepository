import { useState, useEffect, useCallback } from 'react'
import { getLeadStats, getLeadFilterOptions, getAuth } from '../api'
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline'

// ── date helpers ──────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0]
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
}

const TIME_PRESETS = [
  { key: 'all',      label: 'Όλα',       from: null,         to: null },
  { key: 'today',    label: 'Σήμερα',    from: today,        to: today },
  { key: 'week',     label: '7 ημέρες',  from: () => daysAgo(7),   to: today },
  { key: 'month',    label: '30 ημέρες', from: () => daysAgo(30),  to: today },
  { key: 'quarter',  label: 'Τρίμηνο',   from: () => daysAgo(90),  to: today },
  { key: 'semester', label: 'Εξάμηνο',   from: () => daysAgo(180), to: today },
  { key: 'year',     label: 'Φέτος',     from: startOfYear,  to: today },
  { key: 'custom',   label: 'Προσαρμ.', from: null,         to: null },
]

// ── chart helpers ─────────────────────────────────────────────────────────────

const GR_MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ']

function formatLabel(period, type) {
  if (!period) return ''
  if (type === 'day' || type === 'week') {
    const p = period.split('-'); return `${parseInt(p[2])}/${parseInt(p[1])}`
  }
  if (type === 'month') {
    const [y, m] = period.split('-'); return `${GR_MONTHS[parseInt(m)-1]} '${y.slice(-2)}`
  }
  if (type === 'quarter') {
    const [y, q] = period.split('-'); return `${q} '${y.slice(-2)}`
  }
  if (type === 'semester') {
    const [y, h] = period.split('-'); return `${h==='H1'?"Α'":"Β'"} '${y.slice(-2)}`
  }
  return period
}

function niceTicks(max, n=5) {
  if (max === 0) return [0,2,4,6,8,10]
  const raw = max/n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice = [1,2,5,10].find(v => v*mag >= raw)*mag
  return Array.from({length: n+1}, (_,i) => nice*i)
}

const SLOT = { day:16, week:24, month:38, quarter:64, semester:100 }

function BarChart({ data, type, color='#4f46e5' }) {
  const [tip, setTip] = useState(null)
  if (!data?.length) return (
    <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Δεν υπάρχουν δεδομένα</div>
  )
  const slotW=SLOT[type]||38, padL=44, padR=12, padT=16, padB=40, plotH=190
  const H=plotH+padT+padB
  const W=Math.max(data.length*slotW+padL+padR,200)
  const maxVal=Math.max(...data.map(d=>d.count),1)
  const ticks=niceTicks(maxVal,5), topTick=ticks[ticks.length-1]
  const yScale=plotH/topTick, barW=Math.max(slotW*0.68,4)
  return (
    <div className="relative overflow-x-auto" onMouseLeave={()=>setTip(null)}>
      {tip && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap z-10">
          <span className="text-gray-400">{formatLabel(tip.period,type)}</span>
          <span className="font-bold ml-2">{tip.count} leads</span>
        </div>
      )}
      <svg width={W} height={H} style={{display:'block'}}>
        {ticks.slice(1).map(t=>{
          const y=padT+plotH-t*yScale
          return <g key={t}>
            <line x1={padL} x2={W-padR} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1}/>
            <text x={padL-6} y={y+4} textAnchor="end" fontSize={10} fill="#d1d5db">{t}</text>
          </g>
        })}
        <line x1={padL} x2={W-padR} y1={padT+plotH} y2={padT+plotH} stroke="#e5e7eb"/>
        {data.map((d,i)=>{
          const x=padL+i*slotW+(slotW-barW)/2
          const bH=Math.max(d.count*yScale,d.count>0?2:0)
          const y=padT+plotH-bH
          const cx=padL+i*slotW+slotW/2
          const lY=padT+plotH+14, small=slotW<28
          return (
            <g key={i} onMouseEnter={()=>setTip(d)} style={{cursor:'default'}}>
              <rect x={padL+i*slotW} y={padT} width={slotW} height={plotH} fill="transparent"/>
              <rect x={x} y={y} width={barW} height={bH} fill={color} rx={2}
                style={{opacity:tip?.period===d.period?0.65:1,transition:'opacity .1s'}}/>
              <text x={cx} y={lY} textAnchor="middle" fontSize={9} fill="#9ca3af"
                transform={small?`rotate(-50,${cx},${lY})`:undefined}>
                {formatLabel(d.period,type)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── horizontal bar rows ───────────────────────────────────────────────────────

function HBars({ rows, getColor, maxVal, showDeals=false }) {
  if (!rows?.length) return <div className="text-gray-300 text-sm py-4 text-center">—</div>
  const max=maxVal||Math.max(...rows.map(r=>r.count),1)
  return (
    <div className="space-y-2.5">
      {rows.map((r,i)=>{
        const label=r.label||r.program||r.title||r.status||r.name||'—'
        const pct=(r.count/max)*100, color=getColor(r,i)
        const dealPct=r.deals!=null&&r.count>0?Math.round(r.deals/r.count*100):null
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-36 shrink-0 text-right text-xs text-gray-500 truncate pr-1" title={label}>{label}</div>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{width:`${Math.max(pct,r.count>0?1:0)}%`,backgroundColor:color}}/>
            </div>
            <div className="w-10 shrink-0 text-xs font-semibold text-gray-700 text-right">{r.count}</div>
            {showDeals && (
              <div className="w-14 shrink-0 text-xs text-emerald-600 text-right">
                {dealPct!==null?`${dealPct}% ✓`:''}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent='#4f46e5', subGreen, subRed }) {
  const subClass=subGreen?'text-emerald-600':subRed?'text-red-500':'text-gray-400'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</div>
      <div className="text-3xl font-bold mb-1" style={{color:accent}}>{value}</div>
      <div className={`text-xs ${subClass}`}>{sub}</div>
    </div>
  )
}

// ── palettes ──────────────────────────────────────────────────────────────────

const CAT=['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#dc2626','#0d9488','#9333ea','#db2777','#65a30d']
const PROG_C={'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ':'#4f46e5','ΔΥΠΑ':'#0891b2','ΕΣΠΑ':'#059669','ΑΝΑΚΑΙΝΙΖΩ':'#d97706'}
const STATUS_C={'NEW LEAD':'#fbbf24','CALL':'#60a5fa','HOT':'#f87171','ACTIVE':'#fb923c','DEAL':'#34d399','CANCEL':'#9ca3af'}

const PROG_CATS = ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ','ΔΥΠΑ','ΕΣΠΑ','ΑΝΑΚΑΙΝΙΖΩ']
const ALL_STATUSES = ['NEW LEAD','CALL','HOT','ACTIVE','DEAL','CANCEL']

const CHART_PERIODS = [
  {key:'day',label:'Ημέρα'},{key:'week',label:'Εβδομάδα'},{key:'month',label:'Μήνας'},
  {key:'quarter',label:'Τρίμηνο'},{key:'semester',label:'Εξάμηνο'},
]

// ── filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, consultants, programTitles, activeCount }) {
  const { timePreset, dateFrom, dateTo, programs, statuses, consultant, programTitle } = filters

  const setF = useCallback((patch) => setFilters(f => ({ ...f, ...patch })), [setFilters])

  const handlePreset = (p) => {
    if (p.key === 'custom') { setF({ timePreset:'custom' }); return }
    const from = p.from ? p.from() : null
    const to   = p.to   ? p.to()   : null
    setF({ timePreset: p.key, dateFrom: from, dateTo: to })
  }

  const toggleProgram = (prog) =>
    setF({ programs: programs.includes(prog) ? programs.filter(x=>x!==prog) : [...programs, prog] })

  const toggleStatus = (st) =>
    setF({ statuses: statuses.includes(st) ? statuses.filter(x=>x!==st) : [...statuses, st] })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <FunnelIcon className="w-4 h-4 text-indigo-500"/>
          Φίλτρα
          {activeCount > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-full px-2 py-0.5">{activeCount}</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={() => setFilters(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <XMarkIcon className="w-3.5 h-3.5"/> Καθαρισμός
          </button>
        )}
      </div>

      {/* Time preset */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20 shrink-0">Χρόνος</span>
        <div className="flex flex-wrap gap-1">
          {TIME_PRESETS.map(p => (
            <button key={p.key} onClick={() => handlePreset(p)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                timePreset === p.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {timePreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 pl-24">
          <span className="text-xs text-gray-400">Από</span>
          <input type="date" value={dateFrom||''} onChange={e=>setF({dateFrom:e.target.value||null})}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-300 focus:outline-none"/>
          <span className="text-xs text-gray-400">Έως</span>
          <input type="date" value={dateTo||''} onChange={e=>setF({dateTo:e.target.value||null})}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-300 focus:outline-none"/>
        </div>
      )}

      {/* Program categories */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20 shrink-0">Κατηγορία</span>
        <div className="flex flex-wrap gap-1">
          {PROG_CATS.map(prog => {
            const active = programs.includes(prog)
            const color  = PROG_C[prog]
            return (
              <button key={prog} onClick={() => toggleProgram(prog)}
                className="px-2.5 py-1 text-xs rounded-lg font-medium transition-all border"
                style={active
                  ? { backgroundColor: color, color:'#fff', borderColor: color }
                  : { backgroundColor:'#f9fafb', color:'#374151', borderColor:'#e5e7eb' }}>
                {prog}
              </button>
            )
          })}
        </div>
      </div>

      {/* Statuses */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20 shrink-0">Status</span>
        <div className="flex flex-wrap gap-1">
          {ALL_STATUSES.map(st => {
            const active = statuses.includes(st)
            const color  = STATUS_C[st]
            return (
              <button key={st} onClick={() => toggleStatus(st)}
                className="px-2.5 py-1 text-xs rounded-lg font-medium transition-all border"
                style={active
                  ? { backgroundColor: color, color: ['NEW LEAD','CALL','ACTIVE'].includes(st) ? '#1f2937' : '#fff', borderColor: color }
                  : { backgroundColor:'#f9fafb', color:'#374151', borderColor:'#e5e7eb' }}>
                {st}
              </button>
            )
          })}
        </div>
      </div>

      {/* Consultant + Program title */}
      <div className="flex flex-wrap items-center gap-4 pl-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20 shrink-0">Σύμβουλος</span>
          <select value={consultant||''} onChange={e=>setF({consultant:e.target.value||null})}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:ring-1 focus:ring-indigo-300 focus:outline-none min-w-[160px]">
            <option value="">Όλοι</option>
            {(consultants||[]).map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20 shrink-0">Πρόγραμμα</span>
          <select value={programTitle||''} onChange={e=>setF({programTitle:e.target.value||null})}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:ring-1 focus:ring-indigo-300 focus:outline-none min-w-[220px]">
            <option value="">Όλα</option>
            {(programTitles||[]).map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  timePreset: 'all', dateFrom: null, dateTo: null,
  programs: [], statuses: [], consultant: null, programTitle: null,
}

export default function LeadsStats() {
  const auth = getAuth()
  const [stats,    setStats]    = useState(null)
  const [period,   setPeriod]   = useState('month')
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState(null)
  const [filters,  setFilters]  = useState(EMPTY_FILTERS)
  const [opts,     setOpts]     = useState({ consultants: [], programTitles: [] })

  // Load filter option lists once
  useEffect(() => {
    if (!auth || auth.user?.role !== 'admin') return
    getLeadFilterOptions().then(d => setOpts({
      consultants:   d.consultants || [],
      programTitles: d.program_titles || [],
    }))
  }, [])

  // Re-fetch stats whenever filters change
  useEffect(() => {
    if (!auth || auth.user?.role !== 'admin') return
    setLoading(true)
    const params = {}
    if (filters.programs?.length)   params.programs      = filters.programs.join(',')
    if (filters.programTitle)        params.program_title = filters.programTitle
    if (filters.statuses?.length)   params.statuses      = filters.statuses.join(',')
    if (filters.consultant)          params.consultant    = filters.consultant
    if (filters.dateFrom)            params.date_from     = filters.dateFrom
    if (filters.dateTo)              params.date_to       = filters.dateTo
    getLeadStats(params)
      .then(setStats)
      .catch(e => setErr(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [filters])

  if (!auth || auth.user?.role !== 'admin') return (
    <div className="p-10 text-center text-red-600 font-semibold">Πρόσβαση μόνο για διαχειριστές.</div>
  )

  const activeFilterCount = (
    (filters.programs?.length || 0) +
    (filters.statuses?.length || 0) +
    (filters.consultant ? 1 : 0) +
    (filters.programTitle ? 1 : 0) +
    (filters.timePreset !== 'all' ? 1 : 0)
  )

  const s = stats?.summary
  const delta = s ? s.this_month - s.last_month : 0
  const periodData = stats ? ({
    day:stats.by_day, week:stats.by_week, month:stats.by_month,
    quarter:stats.by_quarter, semester:stats.by_semester,
  }[period] || []) : []

  const maxProg  = Math.max(...(stats?.by_program||[]).map(r=>r.count),1)
  const maxTitle = Math.max(...(stats?.by_program_title||[]).map(r=>r.count),1)
  const maxStat  = Math.max(...(stats?.by_status||[]).map(r=>r.count),1)
  const maxCons  = Math.max(...(stats?.by_consultant||[]).map(r=>r.count),1)

  return (
    <div className="p-5 lg:p-8 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Στατιστικά Leads</h1>
        <p className="text-sm text-gray-400 mt-0.5">Συνολική εικόνα εισερχόμενων leads ανά περίοδο, πρόγραμμα και σύμβουλο</p>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        consultants={opts.consultants}
        programTitles={opts.programTitles}
        activeCount={activeFilterCount}
      />

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">Φόρτωση…</div>
      ) : err ? (
        <div className="py-16 text-center text-red-500">{err}</div>
      ) : !s ? null : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile label="Σύνολο Leads" value={s.total.toLocaleString('el-GR')} sub="εντός επιλογής" accent="#4f46e5"/>
            <KpiTile label="Ενεργά" value={s.active.toLocaleString('el-GR')}
              sub={`${s.total?Math.round(s.active/s.total*100):0}% του συνόλου`} accent="#0891b2"/>
            <KpiTile label="Deals" value={s.deals.toLocaleString('el-GR')}
              sub={`Ποσοστό μετατροπής ${s.deal_rate}%`} accent="#059669" subGreen/>
            <KpiTile label="Τρέχων μήνας" value={s.this_month.toLocaleString('el-GR')}
              sub={delta===0?'ίδιο με προηγ. μήνα':delta>0?`+${delta} vs προηγ. μήνα`:`${delta} vs προηγ. μήνα`}
              accent={delta>=0?'#059669':'#dc2626'} subGreen={delta>0} subRed={delta<0}/>
          </div>

          {/* Time-series */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Leads ανά χρονική περίοδο</h2>
                <p className="text-xs text-gray-400 mt-0.5">Ομαδοποίηση: {CHART_PERIODS.find(p=>p.key===period)?.label}</p>
              </div>
              <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                {CHART_PERIODS.map(p=>(
                  <button key={p.key} onClick={()=>setPeriod(p.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      period===p.key?'bg-white shadow-sm text-indigo-700 ring-1 ring-gray-200':'text-gray-500 hover:text-gray-700'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <BarChart data={periodData} type={period} color="#4f46e5"/>
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Κατηγορία Προγράμματος</h2>
              <p className="text-xs text-gray-400 mb-4">Αριθμός leads · % deals δεξιά</p>
              <HBars rows={stats.by_program} getColor={r=>PROG_C[r.program]||CAT[4]} maxVal={maxProg} showDeals/>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Τίτλο Προγράμματος</h2>
              <p className="text-xs text-gray-400 mb-4">Top 20 · % deals δεξιά</p>
              <HBars rows={(stats.by_program_title||[]).map(r=>({...r,label:r.title}))}
                getColor={(_,i)=>CAT[i%CAT.length]} maxVal={maxTitle} showDeals/>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Ανά Status</h2>
              <HBars rows={(stats.by_status||[]).map(r=>({...r,label:r.status}))}
                getColor={r=>STATUS_C[r.status]||'#9ca3af'} maxVal={maxStat}/>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Ανά Σύμβουλο</h2>
              <p className="text-xs text-gray-400 mb-4">Συνολικά leads · % deals δεξιά</p>
              <HBars rows={(stats.by_consultant||[]).map(r=>({...r,label:r.name}))}
                getColor={(_,i)=>CAT[i%CAT.length]} maxVal={maxCons} showDeals/>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
