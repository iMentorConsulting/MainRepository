'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { MultiSelect } from '@/components/ui/multi-select'
import { QuickSendModal } from '@/components/quick-send-modal'
import { Send, ChevronUp, ChevronDown, ChevronsUpDown, Search, Check, X as XIcon, Ban, Eye, EyeOff, ClipboardList, CheckCircle2 } from 'lucide-react'
import { NewCaseModal } from '@/components/cases/new-case-modal'
import { getEffectiveCategory } from '@/lib/business-categories'
import { CategoryBadge } from '@/components/businesses/category-badge'
import { MatchesHero } from '@/components/dashboard/matches-hero'

const campaignSentOptions = [
  { value: '', label: 'Όλα' },
  { value: 'yes', label: 'Έχει σταλεί ενημέρωση' },
  { value: 'no', label: 'Δεν έχει σταλεί ενημέρωση' },
]

const PAGE_SIZE = 25

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: string }) {
  if (sortBy !== col) return <ChevronsUpDown size={13} className="text-gray-400 ml-1 inline" />
  return sortDir === 'asc'
    ? <ChevronUp size={13} className="text-indigo-600 ml-1 inline" />
    : <ChevronDown size={13} className="text-indigo-600 ml-1 inline" />
}

function NotesCell({ matchId, initialNotes }: { matchId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setNotes(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value }),
      })
      setSaving(false)
    }, 800)
  }

  return (
    <div className="relative">
      <textarea
        value={notes}
        onChange={e => handleChange(e.target.value)}
        rows={2}
        placeholder="Σημειώσεις..."
        className="w-full min-w-[140px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-amber-50 placeholder-gray-400"
      />
      {saving && <span className="absolute bottom-1 right-1 text-[10px] text-gray-400">✓</span>}
    </div>
  )
}

function CriteriaCell({ match, criteriaMap, onChanged }: { match: any; criteriaMap: Record<string, string>; onChanged: () => void }) {
  const extraIds: string[] = match.program?.extraCriteriaIds || []
  const [checks, setChecks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of match.criterionChecks || []) init[c.criterionId] = c.value
    return init
  })

  if (extraIds.length === 0) return <span className="text-xs text-gray-400">—</span>

  async function setValue(criterionId: string, value: 'PASS' | 'FAIL') {
    const current = checks[criterionId]
    const next = current === value ? undefined : value
    setChecks(prev => {
      const updated = { ...prev }
      if (next) updated[criterionId] = next
      else delete updated[criterionId]
      return updated
    })
    await fetch(`/api/matches/${match.id}/criteria`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criterionId, value: next ?? null }),
    })
  }

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      {extraIds.map(id => {
        const label = criteriaMap[id] || id
        const value = checks[id]
        return (
          <div
            key={id}
            className={`flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 border transition-colors ${
              value === 'PASS' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              value === 'FAIL' ? 'bg-red-50 border-red-200 text-red-700' :
              'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            <button
              type="button"
              onClick={() => setValue(id, 'PASS')}
              title="ΟΚ"
              className={`flex-shrink-0 rounded p-0.5 ${value === 'PASS' ? 'bg-emerald-200' : 'hover:bg-emerald-100'}`}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setValue(id, 'FAIL')}
              title="ΟΧΙ"
              className={`flex-shrink-0 rounded p-0.5 ${value === 'FAIL' ? 'bg-red-200' : 'hover:bg-red-100'}`}
            >
              <XIcon size={12} />
            </button>
            <span className="truncate">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function RejectionCell({ match, reasonOptions, onChanged }: { match: any; reasonOptions: { id: string; label: string; programIds?: string[] }[]; onChanged: () => void }) {
  const [saving, setSaving] = useState(false)

  async function setReason(reasonId: string) {
    setSaving(true)
    await fetch(`/api/matches/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionReasonId: reasonId || null, status: reasonId ? 'REJECTED' : 'POTENTIAL' }),
    })
    setSaving(false)
    onChanged()
  }

  if (match.rejectionReasonId) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Badge variant="danger" className="whitespace-nowrap">
          <Ban size={11} />
          {match.rejectionReason?.label || 'Μη Επιλέξιμο'}
        </Badge>
        <button
          type="button"
          onClick={() => setReason('')}
          disabled={saving}
          title="Αναίρεση"
          className="text-gray-400 hover:text-gray-600"
        >
          <XIcon size={12} />
        </button>
      </div>
    )
  }

  const applicable = reasonOptions.filter(r => !r.programIds?.length || r.programIds.includes(match.programId))

  return (
    <select
      defaultValue=""
      disabled={saving}
      onChange={e => { if (e.target.value) setReason(e.target.value) }}
      className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white text-gray-500 w-full max-w-[140px]"
    >
      <option value="">Μη Επιλέξιμος...</option>
      {applicable.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
  )
}

