'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronDown, ArrowRight, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface MatchBusiness {
  id: string
  name: string
  afm: string
  matchScore: number
  status: string
}

interface ProgramOpportunity {
  programId: string
  programTitle: string
  programDescription: string | null
  programCategory: string
  matchCount: number
  businesses: MatchBusiness[]
}

const STATUS_LABELS: Record<string, string> = {
  POTENTIAL: 'Πιθανό',
  REVIEWED: 'Ελέγχθηκε',
  REJECTED: 'Απορρίφθηκε',
  INTERESTED: 'Ενδιαφέρον',
  SUBMITTED: 'Υποβλήθηκε',
}

const STATUS_STYLES: Record<string, string> = {
  POTENTIAL: 'bg-slate-100 text-slate-600',
  REVIEWED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  INTERESTED: 'bg-amber-100 text-amber-700',
  SUBMITTED: 'bg-emerald-100 text-emerald-700',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-lime-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-600'
}

const VISIBLE_BUSINESSES = 6

function OpportunityCard({ opp }: { opp: ProgramOpportunity }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? opp.businesses : opp.businesses.slice(0, VISIBLE_BUSINESSES)
  const hiddenCount = opp.businesses.length - visible.length

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 leading-snug">{opp.programTitle}</h3>
        <Badge variant="purple" className="flex-shrink-0">
          <Users size={11} /> {opp.matchCount}
        </Badge>
      </div>
      {opp.programDescription && (
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{opp.programDescription}</p>
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
            <div key={b.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{b.name}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[b.status] || 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABELS[b.status] || b.status}
                </span>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${scoreColor(b.matchScore)}`}>{Math.round(b.matchScore)}%</span>
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
