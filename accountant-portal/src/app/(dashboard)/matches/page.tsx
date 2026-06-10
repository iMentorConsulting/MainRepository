'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { MultiSelect } from '@/components/ui/multi-select'
import { QuickSendModal } from '@/components/quick-send-modal'
import { Send, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'

type MatchStatus = 'POTENTIAL' | 'REVIEWED' | 'REJECTED' | 'INTERESTED' | 'SUBMITTED'

const statusOptions = [
  { value: '', label: 'Όλα' },
  { value: 'POTENTIAL', label: 'Πιθανό' },
  { value: 'REVIEWED', label: 'Ελέγχθηκε' },
  { value: 'REJECTED', label: 'Απορρίφθηκε' },
  { value: 'INTERESTED', label: 'Ενδιαφέρον' },
  { value: 'SUBMITTED', label: 'Υποβλήθηκε' },
]

const statusVariant: Record<string, any> = {
  POTENTIAL: 'default',
  REVIEWED: 'info',
  REJECTED: 'danger',
  INTERESTED: 'success',
  SUBMITTED: 'warning',
}

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

export default function MatchesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [matches, setMatches] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [programFilter, setProgramFilter] = useState<string[]>([])
  const [legalStatusFilter, setLegalStatusFilter] = useState<string[]>([])
  const [legalStatusOptions, setLegalStatusOptions] = useState<{ value: string; label: string }[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState('matchScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [accountantOptions, setAccountantOptions] = useState<{ value: string; label: string }[]>([])
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quickSendOpen, setQuickSendOpen] = useState(false)

  const fetchMatches = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sortBy, sortDir })
    if (statusFilter) params.set('status', statusFilter)
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    if (programFilter.length) params.set('programIds', programFilter.join(','))
    if (legalStatusFilter.length) params.set('legalStatuses', legalStatusFilter.join(','))
    if (search) params.set('search', search)
    const res = await fetch(`/api/matches?${params}`)
    const data = await res.json()
    setMatches(data.matches || [])
    setTotal(data.total || 0)
    if (data.accountants?.length) setAccountantOptions(data.accountants.map((a: any) => ({ value: a.id, label: a.officeName })))
    if (data.programs?.length) setProgramOptions(data.programs.map((p: any) => ({ value: p.id, label: p.title })))
    if (data.legalStatuses?.length) setLegalStatusOptions(data.legalStatuses.map((v: string) => ({ value: v, label: v })))
    setLoading(false)
  }, [page, statusFilter, accountantFilter, programFilter, legalStatusFilter, search, sortBy, sortDir])

  useEffect(() => { fetchMatches() }, [fetchMatches])
  useEffect(() => { setPage(1) }, [statusFilter, accountantFilter, programFilter, legalStatusFilter, search, sortBy, sortDir])
  useEffect(() => { setSelected(new Set()) }, [page, statusFilter, accountantFilter, programFilter, legalStatusFilter, search])

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

  const selectedMatches = matches.filter(m => selected.has(m.id))
  const selectedBusinesses = selectedMatches.map(m => ({
    id: m.business?.id,
    onomasia: m.business?.onomasia,
    afm: m.business?.afm,
  })).filter(b => b.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
          <p className="text-gray-500 mt-1">{total} matches συνολικά</p>
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Επιχείρηση</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Επωνυμία ή ΑΦΜ..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  onBlur={handleSearch}
                  className="pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Κατάσταση</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {isAdmin && accountantOptions.length > 0 && (
              <MultiSelect
                label="Λογιστής"
                options={accountantOptions}
                selected={accountantFilter}
                onChange={setAccountantFilter}
                placeholder="Όλοι οι λογιστές"
              />
            )}
            {programOptions.length > 0 && (
              <MultiSelect
                label="Πρόγραμμα"
                options={programOptions}
                selected={programFilter}
                onChange={setProgramFilter}
                placeholder="Όλα τα προγράμματα"
              />
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
            {(accountantFilter.length > 0 || programFilter.length > 0 || legalStatusFilter.length > 0 || search) && (
              <button
                onClick={() => { setAccountantFilter([]); setProgramFilter([]); setLegalStatusFilter([]); setSearch(''); setSearchInput('') }}
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
                  <Th>
                    <button onClick={() => toggleSort('business.onomasia')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Επιχείρηση <SortIcon col="business.onomasia" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>
                    <button onClick={() => toggleSort('business.afm')} className="flex items-center hover:text-indigo-700 transition-colors">
                      ΑΦΜ <SortIcon col="business.afm" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>
                    <button onClick={() => toggleSort('program.title')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Επιλέξιμο Πρόγραμμα <SortIcon col="program.title" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  {isAdmin && (
                    <Th>
                      <button onClick={() => toggleSort('business.accountant.officeName')} className="flex items-center hover:text-indigo-700 transition-colors">
                        Λογιστής <SortIcon col="business.accountant.officeName" sortBy={sortBy} sortDir={sortDir} />
                      </button>
                    </Th>
                  )}
                  <Th>Σημειώσεις</Th>
                  <Th>Καμπάνια</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.length === 0 ? (
                  <TableRow>
                    <Td colSpan={isAdmin ? 8 : 7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν matches</Td>
                  </TableRow>
                ) : (
                  matches.map(m => {
                    const lastCampaign = m.business?.campaignRecipients?.[0]
                    return (
                      <TableRow key={m.id} className={selected.has(m.id) ? 'bg-indigo-50' : undefined}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                            className="rounded"
                          />
                        </Td>
                        <Td>
                          <Link href={`/businesses/${m.businessId}`} className="text-blue-800 hover:underline font-medium">
                            {m.business?.onomasia || '-'}
                          </Link>
                        </Td>
                        <Td className="font-mono text-xs">{m.business?.afm}</Td>
                        <Td>
                          <Link href={`/programs/${m.programId}`} className="text-blue-600 hover:underline text-sm">
                            {m.program?.title}
                          </Link>
                        </Td>
                        {isAdmin && (
                          <Td className="text-xs text-gray-500">
                            {m.business?.accountant?.officeName || '-'}
                          </Td>
                        )}
                        <Td>
                          <NotesCell matchId={m.id} initialNotes={m.notes} />
                        </Td>
                        <Td>
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
