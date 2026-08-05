'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Target, Calendar, Zap, TrendingUp, MapPin, Archive, Megaphone, Check, X, ExternalLink, Clock, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { GREEK_REGIONS } from '@/lib/greek-regions'
import { AiTrainingTab } from '@/components/programs/ai-training-tab'

interface Program {
  id: string
  title: string
  category: string
  description: string | null
  heroImageUrl: string | null
  active: boolean
  archived: boolean
  startDate: string | null
  endDate: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  regionRules: string[]
  kadRules: string[]
  extraCriteriaIds: string[]
  _count: { matches: number }
}

const categoryLabel: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'Μικροπιστώσεις',
  EXTRAJUDICIAL: 'Εξωδικαστικός',
  RENOVATION: 'Ανακαίνιση',
  OTHER: 'Άλλο',
}

const categoryColor: Record<string, string> = {
  ESPA: 'from-blue-700 to-blue-900',
  DYPA: 'from-emerald-600 to-teal-800',
  MICROCREDITS: 'from-amber-600 to-orange-800',
  EXTRAJUDICIAL: 'from-rose-700 to-red-900',
  RENOVATION: 'from-violet-600 to-purple-900',
  OTHER: 'from-slate-600 to-slate-800',
}

const categoryVariant: Record<string, any> = {
  ESPA: 'default',
  DYPA: 'success',
  MICROCREDITS: 'warning',
  EXTRAJUDICIAL: 'danger',
  RENOVATION: 'info',
  OTHER: 'secondary',
}

