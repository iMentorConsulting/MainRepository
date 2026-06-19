'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Sparkles, Rows3, Network, ArrowRight, Building2 } from 'lucide-react'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface FeedItem {
  id: string
  businessId: string
  businessName: string
  businessAfm: string
  programId: string
  programTitle: string
  programCategory: string
  matchScore: number
  status: string
  notified: boolean
  createdAt: string
}

interface GraphNode {
  id: string
  label: string
  type: 'program' | 'business'
  category?: string
}

interface GraphLink {
  source: string
  target: string
  score: number
  status: string
}

interface MatchHeroData {
  feed: FeedItem[]
  graph: { nodes: GraphNode[]; links: GraphLink[] }
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
  if (score >= 80) return '#059669'
  if (score >= 60) return '#65a30d'
  if (score >= 40) return '#d97706'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score)
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div
      className="relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, #f1f5f9 0deg)` }}
    >
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
        <span className="text-[10px] font-bold" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  )
}

function LiveFeed({ feed }: { feed: FeedItem[] }) {
  if (feed.length === 0) {
    return <div className="h-[340px] flex items-center justify-center text-slate-400 text-sm">Δεν υπάρχουν matches ακόμη</div>
  }

  return (
    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {feed.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-3 hover:border-indigo-200 hover:shadow-sm transition-all"
          >
            <ScoreRing score={item.matchScore} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900 truncate">{item.businessName}</span>
                <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                <span className="text-slate-600 truncate">{item.programTitle}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] || 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
                {item.notified && <span className="text-[10px] text-indigo-500">✓ Ενημερώθηκε</span>}
              </div>
            </div>
            <Link
              href={`/matches?search=${encodeURIComponent(item.businessAfm)}`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex-shrink-0"
            >
              Δείτε →
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function MatchGraph({ graph }: { graph: { nodes: GraphNode[]; links: GraphLink[] } }) {
  if (graph.nodes.length === 0) {
    return <div className="h-[380px] flex items-center justify-center text-slate-400 text-sm">Δεν υπάρχουν matches ακόμη</div>
  }

  const graphData = useMemo(() => ({
    nodes: graph.nodes.map(n => ({ ...n })),
    links: graph.links.map(l => ({ ...l })),
  }), [graph])

  return (
    <div className="h-[380px] rounded-xl bg-slate-50 overflow-hidden border border-slate-100">
      <ForceGraph2D
        graphData={graphData}
        nodeLabel={(n: any) => n.label}
        nodeColor={(n: any) => (n.type === 'program' ? '#4f46e5' : '#94a3b8')}
        nodeVal={(n: any) => (n.type === 'program' ? 8 : 3)}
        linkColor={(l: any) => scoreColor(l.score)}
        linkWidth={(l: any) => Math.max(0.5, l.score / 30)}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        cooldownTicks={80}
        backgroundColor="#f8fafc"
      />
    </div>
  )
}

export function MatchesHero({ accountantId }: { accountantId?: string }) {
  const [data, setData] = useState<MatchHeroData | null>(null)
  const [view, setView] = useState<'feed' | 'graph'>('feed')

  useEffect(() => {
    const params = accountantId ? `?accountantId=${accountantId}` : ''
    fetch(`/api/dashboard/match-hero${params}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [accountantId])

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl" />

      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-300" />
          <h2 className="text-base font-bold">Matches Επιχειρήσεων &amp; Προγραμμάτων</h2>
        </div>
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          <button
            onClick={() => setView('feed')}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'feed' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'}`}
          >
            <Rows3 size={13} /> Ροή
          </button>
          <button
            onClick={() => setView('graph')}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'graph' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'}`}
          >
            <Network size={13} /> Δίκτυο
          </button>
        </div>
      </div>

      <div className="relative bg-white/95 rounded-xl p-3">
        {!data ? (
          <div className="h-[380px] flex items-center justify-center text-slate-400 text-sm">Φόρτωση...</div>
        ) : view === 'feed' ? (
          <LiveFeed feed={data.feed} />
        ) : (
          <MatchGraph graph={data.graph} />
        )}
      </div>

      <div className="relative flex items-center justify-between mt-3 text-xs text-white/60">
        <span className="flex items-center gap-1"><Building2 size={12} /> {data?.graph.nodes.filter(n => n.type === 'business').length ?? 0} επιχειρήσεις σε ταίριασμα</span>
        <Link href="/matches" className="text-white/90 hover:text-white font-medium flex items-center gap-1">
          Όλα τα matches <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}
