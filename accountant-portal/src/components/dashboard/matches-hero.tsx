'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronDown, ArrowRight, Users } from 'lucide-react'

interface MatchBusiness {
  id: string
  name: string
  afm: string
  activityDescr: string | null
}

interface ProgramOpportunity {
  programId: string
  programTitle: string
  programDescription: string | null
  programCategory: string
  extraCriteriaLabels: string[]
  endDate: string | null
  matchCount: number
  businesses: MatchBusiness[]
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDeadline(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Returns a dot color + short label; deadline urgency is conveyed with a
// colored dot + compact text instead of a bulky pill badge, to keep the
// redesigned card's header row to a single compact line.
function deadlineMeta(endDate: string | null, category?: string): { dot: string; text: string; urgent: boolean } | null {
  if (!endDate) {
    const noDateLabel = category === 'DYPA'
      ? 'Έως κάλυψης θέσεων'
      : category === 'ESPA' || category === 'MICROCREDITS'
      ? 'Έως εξάντλησης κονδυλίων'
      : null
    if (!noDateLabel) return null
    return { dot: 'bg-slate-300', text: noDateLabel, urgent: false }
  }
  const days = daysUntil(endDate)
  const formatted = formatDeadline(endDate)
  if (days < 0) return { dot: 'bg-red-500', text: `Έληξε ${formatted}`, urgent: true }
  if (days <= 14) return { dot: 'bg-red-500', text: days === 0 ? 'Λήγει σήμερα' : `${days} ${days === 1 ? 'ημέρα' : 'ημέρες'} ακόμη`, urgent: true }
  if (days <= 45) return { dot: 'bg-amber-500', text: `${days} ημέρες ακόμη`, urgent: false }
  return { dot: 'bg-emerald-500', text: `Έως ${formatted}`, urgent: false }
}

const VISIBLE_BUSINESSES = 6

function OpportunityCard({ opp, accountantId }: { opp: ProgramOpportunity; accountantId?: string }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? opp.businesses : opp.businesses.slice(0, VISIBLE_BUSINESSES)
  const hiddenCount = opp.businesses.length - visible.length
  const deadline = deadlineMeta(opp.endDate, opp.programCategory)

  return (
    <div className="group/card relative bg-white rounded-lg border border-slate-200/70 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-100/50 transition-all duration-200 flex flex-col overflow-hidden">
      <Link href={`/programs/${opp.programId}`} className="block px-3.5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-slate-900 leading-snug group-hover/card:text-indigo-700 line-clamp-2 flex-1">
            {opp.programTitle}
          </h3>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 rounded-md px-1.5 py-0.5">
            <Users size={10} strokeWidth={2.5} /> {opp.matchCount}
          </span>
        </div>

        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
          {deadline && (
            <span className={`inline-flex items-center gap-1 text-[10.5px] ${deadline.urgent ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${deadline.dot}`} />
              {deadline.text}
            </span>
          )}
          {opp.extraCriteriaLabels.slice(0, 2).map((label, i) => (
            <span key={i} className="text-[10.5px] text-slate-400 truncate max-w-[120px]">· {label}</span>
          ))}
        </div>
      </Link>

      {expanded && (
        <div className="px-3.5 pb-1 -mt-1 space-y-1 max-h-56 overflow-y-auto">
          {visible.map(b => (
            <div key={b.id} className="bg-slate-50 rounded-md px-2 py-1.5 border border-slate-100">
              <p className="text-[11.5px] font-medium text-slate-800 truncate">{b.name}</p>
              <p className="text-[10.5px] text-slate-500 truncate">{b.activityDescr || 'Χωρίς καταχωρημένη δραστηριότητα'}</p>
            </div>
          ))}
          {hiddenCount > 0 && (
            <p className="text-[10.5px] text-slate-400 text-center py-0.5">+{hiddenCount} ακόμη</p>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center border-t border-slate-100 bg-slate-50/60 text-[11px] font-medium">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/60 transition-colors"
        >
          {expanded ? 'Απόκρυψη' : 'Επιχειρήσεις'}
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className="w-px self-stretch bg-slate-200" />
        <Link
          href={`/matches?programIds=${opp.programId}${accountantId ? `&accountantIds=${accountantId}` : ''}`}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/60 transition-colors"
        >
          Matches <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  )
}

export function MatchesHero({ accountantId }: { accountantId?: string }) {
  const [programs, setPrograms] = useState<ProgramOpportunity[] | null>(null)
  // Guards against out-of-order responses: accountantId can change shortly
  // after mount (e.g. the Λογιστής filter hydrating from the URL just after
  // this component's first, unscoped fetch already went out), firing a
  // second request. Without this, a slower unscoped response can resolve
  // after the scoped one and silently overwrite the correct, filtered
  // counts with the global ones.
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    const params = accountantId ? `?accountantId=${accountantId}` : ''
    fetch(`/api/dashboard/match-hero${params}`)
      .then(r => r.json())
      .then(data => {
        if (seq !== requestSeq.current) return
        setPrograms(data.programs || [])
      })
      .catch(() => {
        if (seq === requestSeq.current) setPrograms([])
      })
  }, [accountantId])

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl" />

      <div className="relative flex items-center gap-2 mb-3.5">
        <Sparkles size={17} className="text-amber-300" />
        <h2 className="text-[15px] font-bold tracking-tight">Matches Επιχειρήσεων &amp; Προγραμμάτων</h2>
        {programs && programs.length > 0 && (
          <span className="text-[11px] text-white/40 font-medium">{programs.length} προγράμματα</span>
        )}
      </div>

      <div className="relative">
        {!programs ? (
          <div className="h-40 flex items-center justify-center text-white/60 text-sm">Φόρτωση...</div>
        ) : programs.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-white/60 text-sm">Δεν υπάρχουν matches ακόμη</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {programs.map(opp => <OpportunityCard key={opp.programId} opp={opp} accountantId={accountantId} />)}
          </div>
        )}
      </div>
    </div>
  )
}