function formatEuro(value: number) {
  return value.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function DeadlineChip({ endDate, category }: { endDate: string | null; category?: string }) {
  if (!endDate) {
    const noDateLabel = category === 'DYPA'
      ? 'Έως κάλυψης των θέσεων'
      : category === 'ESPA'
      ? 'Έως εξάντλησης του προϋπολογισμού'
      : null
    if (!noDateLabel) return null
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 w-fit">
        <Calendar size={11} className="text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500">{noDateLabel}</span>
      </div>
    )
  }
  const days = daysUntil(endDate)
  const formatted = new Date(endDate).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
  if (days < 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-100 border border-red-300 w-fit">
        <AlertTriangle size={11} className="text-red-700 flex-shrink-0" />
        <span className="text-xs font-bold text-red-800">ΕΛΗΞΕ {formatted}</span>
      </div>
    )
  }
  if (days <= 14) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 w-fit">
        <AlertTriangle size={11} className="text-red-600 flex-shrink-0" />
        <span className="text-xs font-bold text-red-700">
          Λήξη {formatted} · {days === 0 ? 'σήμερα!' : `σε ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}
        </span>
      </div>
    )
  }
  if (days <= 45) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 w-fit">
        <AlertTriangle size={11} className="text-amber-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-amber-700">
          Λήξη {formatted} · σε {days} ημέρες
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200 w-fit">
      <Calendar size={11} className="text-yellow-600 flex-shrink-0" />
      <span className="text-xs font-medium text-yellow-700">Λήξη {formatted} · σε {days} ημέρες</span>
    </div>
  )
}

interface EspaAnnouncement {
  id: string
  title: string
  detailUrl: string
  status: string | null
  operationalProgram: string | null
  applicationArea: string | null
  submissionPeriod: string | null
  description: string | null
  beneficiaries: string | null
  budget: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
  reviewStatus: 'NEW' | 'REVIEWED' | 'IGNORED' | 'CONVERTED' | 'SNOOZED'
  firstSeenAt: string
}

type AnnouncementViewMode = 'new' | 'snoozed' | 'handled'

const VIEW_MODE_LABELS: Record<AnnouncementViewMode, string> = {
  new: 'Νέα',
  snoozed: 'Σε αναμονή',
  handled: 'Διαχειρισμένα',
}

function matchesViewMode(reviewStatus: string, mode: AnnouncementViewMode): boolean {
  if (mode === 'new') return reviewStatus === 'NEW'
  if (mode === 'snoozed') return reviewStatus === 'SNOOZED'
  return reviewStatus === 'REVIEWED' || reviewStatus === 'IGNORED' || reviewStatus === 'CONVERTED'
}

function ViewModeTabs({ mode, onChange, counts }: { mode: AnnouncementViewMode; onChange: (m: AnnouncementViewMode) => void; counts: Record<AnnouncementViewMode, number> }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {(['new', 'snoozed', 'handled'] as AnnouncementViewMode[]).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            mode === m ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {VIEW_MODE_LABELS[m]} {counts[m] > 0 ? `(${counts[m]})` : ''}
        </button>
      ))}
    </div>
  )
}

interface CronStatus {
  espaCronLastRunAt: string | null
  espaCronLastError: string | null
  dypaCronLastRunAt: string | null
  dypaCronLastError: string | null
}

function CronStatusLine({ source }: { source: 'espa' | 'dypa' }) {
  const [status, setStatus] = useState<CronStatus | null>(null)

  useEffect(() => {
    fetch('/api/settings/cron-status')
      .then(r => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {})
  }, [])

  if (!status) return null
  const lastRunAt = source === 'espa' ? status.espaCronLastRunAt : status.dypaCronLastRunAt
  const lastError = source === 'espa' ? status.espaCronLastError : status.dypaCronLastError

  return (
    <p className="text-xs text-gray-400">
      Τελευταίος έλεγχος: {lastRunAt ? formatDateTime(lastRunAt) : 'Δεν έχει τρέξει ακόμη'}
      {lastError && <span className="text-red-500 ml-2">⚠ {lastError}</span>}
    </p>
  )
}

function EspaAnnouncementsTab() {
  const [items, setItems] = useState<EspaAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<AnnouncementViewMode>('new')

  function load() {
    setLoading(true)
    fetch('/api/espa-announcements')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function scrapeNow() {
    setScraping(true)
    setScrapeResult(null)
    try {
      const res = await fetch('/api/cron/check-espa', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setScrapeResult(`Σφάλμα: ${data.detail || data.error || 'Άγνωστο σφάλμα'}`)
      } else {
        setScrapeResult(data.newCount > 0 ? `Βρέθηκαν ${data.newCount} νέες προκηρύξεις!` : 'Δεν βρέθηκαν νέες προκηρύξεις.')
        load()
      }
    } catch {
      setScrapeResult('Σφάλμα σύνδεσης.')
    } finally {
      setScraping(false)
    }
  }

  async function updateStatus(id: string, reviewStatus: string) {
    await fetch(`/api/espa-announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus }),
    })
    setItems(prev => prev.map(i => i.id === id ? { ...i, reviewStatus: reviewStatus as any } : i))
  }

  const visible = items.filter(i => matchesViewMode(i.reviewStatus, viewMode))
  const counts: Record<AnnouncementViewMode, number> = {
    new: items.filter(i => i.reviewStatus === 'NEW').length,
    snoozed: items.filter(i => i.reviewStatus === 'SNOOZED').length,
    handled: items.filter(i => matchesViewMode(i.reviewStatus, 'handled')).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {counts.new} νέες προκηρύξεις προς έγκριση
          </p>
          <CronStatusLine source="espa" />
          {scrapeResult && (
            <p className={`text-xs mt-0.5 ${scrapeResult.startsWith('Σφάλμα') ? 'text-red-600' : 'text-green-700'}`}>
              {scrapeResult}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={scrapeNow} disabled={scraping} className="gap-1.5">
            <RefreshCw size={13} className={scraping ? 'animate-spin' : ''} />
            {scraping ? 'Αναζήτηση…' : 'Ψάξε τώρα'}
          </Button>
          <ViewModeTabs mode={viewMode} onChange={setViewMode} counts={counts} />
        </div>
      </div>

      {visible.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          {viewMode === 'new' ? 'Δεν υπάρχουν νέες προκηρύξεις προς έγκριση' : viewMode === 'snoozed' ? 'Δεν υπάρχουν προκηρύξεις σε αναμονή' : 'Δεν υπάρχουν διαχειρισμένες προκηρύξεις'}
        </div>
      )}

      <div className="space-y-3">
        {visible.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                {item.status && <Badge variant="warning" className="text-[10px]">{item.status}</Badge>}
                {item.reviewStatus !== 'NEW' && (
                  <Badge variant={item.reviewStatus === 'CONVERTED' ? 'success' : item.reviewStatus === 'SNOOZED' ? 'warning' : 'secondary'} className="text-[10px]">
                    {item.reviewStatus === 'CONVERTED' ? 'Μετατράπηκε' : item.reviewStatus === 'IGNORED' ? 'Αγνοήθηκε' : item.reviewStatus === 'SNOOZED' ? 'Σε αναμονή' : 'Ελέγχθηκε'}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {item.operationalProgram && <span>{item.operationalProgram}</span>}
                {item.applicationArea && <span>{item.applicationArea}</span>}
                {item.submissionPeriod && <span>{item.submissionPeriod}</span>}
                {item.budget && <span>Προϋπολογισμός: {item.budget}</span>}
              </div>
              {item.description && (
                <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{item.description}</p>
              )}
              {item.beneficiaries && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-1"><span className="font-medium">Δικαιούχοι:</span> {item.beneficiaries}</p>
              )}
              {item.attachmentUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {item.attachmentUrls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline">
                      {item.attachmentNames[i] || `Σχετικό αρχείο ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
              <a href={item.detailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline mt-1.5">
                Δείτε στο ΕΣΠΑ <ExternalLink size={11} />
              </a>
            </div>
            {item.reviewStatus === 'NEW' && (
              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/programs/new?fromAnnouncementId=${item.id}`}>
                  <Button size="sm"><Check size={14} className="mr-1.5" />Μετατροπή σε Πρόγραμμα</Button>
                </Link>
                <Button size="sm" variant="ghost" title="Προσωρινή απόκρυψη" onClick={() => updateStatus(item.id, 'SNOOZED')}>
                  <Clock size={14} />
                </Button>
                <Button size="sm" variant="ghost" title="Αγνόηση" onClick={() => updateStatus(item.id, 'IGNORED')}>
                  <X size={14} />
                </Button>
              </div>
            )}
            {item.reviewStatus === 'SNOOZED' && (
              <Button size="sm" variant="ghost" onClick={() => updateStatus(item.id, 'NEW')} className="flex-shrink-0">
                Επαναφορά
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface DypaAnnouncement {
  id: string
  title: string
  detailUrl: string
  status: string | null
  description: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
  reviewStatus: 'NEW' | 'REVIEWED' | 'IGNORED' | 'CONVERTED' | 'SNOOZED'
  firstSeenAt: string
}

function DypaAnnouncementsTab() {
  const [items, setItems] = useState<DypaAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<AnnouncementViewMode>('new')

  function load() {
    setLoading(true)
    fetch('/api/dypa-announcements')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function scrapeNow() {
    setScraping(true)
    setScrapeResult(null)
    try {
      const res = await fetch('/api/cron/check-dypa', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setScrapeResult(`Σφάλμα: ${data.detail || data.error || 'Άγνωστο σφάλμα'}`)
      } else {
        setScrapeResult(data.newCount > 0 ? `Βρέθηκαν ${data.newCount} νέα προγράμματα!` : 'Δεν βρέθηκαν νέα προγράμματα.')
        load()
      }
    } catch {
      setScrapeResult('Σφάλμα σύνδεσης.')
    } finally {
      setScraping(false)
    }
  }

  async function updateStatus(id: string, reviewStatus: string) {
    await fetch(`/api/dypa-announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus }),
    })
    setItems(prev => prev.map(i => i.id === id ? { ...i, reviewStatus: reviewStatus as any } : i))
  }

  const visible = items.filter(i => matchesViewMode(i.reviewStatus, viewMode))
  const counts: Record<AnnouncementViewMode, number> = {
    new: items.filter(i => i.reviewStatus === 'NEW').length,
    snoozed: items.filter(i => i.reviewStatus === 'SNOOZED').length,
    handled: items.filter(i => matchesViewMode(i.reviewStatus, 'handled')).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {counts.new} νέα προγράμματα προς έγκριση
          </p>
          <CronStatusLine source="dypa" />
          {scrapeResult && (
            <p className={`text-xs mt-0.5 ${scrapeResult.startsWith('Σφάλμα') ? 'text-red-600' : 'text-green-700'}`}>
              {scrapeResult}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={scrapeNow} disabled={scraping} className="gap-1.5">
            <RefreshCw size={13} className={scraping ? 'animate-spin' : ''} />
            {scraping ? 'Αναζήτηση…' : 'Ψάξε τώρα'}
          </Button>
          <ViewModeTabs mode={viewMode} onChange={setViewMode} counts={counts} />
        </div>
      </div>

      {visible.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          {viewMode === 'new' ? 'Δεν υπάρχουν νέα προγράμματα προς έγκριση' : viewMode === 'snoozed' ? 'Δεν υπάρχουν προγράμματα σε αναμονή' : 'Δεν υπάρχουν διαχειρισμένα προγράμματα'}
        </div>
      )}

      <div className="space-y-3">
        {visible.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                {item.status && <Badge variant="warning" className="text-[10px]">{item.status}</Badge>}
                {item.reviewStatus !== 'NEW' && (
                  <Badge variant={item.reviewStatus === 'CONVERTED' ? 'success' : item.reviewStatus === 'SNOOZED' ? 'warning' : 'secondary'} className="text-[10px]">
                    {item.reviewStatus === 'CONVERTED' ? 'Μετατράπηκε' : item.reviewStatus === 'IGNORED' ? 'Αγνοήθηκε' : item.reviewStatus === 'SNOOZED' ? 'Σε αναμονή' : 'Ελέγχθηκε'}
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{item.description}</p>
              )}
              {item.attachmentUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {item.attachmentUrls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline">
                      {item.attachmentNames[i] || `Σχετικό αρχείο ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
              <a href={item.detailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline mt-1.5">
                Δείτε στη ΔΥΠΑ <ExternalLink size={11} />
              </a>
            </div>
            {item.reviewStatus === 'NEW' && (
              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/programs/new?fromDypaAnnouncementId=${item.id}`}>
                  <Button size="sm"><Check size={14} className="mr-1.5" />Μετατροπή σε Πρόγραμμα</Button>
                </Link>
                <Button size="sm" variant="ghost" title="Προσωρινή απόκρυψη" onClick={() => updateStatus(item.id, 'SNOOZED')}>
                  <Clock size={14} />
                </Button>
                <Button size="sm" variant="ghost" title="Αγνόηση" onClick={() => updateStatus(item.id, 'IGNORED')}>
                  <X size={14} />
                </Button>
              </div>
            )}
            {item.reviewStatus === 'SNOOZED' && (
              <Button size="sm" variant="ghost" onClick={() => updateStatus(item.id, 'NEW')} className="flex-shrink-0">
                Επαναφορά
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProgramsPage() {
  const { data: session } = useSession()
  const [programs, setPrograms] = useState<Program[]>([])
  const [filter, setFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'programs' | 'espa' | 'dypa' | 'ai-training'>('programs')
  const [newEspaCount, setNewEspaCount] = useState(0)
  const [newDypaCount, setNewDypaCount] = useState(0)
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => setPrograms(data.programs || []))
      .finally(() => setLoading(false))
    fetch('/api/admin/criteria')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {}
          for (const c of data) map[c.id] = c.label
          setCriteriaMap(map)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/espa-announcements')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setNewEspaCount(data.filter((i: EspaAnnouncement) => i.reviewStatus === 'NEW').length)
      })
      .catch(() => {})
    fetch('/api/dypa-announcements')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setNewDypaCount(data.filter((i: DypaAnnouncement) => i.reviewStatus === 'NEW').length)
      })
      .catch(() => {})
  }, [isAdmin, tab])

  const visible = programs.filter(p => showArchived ? p.archived : !p.archived)
  const filtered = filter ? visible.filter(p => p.category === filter) : visible
  const archivedCount = programs.filter(p => p.archived).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Επιχορηγούμενα Προγράμματα</h1>
          <p className="text-gray-500 mt-1">{programs.filter(p => !p.archived).length} ενεργά{archivedCount > 0 ? ` · ${archivedCount} αρχειοθετημένα` : ''}</p>
        </div>
        {isAdmin && tab === 'programs' && (
          <Link href="/programs/new">
            <Button><Plus size={16} className="mr-2" />Νέο Πρόγραμμα</Button>
          </Link>
        )}
      </div>

      {isAdmin && (
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab('programs')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'programs' ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Προγράμματα
          </button>
          <button
            onClick={() => setTab('espa')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'espa' ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Megaphone size={14} />
            Προς Έγκριση ΕΣΠΑ
            {newEspaCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{newEspaCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('dypa')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'dypa' ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Megaphone size={14} />
            Προς Έγκριση ΔΥΠΑ
            {newDypaCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{newDypaCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('ai-training')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'ai-training' ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Sparkles size={14} />
            AI Εκπαίδευση
          </button>
        </div>
      )}

      {tab === 'espa' ? (
        <EspaAnnouncementsTab />
      ) : tab === 'dypa' ? (
        <DypaAnnouncementsTab />
      ) : tab === 'ai-training' ? (
        isAdmin ? <AiTrainingTab /> : null
      ) : (
        <>
      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {['', 'ESPA', 'DYPA', 'MICROCREDITS'].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === cat
                ? 'bg-blue-800 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {cat ? categoryLabel[cat] : 'Όλα'}
          </button>
        ))}
        {isAdmin && archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              showArchived
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'
            }`}
          >
            <Archive size={13} />
            {showArchived ? 'Αρχειοθετημένα' : `Αρχείο (${archivedCount})`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(program => (
            <Link key={program.id} href={`/programs/${program.id}`} className="block group">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-200 cursor-pointer h-full flex flex-col group-hover:-translate-y-0.5">
                {/* Hero image / gradient banner */}
                <div className={`relative h-36 bg-gradient-to-br ${categoryColor[program.category] || 'from-slate-600 to-slate-800'} overflow-hidden flex-shrink-0`}>
                  {program.heroImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={program.heroImageUrl}
                      alt={program.title}
                      className="w-full h-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center px-4">
                      <span className="text-white text-center font-bold text-lg leading-tight drop-shadow-md line-clamp-3" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
                        {program.title}
                      </span>
                    </div>
                  )}
                  {/* Category badge */}
                  <div className="absolute top-3 right-3">
                    <span className="bg-white/90 backdrop-blur-sm text-xs font-bold px-2.5 py-1 rounded-full text-gray-800">
                      {categoryLabel[program.category]}
                    </span>
                  </div>
                  {(!program.active || program.archived) && (
                    <div className="absolute top-3 left-3 flex gap-1">
                      {!program.active && <span className="bg-gray-800/80 text-white text-xs font-medium px-2 py-0.5 rounded-full">Ανενεργό</span>}
                      {program.archived && <span className="bg-amber-700/90 text-white text-xs font-medium px-2 py-0.5 rounded-full">Αρχείο</span>}
                    </div>
                  )}
                  {/* Matches badge */}
                  <div className="absolute bottom-3 left-3">
                    <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${program._count.matches > 0 ? 'bg-green-500 text-white' : 'bg-black/40 text-white'}`}>
                      <Zap size={10} />
                      {program._count.matches} matches
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-gray-900 mb-2 leading-snug text-sm">{program.title}</h3>
                  {program.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{program.description}</p>
                  )}

                  {/* Details grid */}
                  <div className="mt-auto space-y-1.5 pt-3 border-t border-gray-100">
                    <DeadlineChip endDate={program.endDate} category={program.category} />
                    {(program.minInvestment || program.maxInvestment) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-green-600 flex-shrink-0" />
                        <span className="font-medium">Επένδυση:</span>
                        <span>
                          {program.minInvestment && program.maxInvestment
                            ? `${formatEuro(program.minInvestment)} – ${formatEuro(program.maxInvestment)}`
                            : program.minInvestment
                            ? `από ${formatEuro(program.minInvestment)}`
                            : `έως ${formatEuro(program.maxInvestment!)}`}
                        </span>
                      </div>
                    )}
                    {(program.minSubsidyPct != null || program.maxSubsidyPct != null) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-blue-600 flex-shrink-0" />
                        <span className="font-medium">Επιχορήγηση:</span>
                        <span>
                          {program.minSubsidyPct != null && program.maxSubsidyPct != null
                            ? `${program.minSubsidyPct}% – ${program.maxSubsidyPct}%`
                            : program.minSubsidyPct != null
                            ? `από ${program.minSubsidyPct}%`
                            : `έως ${program.maxSubsidyPct}%`}
                        </span>
                      </div>
                    )}
                    {(program.minInterestRate != null || program.maxInterestRate != null) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-amber-600 flex-shrink-0" />
                        <span className="font-medium">Επιτόκιο:</span>
                        <span>
                          {program.minInterestRate != null && program.maxInterestRate != null
                            ? `${program.minInterestRate}% – ${program.maxInterestRate}%`
                            : program.minInterestRate != null
                            ? `από ${program.minInterestRate}%`
                            : `έως ${program.maxInterestRate}%`}
                        </span>
                      </div>
                    )}
                    {program.regionRules.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <MapPin size={11} className="text-indigo-500 flex-shrink-0" />
                        <span className="truncate">
                          {program.regionRules.length >= GREEK_REGIONS.length
                            ? 'Όλη η Ελλάδα'
                            : `${program.regionRules.slice(0, 2).join(', ')}${program.regionRules.length > 2 ? ` +${program.regionRules.length - 2}` : ''}`}
                        </span>
                      </div>
                    )}
                    {program.extraCriteriaIds?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {program.extraCriteriaIds.map(cid => (
                          <Badge key={cid} variant="secondary" className="text-[10px]">{criteriaMap[cid] || cid}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-12">
              Δεν βρέθηκαν προγράμματα
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
