'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, ChevronDown, ArrowRight, Users,
  Landmark, Briefcase, Coins, Scale, Hammer, TrendingUp, MapPin, Layers,
} from 'lucide-react'

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

// Per-category accent color + icon, used for the card's glowing top edge,
// icon chip and hover tint — gives each program family an instantly
// recognizable identity instead of every card looking identical.
const CATEGORY_META: Record<string, { icon: typeof Landmark; grad: string; glow: string; text: string; bg: string }> = {
  ESPA:          { icon: Landmark,    grad: 'from-indigo-400 to-violet-500',   glow: 'group-hover/card:shadow-indigo-500/20',  text: 'text-indigo-300',  bg: 'bg-indigo-500/15' },
  DYPA:          { icon: Briefcase,   grad: 'from-sky-400 to-cyan-500',        glow: 'group-hover/card:shadow-sky-500/20',     text: 'text-sky-300',     bg: 'bg-sky-500/15' },
  MICROCREDITS:  { icon: Coins,       grad: 'from-emerald-400 to-teal-500',    glow: 'group-hover/card:shadow-emerald-500/20', text: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  EXTRAJUDICIAL: { icon: Scale,       grad: 'from-rose-400 to-pink-500',       glow: 'group-hover/card:shadow-rose-500/20',    text: 'text-rose-300',    bg: 'bg-rose-500/15' },
  RENOVATION:    { icon: Hammer,      grad: 'from-amber-400 to-orange-500',    glow: 'group-hover/card:shadow-amber-500/20',   text: 'text-amber-300',   bg: 'bg-amber-500/15' },
  ANAPTYXIAKOS:  { icon: TrendingUp,  grad: 'from-fuchsia-400 to-purple-500',  glow: 'group-hover/card:shadow-fuchsia-500/20', text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15' },
  LEADER:        { icon: MapPin,      grad: 'from-teal-400 to-cyan-500',       glow: 'group-hover/card:shadow-teal-500/20',    text: 'text-teal-300',    bg: 'bg-teal-500/15' },
  OTHER:         { icon: Layers,      grad: 'from-slate-400 to-slate-500',     glow: 'group-hover/card:shadow-slate-500/20',   text: 'text-slate-300',   bg: 'bg-slate-500/15' },
}

function categoryMeta(category: string) {
  return CATEGORY_META[category] || CATEGORY_META.OTHER
}

function deadlineMeta(endDate: string | null, category?: string): { text: string; tone: 'critical' | 'warn' | 'ok' | 'neutral' } | null {
  if (!endDate) {
    const noDateLabel = category === 'DYPA'
      ? 'Έως κάλυψης θέσεων'
      : category === 'ESPA' || category === 'MICROCREDITS'
      ? 'Έως εξάντλησης κονδυλίων'
      : null
    if (!noDateLabel) return null
    return { text: noDateLabel, tone: 'neutral' }
  }
  const days = daysUntil(endDate)
  const formatted = formatDeadline(endDate)
  if (days < 0) return { text: `Έληξε ${formatted}`, tone: 'critical' }
  if (days <= 14) return { text: days === 0 ? 'Λήγει σήμερα' : `${days} ${days === 1 ? 'ημέρα' : 'ημέρες'} ακόμη`, tone: 'critical' }
  if (days <= 45) return { text: `${days} ημέρες ακόμη`, tone: 'warn' }
  return { text: `Έως ${formatted}`, tone: 'ok' }
}

const TONE_DOT: Record<string, string> = {
  critical: 'bg-red-400',
  warn: 'bg-amber-400',
  ok: 'bg-emerald-400',
  neutral: 'bg-white/30',
}
const TONE_TEXT: Record<string, string> = {
  critical: 'text-red-300 font-semibold',
  warn: 'text-amber-300',
  ok: 'text-white/45',
  neutral: 'text-white/35',
}

const VISIBLE_BUSINESSES = 6

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase()
}

function OpportunityCard({ opp, accountantId }: { opp: ProgramOpportunity; accountantId?: string }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? opp.businesses : opp.businesses.slice(0, VISIBLE_BUSINESSES)
  const hiddenCount = opp.businesses.length - visible.length
  const deadline = deadlineMeta(opp.endDate, opp.programCategory)
  const meta = categoryMeta(opp.programCategory)
  const Icon = meta.icon

  return (
    <div
      className={`group/card relative flex flex-col rounded-xl border border-white/10 bg-white/[0.045] backdrop-blur-xl
        transition-all duration-300 ease-out overflow-hidden
        hover:-translate-y-[3px] hover:border-white/20 hover:bg-white/[0.08] hover:shadow-xl ${meta.glow}`}
    >
      <div className={`h-[2.5px] w-full bg-gradient-to-r ${meta.grad} opacity-70 group-hover/card:opacity-100 transition-opacity`} />

      <Link href={`/programs/${opp.programId}`} className="block px-3.5 pt-3 pb-2">
        <div className="flex items-start gap-2.5">
          <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${meta.bg} ${meta.text} flex items-center justify-center`}>
            <Icon size={13} strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[12.5px] font-semibold text-white leading-snug group-hover/card:text-white transition-colors">
              {opp.programTitle}
            </h3>
          </div>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold text-white bg-white/10 group-hover/card:bg-white/15 rounded-md px-1.5 py-0.5 transition-colors">
            <Users size={9.5} strokeWidth={2.75} /> {opp.matchCount}
          </span>
        </div>

        {deadline && (
          <div className="flex items-center gap-1.5 mt-2 ml-9">
            <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[deadline.tone]} ${deadline.tone === 'critical' ? 'animate-pulse' : ''}`} />
            <span className={`text-[10.5px] ${TONE_TEXT[deadline.tone]}`}>{deadline.text}</span>
            {opp.extraCriteriaLabels.length > 0 && (
              <span className="text-[10.5px] text-white/25 truncate">· {opp.extraCriteriaLabels[0]}</span>
            )}
          </div>
        )}
      </Link>

      <div
        className={`grid transition-all duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-2 space-y-1 max-h-56 overflow-y-auto">
            {visible.map(b => (
              <div key={b.id} className="flex items-center gap-2 bg-white/[0.05] rounded-lg px-2 py-1.5 border border-white/5">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/70 text-[8.5px] font-bold flex items-center justify-center">
                  {initials(b.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white/90 truncate">{b.name}</p>
                  <p className="text-[10px] text-white/40 truncate">{b.activityDescr || 'Χωρίς καταχωρημένη δραστηριότητα'}</p>
                </div>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p className="text-[10px] text-white/35 text-center py-0.5">+{hiddenCount} ακόμη</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center border-t border-white/10 text-[10.5px] font-medium">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {expanded ? 'Απόκρυψη' : 'Επιχειρήσεις'}
          <ChevronDown size={11} className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className="w-px self-stretch bg-white/10" />
        <Link
          href={`/matches?programIds=${opp.programId}${accountantId ? `&accountantIds=${accountantId}` : ''}`}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          Matches <ArrowRight size={10.5} />
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

  const totalMatches = programs?.reduce((sum, p) => sum + p.matchCount, 0) ?? 0

  return (
    <div className="relative rounded-2xl p-6 text-white overflow-hidden bg-slate-950">
      {/* layered glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900" />
      <div className="absolute -top-24 -right-16 w-80 h-80 bg-indigo-500/25 rounded-full blur-[100px]" />
      <div className="absolute -bottom-24 -left-16 w-80 h-80 bg-fuchsia-500/15 rounded-full blur-[100px]" />
      <div className="absolute top-1/3 left-1/2 w-72 h-72 bg-cyan-400/10 rounded-full blur-[110px]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />

      <div className="relative flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles size={14} className="text-slate-900" strokeWidth={2.5} />
          </div>
          <h2 className="text-[15px] font-bold tracking-tight">Matches Επιχειρήσεων &amp; Προγραμμάτων</h2>
        </div>
        {programs && programs.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-white/45 font-medium">
            <span>{programs.length} προγράμματα</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-amber-300/90 font-semibold">{totalMatches} επιχειρήσεις</span>
          </div>
        )}
      </div>

      <div className="relative">
        {!programs ? (
          <div className="h-40 flex items-center justify-center text-white/40 text-sm gap-2">
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            Φόρτωση...
          </div>
        ) : programs.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-white/40 text-sm">Δεν υπάρχουν matches ακόμη</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {programs.map(opp => <OpportunityCard key={opp.programId} opp={opp} accountantId={accountantId} />)}
          </div>
        )}
      </div>
    </div>
  )
}