export default function MatchesPage() {
  return (
    <Suspense fallback={null}>
      <MatchesPageInner />
    </Suspense>
  )
}

function MatchesPageInner() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [matches, setMatches] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [campaignSentFilter, setCampaignSentFilter] = useState('')
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [programFilter, setProgramFilter] = useState<string[]>(() => {
    const initial = searchParams.get('programIds')
    return initial ? initial.split(',').filter(Boolean) : []
  })
  const [legalStatusFilter, setLegalStatusFilter] = useState<string[]>([])
  const [legalStatusOptions, setLegalStatusOptions] = useState<{ value: string; label: string }[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([])
  const [perifereiaFilter, setPerifereiaFilter] = useState<string[]>([])
  const [perifereiaOptions, setPerifereiaOptions] = useState<{ value: string; label: string }[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState('matchScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [accountantOptions, setAccountantOptions] = useState<{ value: string; label: string }[]>([])
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quickSendOpen, setQuickSendOpen] = useState(false)
  const [caseFor, setCaseFor] = useState<{ businessId: string; programId: string } | null>(null)
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})
  const [reasonOptions, setReasonOptions] = useState<{ id: string; label: string; programIds?: string[] }[]>([])
  const [hideUnsuitable, setHideUnsuitable] = useState(true)
  const [websiteFormOnly, setWebsiteFormOnly] = useState(false)
  const [unsuitableCount, setUnsuitableCount] = useState(0)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [excludeTagFilter, setExcludeTagFilter] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
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
    fetch('/api/admin/rejection-reasons')
      .then(r => r.json())
      .then(data => setReasonOptions(Array.isArray(data) ? data.filter((r: any) => r.active) : []))
      .catch(() => {})
  }, [])

  const fetchMatches = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sortBy, sortDir })
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    if (programFilter.length) params.set('programIds', programFilter.join(','))
    if (legalStatusFilter.length) params.set('legalStatuses', legalStatusFilter.join(','))
    if (categoryFilter.length) params.set('categories', categoryFilter.join(','))
    if (perifereiaFilter.length) params.set('perifereies', perifereiaFilter.join(','))
    if (tagFilter.length) params.set('tags', tagFilter.join(','))
    if (excludeTagFilter.length) params.set('excludeTags', excludeTagFilter.join(','))
    if (campaignSentFilter) params.set('campaignSent', campaignSentFilter)
    if (search) params.set('search', search)
    if (hideUnsuitable) params.set('hideUnsuitable', 'true')
    if (websiteFormOnly) params.set('websiteFormOnly', '1')
    const res = await fetch(`/api/matches?${params}`)
    const data = await res.json()
    setMatches(data.matches || [])
    setTotal(data.total || 0)
    setUnsuitableCount(data.unsuitableCount || 0)
    if (data.tags?.length) setTagOptions(data.tags.map((v: string) => ({ value: v, label: v })))
    if (data.accountants?.length) setAccountantOptions(data.accountants.map((a: any) => ({ value: a.id, label: a.officeName })))
    setProgramOptions((data.programs || []).map((p: any) => ({ value: p.id, label: `(${p.count}) ${p.title}` })))
    if (data.legalStatuses?.length) setLegalStatusOptions(data.legalStatuses.map((v: string) => ({ value: v, label: v })))
    if (data.categories?.length) setCategoryOptions(data.categories.map((v: string) => ({ value: v, label: v })))
    if (data.perifereies?.length) setPerifereiaOptions([...data.perifereies, 'Άγνωστη'].map((v: string) => ({ value: v, label: v })))
    setLoading(false)
  }, [page, accountantFilter, programFilter, legalStatusFilter, categoryFilter, perifereiaFilter, tagFilter, excludeTagFilter, campaignSentFilter, search, sortBy, sortDir, hideUnsuitable, websiteFormOnly])

  useEffect(() => { fetchMatches() }, [fetchMatches])
  useEffect(() => { setPage(1) }, [accountantFilter, programFilter, legalStatusFilter, categoryFilter, perifereiaFilter, tagFilter, excludeTagFilter, campaignSentFilter, search, sortBy, sortDir, hideUnsuitable, websiteFormOnly])
  useEffect(() => { setSelected(new Set()) }, [page, accountantFilter, programFilter, legalStatusFilter, categoryFilter, perifereiaFilter, tagFilter, excludeTagFilter, campaignSentFilter, search])

  useEffect(() => {
    const fromUrl = searchParams.get('programIds')
    setProgramFilter(fromUrl ? fromUrl.split(',').filter(Boolean) : [])
  }, [searchParams])

  function handleSearch() {
    setSearch(searchInput)
  }

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === matches.length ? new Set() : new Set(matches.map(m => m.id)))
  }

  const isUnsuitable = (m: any) => !!m.rejectionReasonId || (m.criterionChecks || []).some((c: any) => c.value === 'FAIL')
  const visibleMatches = matches

  const selectedMatches = matches.filter(m => selected.has(m.id))
  const selectedBusinesses = selectedMatches.map(m => ({
    id: m.business?.id,
    onomasia: m.business?.onomasia,
    afm: m.business?.afm,
    accountantId: m.business?.accountantId,
  })).filter(b => b.id)

  return (
    <div className="space-y-6">
      <MatchesHero accountantId={accountantFilter.length === 1 ? accountantFilter[0] : undefined} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
          <p className="text-gray-500 mt-1">{total} matches συνολικά</p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
            onClick={() => setQuickSendOpen(true)}
          >
            <Send size={15} />
            Γρήγορη Αποστολή ({selected.size})
          </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Φίλτρα</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1">
              {loading ? '...' : total} {total === 1 ? 'match' : 'matches'} με τα τρέχοντα φίλτρα
            </span>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Επιχείρηση</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Επωνυμία, ΑΦΜ, τηλ., email, ΚΑΔ..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  onBlur={handleSearch}
                  className="pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ενημέρωση</label>
              <select
                value={campaignSentFilter}
                onChange={e => setCampaignSentFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                {campaignSentOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {isAdmin && accountantOptions.length > 0 && (
              <MultiSelect
                label="Λογιστής"
                options={[{ value: '__none__', label: 'Χωρίς Λογιστή (I-MENTOR)' }, ...accountantOptions]}
                selected={accountantFilter}
                onChange={setAccountantFilter}
                placeholder="Όλοι οι λογιστές"
              />
            )}
            {programOptions.length > 0 && (
              <div className="min-w-[340px]">
                <MultiSelect
                  label="Πρόγραμμα (με βάση τα άλλα φίλτρα)"
                  options={programOptions}
                  selected={programFilter}
                  onChange={setProgramFilter}
                  placeholder="Όλα τα προγράμματα"
                />
              </div>
            )}
            {legalStatusOptions.length > 0 && (
              <MultiSelect
                label="Νομική Μορφή"
                options={legalStatusOptions}
                selected={legalStatusFilter}
                onChange={setLegalStatusFilter}
                placeholder="Όλες οι μορφές"
              />
            )}
            {categoryOptions.length > 0 && (
              <MultiSelect
                label="Κλάδος"
                options={categoryOptions}
                selected={categoryFilter}
                onChange={setCategoryFilter}
                placeholder="Όλοι οι κλάδοι"
              />
            )}
            {perifereiaOptions.length > 0 && (
              <MultiSelect
                label="Περιφέρεια"
                options={perifereiaOptions}
                selected={perifereiaFilter}
                onChange={setPerifereiaFilter}
                placeholder="Όλες οι περιφέρειες"
              />
            )}
            {tagOptions.length > 0 && (
              <MultiSelect
                label="Tags"
                options={tagOptions}
                selected={tagFilter}
                onChange={setTagFilter}
                placeholder="Όλα τα tags"
              />
            )}
            {tagOptions.length > 0 && (
              <MultiSelect
                label="Εξαίρεση Tags"
                options={tagOptions}
                selected={excludeTagFilter}
                onChange={setExcludeTagFilter}
                placeholder="Χωρίς εξαίρεση"
              />
            )}
            {unsuitableCount > 0 && (
              <button
                onClick={() => setHideUnsuitable(h => !h)}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 mt-4 border transition-colors ${
                  hideUnsuitable
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                }`}
              >
                {hideUnsuitable ? <EyeOff size={14} /> : <Eye size={14} />}
                {hideUnsuitable ? `${unsuitableCount} εγγραφές κρυμμένες (μη επιλέξιμες) — κλικ για εμφάνιση` : `Απόκρυψη ${unsuitableCount} μη επιλέξιμων`}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setWebsiteFormOnly(v => !v)}
                title="Εμφάνιση μόνο επιχειρήσεων που εγγράφηκαν μόνες τους μέσω της φόρμας του website"
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 mt-4 border transition-colors ${
                  websiteFormOnly
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                }`}
              >
                {websiteFormOnly ? 'Προβολή Όλων' : 'Εγγραφή μέσω Website'}
              </button>
            )}
            {(accountantFilter.length > 0 || programFilter.length > 0 || legalStatusFilter.length > 0 || categoryFilter.length > 0 || perifereiaFilter.length > 0 || tagFilter.length > 0 || excludeTagFilter.length > 0 || campaignSentFilter || search || websiteFormOnly) && (
              <button
                onClick={() => { setAccountantFilter([]); setProgramFilter([]); setLegalStatusFilter([]); setCategoryFilter([]); setPerifereiaFilter([]); setTagFilter([]); setExcludeTagFilter([]); setCampaignSentFilter(''); setSearch(''); setSearchInput(''); setWebsiteFormOnly(false) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline mt-4"
              >
                Καθαρισμός φίλτρων
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={matches.length > 0 && selected.size === matches.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </Th>
                  <Th className="max-w-[300px]">
                    <button onClick={() => toggleSort('business.onomasia')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Επιχείρηση <SortIcon col="business.onomasia" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th className="w-10">Κλάδος</Th>
                  <Th>
                    <button onClick={() => toggleSort('program.title')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Επιλέξιμο Πρόγραμμα <SortIcon col="program.title" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  {isAdmin && (
                    <Th className="max-w-[110px]">
                      <button onClick={() => toggleSort('business.accountant.officeName')} className="flex items-center hover:text-indigo-700 transition-colors">
                        Λογιστής <SortIcon col="business.accountant.officeName" sortBy={sortBy} sortDir={sortDir} />
                      </button>
                    </Th>
                  )}
                  <Th>Πρόσθετες Προϋποθέσεις</Th>
                  <Th className="min-w-[200px]">Σημειώσεις</Th>
                  <Th className="max-w-[140px] text-xs">Καταλληλότητα</Th>
                  <Th className="max-w-[90px] text-xs">Email/Viber</Th>
                  <Th>Ανάθεση</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleMatches.length === 0 ? (
                  <TableRow>
                    <Td colSpan={isAdmin ? 11 : 10} className="text-center text-gray-400 py-8">Δεν βρέθηκαν matches</Td>
                  </TableRow>
                ) : (
                  visibleMatches.map(m => {
                    const lastCampaign = m.business?.campaignRecipients?.find((c: any) => c.campaign?.programId === m.programId)
                    const unsuitable = isUnsuitable(m)
                    return (
                      <TableRow key={m.id} className={unsuitable ? 'bg-red-50/60 opacity-60' : selected.has(m.id) ? 'bg-indigo-50' : undefined}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                            className="rounded"
                          />
                        </Td>
                        <Td className="max-w-[300px]">
                          <span className="flex items-center gap-1.5">
                            <Link href={`/businesses/${m.businessId}`} className={`text-blue-800 hover:underline font-medium truncate block ${unsuitable ? 'line-through' : ''}`}>
                              {m.business?.onomasia || '-'}
                            </Link>
                            {!m.business?.accountantId && (
                              <Badge variant="purple" className="text-[10px] shrink-0">I-MENTOR</Badge>
                            )}
                          </span>
                        </Td>
                        <Td>
                          <CategoryBadge category={getEffectiveCategory(m.business || {})} />
                        </Td>
                        <Td>
                          <Link href={`/programs/${m.programId}`} className="text-blue-600 hover:underline text-sm">
                            {m.program?.title}
                          </Link>
                        </Td>
                        {isAdmin && (
                          <Td className="text-xs text-gray-500 max-w-[110px] leading-tight break-words">
                            {m.business?.accountant?.officeName || '-'}
                          </Td>
                        )}
                        <Td>
                          <CriteriaCell match={m} criteriaMap={criteriaMap} onChanged={fetchMatches} />
                        </Td>
                        <Td>
                          <NotesCell matchId={m.id} initialNotes={m.notes} />
                        </Td>
                        <Td className="max-w-[140px]">
                          <RejectionCell match={m} reasonOptions={reasonOptions} onChanged={fetchMatches} />
                        </Td>
                        <Td className="max-w-[90px] text-xs truncate">
                          {lastCampaign ? (
                            <div className="text-xs space-y-0.5">
                              <div className="text-green-700 font-medium">✓ Εστάλη</div>
                              <div className="text-gray-400">
                                {new Date(lastCampaign.sentAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </div>
                              {lastCampaign.campaign?.title && (
                                <div className="text-gray-500 truncate max-w-[90px]" title={lastCampaign.campaign.title}>
                                  {lastCampaign.campaign.title}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <button
                            onClick={() => setCaseFor({ businessId: m.businessId, programId: m.programId })}
                            className="relative p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title={m.business?.hasCase ? 'Ανάθεση στην I-MENTOR (υπάρχει ήδη υπόθεση)' : 'Ανάθεση στην I-MENTOR'}
                          >
                            <ClipboardList size={16} />
                            {m.business?.hasCase && (
                              <CheckCircle2 size={11} className="absolute -bottom-0.5 -right-0.5 text-green-600 bg-white rounded-full" />
                            )}
                          </button>
                        </Td>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
          </>
        )}
      </div>

      {caseFor && (
        <NewCaseModal
          open
          onClose={() => setCaseFor(null)}
          onCreated={() => setCaseFor(null)}
          initialBusinessId={caseFor.businessId}
          initialProgramId={caseFor.programId}
        />
      )}

      {quickSendOpen && selectedBusinesses.length > 0 && (
        <QuickSendModal
          businesses={selectedBusinesses}
          onClose={() => setQuickSendOpen(false)}
          onSent={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}
