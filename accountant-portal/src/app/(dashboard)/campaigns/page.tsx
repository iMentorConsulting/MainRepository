'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle, Send, Users, FileText, CheckCircle2, Sparkles, ArrowRight, AlertTriangle, Eye, MousePointerClick, Filter, X, Search } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const statusVariant: Record<string, any> = { DRAFT: 'secondary', SCHEDULED: 'warning', SENT: 'success' }
const statusLabel: Record<string, string> = { DRAFT: 'Πρόχειρο', SCHEDULED: 'Προγρ/νο', SENT: 'Απεστάλη' }
const channelLabel: Record<string, string> = { EMAIL: 'Email', VIBER: 'Viber', EMAIL_AND_VIBER: 'Email & Viber' }

const CHANNEL_OPTIONS = ['EMAIL', 'VIBER', 'EMAIL_AND_VIBER']
const STATUS_OPTIONS = ['DRAFT', 'SENT', 'SCHEDULED']

// ── Reusable chip-group with optional search + select-all ──────────────────
interface ChipGroupProps {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  searchable?: boolean
}

function ChipGroup({ label, options, selected, onChange, searchable = false }: ChipGroupProps) {
  const [q, setQ] = useState('')

  const visible = useMemo(
    () => q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options,
    [options, q]
  )

  const allVisibleSelected = visible.length > 0 && visible.every(o => selected.includes(o.id))
  const someSelected = selected.length > 0

  function toggleOne(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  function toggleAll() {
    if (allVisibleSelected) {
      // deselect only the visible ones
      const visibleIds = new Set(visible.map(o => o.id))
      onChange(selected.filter(id => !visibleIds.has(id)))
    } else {
      // add all visible that aren't yet selected
      const visibleIds = visible.map(o => o.id)
      onChange(Array.from(new Set([...selected, ...visibleIds])))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        <div className="flex items-center gap-2">
          {someSelected && (
            <button onClick={() => onChange([])} className="text-[11px] text-gray-400 hover:text-gray-600">
              Καθαρισμός
            </button>
          )}
          {options.length > 1 && (
            <button onClick={toggleAll} className="text-[11px] text-blue-700 hover:text-blue-900 font-medium">
              {allVisibleSelected ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}
            </button>
          )}
        </div>
      </div>

      {searchable && options.length > 5 && (
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Αναζήτηση…"
            className="w-full text-xs pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <span className="text-xs text-gray-400 italic">Δεν βρέθηκαν αποτελέσματα</span>
        ) : (
          visible.map(o => (
            <button
              key={o.id}
              onClick={() => toggleOne(o.id)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selected.includes(o.id)
                  ? 'bg-blue-800 text-white border-blue-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [allCampaigns, setAllCampaigns] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [accountants, setAccountants] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // Filter state
  const [selAccountants, setSelAccountants] = useState<string[]>([])
  const [selChannels, setSelChannels] = useState<string[]>([])
  const [selStatuses, setSelStatuses] = useState<string[]>([])
  const [selPrograms, setSelPrograms] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (selAccountants.length) p.set('accountantIds', selAccountants.join(','))
    if (selChannels.length) p.set('channels', selChannels.join(','))
    if (selStatuses.length) p.set('statuses', selStatuses.join(','))
    if (selPrograms.length) p.set('programIds', selPrograms.join(','))
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) p.set('dateTo', dateTo)
    return p.toString()
  }, [selAccountants, selChannels, selStatuses, selPrograms, dateFrom, dateTo])

  const fetchCampaigns = useCallback(() => {
    setLoading(true)
    const qs = buildQuery()
    fetch(`/api/campaigns${qs ? `?${qs}` : ''}`)
      .then(r => r.json())
      .then(d => {
        const all = d.campaigns || []
        setAllCampaigns(all.filter((c: any) => c.status !== 'SENT' || (c._count?.recipients ?? 0) > 0))
        if (d.accountants?.length) setAccountants(d.accountants)
        if (d.programs?.length) setPrograms(d.programs)
      })
      .finally(() => setLoading(false))
  }, [buildQuery])

  useEffect(() => {
    fetchCampaigns()
    fetch('/api/campaigns/analytics')
      .then(r => r.json())
      .then(setAnalytics)
      .catch(() => {})
  }, [fetchCampaigns])

  const campaigns = allCampaigns
  const sent = campaigns.filter(c => c.status === 'SENT')
  const drafts = campaigns.filter(c => c.status === 'DRAFT')
  const totalReach = sent.reduce((s, c) => s + (c._count?.recipients ?? 0), 0)
  const isAdmin = accountants.length > 0

  const activeFilterCount =
    selAccountants.length + selChannels.length + selStatuses.length + selPrograms.length +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

  function clearAllFilters() {
    setSelAccountants([])
    setSelChannels([])
    setSelStatuses([])
    setSelPrograms([])
    setDateFrom('')
    setDateTo('')
  }

  // Option shapes for ChipGroup
  const accountantOptions = accountants.map(a => ({ id: a.id, label: a.officeName }))
  const channelOptions = CHANNEL_OPTIONS.map(ch => ({ id: ch, label: channelLabel[ch] }))
  const statusOptions = STATUS_OPTIONS.map(st => ({ id: st, label: statusLabel[st] || st }))
  const programOptions = programs.map(p => ({ id: p.id, label: p.title }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ενημερώσεις προς Πελάτες</h1>
          <p className="text-gray-500 mt-1">{campaigns.length} καμπάνιες</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(v => !v)}>
            <Filter size={16} className="mr-2" />
            Φίλτρα
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-blue-800 text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Link href="/campaigns/new">
            <Button><Plus size={16} className="mr-2" />Νέα Καμπάνια</Button>
          </Link>
        </div>
      </div>

      {/* ── Quick-start wizard cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/campaigns/new?path=diy">
          <div className="group p-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 transition-all cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
                <Send size={20} className="text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">Θα το κάνω μόνος μου</h3>
                <p className="text-sm text-gray-500 mt-0.5">Βήμα-βήμα, απλά και γρήγορα. Δεν χρειάζεται τεχνική γνώση.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold">
                  Ξεκινήστε <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/campaigns/new?path=imentor">
          <div className="group p-5 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:border-purple-400 hover:bg-purple-100 transition-all cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-200 transition-colors">
                <Sparkles size={20} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">Να το κάνουμε παρέα με I-MENTOR</h3>
                <p className="text-sm text-gray-500 mt-0.5">Στέλνουμε εμείς για λογαριασμό σας, απλά μας πείτε σε ποιους.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm text-purple-600 font-semibold">
                  Ζητήστε βοήθεια <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Filter panel ───────────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Φίλτρα</h2>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X size={12} />Καθαρισμός όλων
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Accountant — admin only, searchable */}
            {isAdmin && (
              <ChipGroup
                label="Λογιστής"
                options={accountantOptions}
                selected={selAccountants}
                onChange={setSelAccountants}
                searchable
              />
            )}

            {/* Channel */}
            <ChipGroup
              label="Κανάλι"
              options={channelOptions}
              selected={selChannels}
              onChange={setSelChannels}
            />

            {/* Status */}
            <ChipGroup
              label="Κατάσταση"
              options={statusOptions}
              selected={selStatuses}
              onChange={setSelStatuses}
            />

            {/* Program — searchable, spans 2 cols when present */}
            {programs.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-2">
                <ChipGroup
                  label="Πρόγραμμα"
                  options={programOptions}
                  selected={selPrograms}
                  onChange={setSelPrograms}
                  searchable
                />
              </div>
            )}

            {/* Date range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Περίοδος δημιουργίας</label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-xs shrink-0">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 flex-shrink-0">
              <Send size={18} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{sent.length}</p>
              <p className="text-xs text-gray-400">Απεστάλησαν</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-50 flex-shrink-0">
              <Users size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalReach}</p>
              <p className="text-xs text-gray-400">Παραλήπτες (σύνολο)</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 flex-shrink-0">
              <FileText size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{drafts.length}</p>
              <p className="text-xs text-gray-400">Πρόχειρα</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 flex-shrink-0">
              <CheckCircle2 size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {sent.length > 0 ? Math.round(totalReach / sent.length) : '—'}
              </p>
              <p className="text-xs text-gray-400">Μέσος όρος/καμπάνια</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Analytics summary ─────────────────────────────────────────── */}
      {analytics && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Analytics Μηνυμάτων</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center"><Send size={15} className="text-white" /></div>
              <div><div className="text-lg font-bold text-gray-900">{analytics.total}</div><div className="text-xs text-gray-400">Σύνολο</div></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center"><Send size={15} className="text-white" /></div>
              <div><div className="text-lg font-bold text-gray-900">{analytics.sent}</div><div className="text-xs text-gray-400">Εστάλησαν</div></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center"><AlertTriangle size={15} className="text-white" /></div>
              <div><div className="text-lg font-bold text-gray-900">{analytics.failed}</div><div className="text-xs text-gray-400">Απέτυχαν</div></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center"><Eye size={15} className="text-white" /></div>
              <div><div className="text-lg font-bold text-gray-900">{analytics.opened}</div><div className="text-xs text-gray-400">Ανοίχτηκαν</div></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center"><MousePointerClick size={15} className="text-white" /></div>
              <div><div className="text-lg font-bold text-gray-900">{analytics.clicked}</div><div className="text-xs text-gray-400">Κλικ</div></div>
            </div>
          </div>
          {analytics.byChannel?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {analytics.byChannel.map((c: any) => (
                <div key={c.channel} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50">
                  {c.channel === 'EMAIL' ? <Mail size={14} className="text-blue-700" /> : <MessageCircle size={14} className="text-violet-700" />}
                  <span className="text-sm font-medium text-gray-700">{channelLabel[c.channel] || c.channel}</span>
                  <Badge variant="secondary">{c.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Τίτλος</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Κανάλι</Th>
                <Th>Πρόγραμμα</Th>
                <Th>Παραλήπτες</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 7 : 6} className="text-center text-gray-400 py-8">Δεν υπάρχουν καμπάνιες</Td>
                </TableRow>
              ) : (
                campaigns.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-blue-800 hover:underline">{c.title}</Link>
                    </Td>
                    {isAdmin && (
                      <Td className="text-sm text-gray-600">
                        {c.accountant?.officeName || <span className="text-gray-300">—</span>}
                      </Td>
                    )}
                    <Td>
                      <span className="flex items-center gap-1 text-sm">
                        {c.channel === 'EMAIL'
                          ? <Mail size={14} className="text-blue-500" />
                          : c.channel === 'VIBER'
                          ? <MessageCircle size={14} className="text-purple-500" />
                          : <><Mail size={14} className="text-blue-500" /><MessageCircle size={14} className="text-purple-500" /></>}
                        {channelLabel[c.channel] || c.channel}
                      </span>
                    </Td>
                    <Td className="text-sm text-gray-500">{c.program?.title || '-'}</Td>
                    <Td>
                      <span className="flex items-center gap-1">
                        <Users size={13} className="text-gray-400" />
                        {c._count?.recipients || 0}
                      </span>
                    </Td>
                    <Td><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500">{formatDateTime(c.sentAt || c.createdAt)}</Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
