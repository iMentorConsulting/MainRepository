'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronDown, ArrowRight, Users, ExternalLink, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
  otherRequirements: string | null
  endDate: string | null
  matchCount: number
  businesses: MatchBusiness[]
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const VISIBLE_BUSINESSES = 6

function OpportunityCard({ opp }: { opp: ProgramOpportunity }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? opp.businesses : opp.businesses.slice(0, VISIBLE_BUSINESSES)
  const hiddenCount = opp.businesses.length - visible.length
  const remainingDays = opp.endDate ? daysUntil(opp.endDate) : null

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/programs/${opp.programId}`} className="group flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-indigo-700 flex items-center gap-1">
            <span className="truncate">{opp.programTitle}</span>
            <ExternalLink size={11} className="flex-shrink-0 text-slate-300 group-hover:text-indigo-500" />
          </h3>
        </Link>
        <Badge variant="purple" className="flex-shrink-0">
          <Users size={11} /> {opp.matchCount}
        </Badge>
      </div>

      {remainingDays !== null && remainingDays >= 0 && remainingDays <= 30 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full mt-1.5 w-fit">
          <AlertTriangle size={10} /> Λήξη σε {remainingDays} {remainingDays === 1 ? 'ημέρα' : 'ημέρες'}
        </span>
      )}

      {opp.programDescription && (
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{opp.programDescription}</p>
      )}
      {opp.otherRequirements && (
        <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
          <span className="font-medium text-slate-600">Πρόσθετες Προϋποθέσεις:</span> {opp.otherRequirements}
        </p>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 mt-3"
      >
        {expanded ? 'Απόκρυψη επαφών' : 'Δείτε τις επιχειρήσεις'}
        <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {visible.map(b => (
            <div key={b.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
              <p className="text-xs font-medium text-slate-800 truncate">{b.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{b.activityDescr || 'Χωρίς καταχωρημένη δραστηριότητα'}</p>
            </div>
          ))}
          {hiddenCount > 0 && (
            <p className="text-[11px] text-slate-400 text-center pt-0.5">+{hiddenCount} ακόμη</p>
          )}
        </div>
      )}

      <Link
        href={`/matches?programIds=${opp.programId}`}
        className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-indigo-700 mt-3 pt-3 border-t border-slate-100"
      >
        Δείτε στα Matches <ArrowRight size={12} />
      </Link>
    </div>
  )
}

export function MatchesHero({ accountantId }: { accountantId?: string }) {
  const [programs, setPrograms] = useState<ProgramOpportunity[] | null>(null)

  useEffect(() => {
    const params = accountantId ? `?accountantId=${accountantId}` : ''
    fetch(`/api/dashboard/match-hero${params}`)
      .then(r => r.json())
      .then(data => setPrograms(data.programs || []))
      .catch(() => setPrograms([]))
  }, [accountantId])

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl" />

      <div className="relative flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-amber-300" />
        <h2 className="text-base font-bold">Matches Επιχειρήσεων &amp; Προγραμμάτων</h2>
      </div>

      <div className="relative">
        {!programs ? (
          <div className="h-40 flex items-center justify-center text-white/60 text-sm">Φόρτωση...</div>
        ) : programs.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-white/60 text-sm">Δεν υπάρχουν matches ακόμη</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {programs.map(opp => <OpportunityCard key={opp.programId} opp={opp} />)}
          </div>
        )}
      </div>
    </div>
  )
}
