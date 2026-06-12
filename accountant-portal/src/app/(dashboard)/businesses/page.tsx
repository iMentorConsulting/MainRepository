'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { MultiSelect } from '@/components/ui/multi-select'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { getEffectiveCategory, ALL_CATEGORIES } from '@/lib/business-categories'
import { CategoryBadge } from '@/components/businesses/category-badge'
import { resolveRegionFromZip, GREEK_REGIONS } from '@/lib/greek-regions'
import { Plus, Search, Download, Filter, Trash2, UserCog, Send, Smartphone, Upload, X, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from 'lucide-react'

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: string }) {
  if (sortBy !== col) return <ChevronsUpDown size={13} className="text-gray-400 ml-1 inline" />
  return sortDir === 'asc'
    ? <ChevronUp size={13} className="text-indigo-600 ml-1 inline" />
    : <ChevronDown size={13} className="text-indigo-600 ml-1 inline" />
}
import { QuickSendModal } from '@/components/quick-send-modal'

interface Accountant {
  id: string
  officeName: string
}

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Νεότερες πρώτα' },
  { value: 'createdAt:asc', label: 'Παλαιότερες πρώτα' },
  { value: 'onomasia:asc', label: 'Επωνυμία (Α-Ω)' },
  { value: 'onomasia:desc', label: 'Επωνυμία (Ω-Α)' },
  { value: 'afm:asc', label: 'ΑΦΜ (αύξουσα)' },
  { value: 'afm:desc', label: 'ΑΦΜ (φθίνουσα)' },
  { value: 'postalAreaDescription:asc', label: 'Περιοχή (Α-Ω)' },
  { value: 'postalZipCode:asc', label: 'ΤΚ (αύξουσα)' },
]

interface Business {
  id: string
  afm: string
  onomasia: string | null
  postalAreaDescription: string | null
  postalZipCode: string | null
  legalStatusDescr: string | null
  accountant: { officeName: string } | null
  activities: { firmActCode: string; firmActDescr: string | null; firmActKind: number | null }[]
  tags?: string[]
  _count?: { programMatches: number }
}

const PAGE_SIZE = 20

export default function BusinessesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [refreshingStatus, setRefreshingStatus] = useState(false)

  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [legalStatusOptions, setLegalStatusOptions] = useState<string[]>([])
  const [regionOptions, setRegionOptions] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [legalStatusFilter, setLegalStatusFilter] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [perifereiaFilter, setPerifereiaFilter] = useState<string[]>([])
  const [sort, setSort] = useState('createdAt:desc')
  const [sortBy, sortDir] = sort.split(':')
  function toggleSort(col: string) {
    setSort(prev => {
      const [prevCol, prevDir] = prev.split(':')
      if (prevCol === col) return `${col}:${prevDir === 'asc' ? 'desc' : 'asc'}`
      return `${col}:asc`
    })
  }
  const [includeIndividuals, setIncludeIndividuals] = useState(false)
  const [inactiveOnly, setInactiveOnly] = useState(false)

  const [quickSendOpen, setQuickSendOpen] = useState(false)
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignAccountantId, setAssignAccountantId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [sortBy, sortDir] = sort.split(':')
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(accountantFilter.length ? { accountantIds: accountantFilter.join(',') } : {}),
      ...(legalStatusFilter.length ? { legalStatuses: legalStatusFilter.join(',') } : (includeIndividuals ? { excludeIndividualLike: '0' } : {})),
      ...(regionFilter.length ? { regions: regionFilter.join(',') } : {}),
      ...(categoryFilter.length ? { categories: categoryFilter.join(',') } : {}),
      ...(perifereiaFilter.length ? { perifereies: perifereiaFilter.join(',') } : {}),
      ...(inactiveOnly ? { inactiveOnly: '1' } : {}),
    })
    const res = await fetch(`/api/businesses?${params}`)
    const data = await res.json()
    setBusinesses(data.businesses || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, search, accountantFilter, legalStatusFilter, regionFilter, categoryFilter, perifereiaFilter, sort, includeIndividuals, inactiveOnly])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setSelected(new Set()) }, [page, search, accountantFilter, legalStatusFilter, regionFilter, categoryFilter, perifereiaFilter, sort, includeIndividuals, inactiveOnly])
  useEffect(() => { setPage(1) }, [accountantFilter, legalStatusFilter, regionFilter, categoryFilter, perifereiaFilter, sort, includeIndividuals, inactiveOnly])

  useEffect(() => {
    fetch('/api/businesses/facets')
      .then(r => r.json())
      .then(data => {
        setAccountants(data.accountants || [])
        setLegalStatusOptions(data.legalStatuses || [])
        setRegionOptions(data.regions || [])
      })
  }, [])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
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
    setSelected(prev => prev.size === businesses.length ? new Set() : new Set(businesses.map(b => b.id)))
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Διαγραφή ${selected.size} επιχειρήσεων; Η ενέργεια δεν αναιρείται.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/businesses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Διαγράφηκαν ${data.deleted} επιχειρήσεις`)
        setSelected(new Set())
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || 'Σφάλμα διαγραφής')
      }
    } finally {
      setDeleting(false)
    }
  }

  async function handleRefreshStatus() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Επανέλεγχος κατάστασης ${ids.length} επιχειρήσεων στην ΑΑΔΕ;`)) return
    setRefreshingStatus(true)
    try {
      const res = await fetch('/api/businesses/refresh-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Ελέγχθηκαν ${data.total}, ενημερώθηκαν ${data.updated}, ανενεργές: ${data.nowInactive}, απέτυχαν: ${data.failed}`)
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || 'Σφάλμα επανελέγχου')
      }
    } finally {
      setRefreshingStatus(false)
    }
  }

  async function handleBulkAssign() {
    if (selected.size === 0) return
    setAssigning(true)
    try {
      const res = await fetch('/api/businesses/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), accountantId: assignAccountantId || null }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Ανατέθηκαν ${data.updated} επιχειρήσεις${assignAccountantId ? '' : ' (αφαιρέθηκε ο λογιστής)'}`)
        setSelected(new Set())
        setAssignOpen(false)
        setAssignAccountantId('')
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || 'Σφάλμα ανάθεσης')
      }
    } finally {
      setAssigning(false)
    }
  }

  async function handleExport() {
    const res = await fetch('/api/businesses/export')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'businesses.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Επιχειρήσεις</h1>
          <p className="text-gray-500 mt-1">{total} επιχειρήσεις συνολικά</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} size="sm">
            <Download size={16} className="mr-1" />
            Export Excel
          </Button>
          <Link href="/businesses/new">
            <Button size={isAdmin ? 'sm' : 'md'} className={!isAdmin ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 text-base shadow-lg' : ''}>
              <Plus size={isAdmin ? 16 : 20} className="mr-2" />
              {isAdmin ? 'Νέα Επιχείρηση' : '+ Προσθήκη Επιχείρησης'}
            </Button>
          </Link>
        </div>
      </div>

      {!isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href="/businesses/new" className="group flex items-center gap-3 p-4 bg-indigo-50 border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100 rounded-xl transition-all cursor-pointer">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Search size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-indigo-900">Προσθήκη μέσω ΑΦΜ</div>
              <div className="text-xs text-indigo-600">Αναζήτηση από ΑΑΔΕ</div>
            </div>
          </a>
          <a href="/businesses/new?mode=excel" className="group flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100 rounded-xl transition-all cursor-pointer">
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Upload size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900">Μαζική Εισαγωγή Excel</div>
              <div className="text-xs text-emerald-600">Όλοι οι πελάτες ταυτόχρονα</div>
            </div>
          </a>
          <button onClick={() => setEnrichOpen(true)} className="group flex items-center gap-3 p-4 bg-violet-50 border-2 border-violet-200 hover:border-violet-400 hover:bg-violet-100 rounded-xl transition-all cursor-pointer text-left w-full">
            <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Smartphone size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-violet-900">Εμπλουτισμός Viber/Email</div>
              <div className="text-xs text-violet-600">Προσθήκη στοιχείων επικοινωνίας</div>
            </div>
          </button>
        </div>
      )}

      {!isAdmin && total === 0 && !loading && (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-8 text-white text-center shadow-xl">
          <div className="text-5xl mb-4">🏢</div>
          <h2 className="text-2xl font-bold mb-2">Δεν έχετε προσθέσει επιχειρήσεις ακόμη!</h2>
          <p className="text-indigo-100 text-base mb-6 max-w-lg mx-auto">
            Κάθε πελάτης που λείπει = χαμένη ευκαιρία χρηματοδότησης και χαμένη προμήθεια για εσάς.
            Προσθέστε τους πελάτες σας τώρα — είναι εύκολο!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/businesses/new">
              <button className="bg-white text-indigo-700 font-bold px-8 py-3 rounded-xl text-base hover:bg-indigo-50 transition-colors w-full sm:w-auto">
                🔍 Αναζήτηση μέσω ΑΦΜ (1 πελάτης)
              </button>
            </Link>
            <Link href="/businesses/new?mode=excel">
              <button className="bg-indigo-500 border-2 border-white/40 text-white font-bold px-8 py-3 rounded-xl text-base hover:bg-indigo-400 transition-colors w-full sm:w-auto">
                📊 Μαζική Εισαγωγή από Excel
              </button>
            </Link>
          </div>
          <p className="text-indigo-200 text-sm mt-4">
            Εξαγάγετε τη λίστα πελατών από το λογιστικό σας πρόγραμμα → Excel → Εισαγωγή εδώ
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Αναζήτηση ΑΦΜ, επωνυμία..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch}>
              <Filter size={14} className="mr-1" />
              Αναζήτηση
            </Button>
            {selected.size > 0 && (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setQuickSendOpen(true)}
              >
                <Send size={14} className="mr-1" />
                Γρήγορη Αποστολή ({selected.size})
              </Button>
            )}
            {isAdmin && selected.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <UserCog size={14} className="mr-1" />
                Ανάθεση σε Λογιστή ({selected.size})
              </Button>
            )}
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} loading={deleting}>
                <Trash2 size={14} className="mr-1" />
                Διαγραφή ({selected.size})
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            {isAdmin && (
              <MultiSelect
                label="Λογιστής"
                options={[{ value: '__none__', label: 'Χωρίς Λογιστή' }, ...accountants.map(a => ({ value: a.id, label: a.officeName }))]}
                selected={accountantFilter}
                onChange={setAccountantFilter}
                placeholder="Όλοι οι λογιστές"
              />
            )}
            <MultiSelect
              label="Νομική Μορφή"
              options={legalStatusOptions.map(v => ({ value: v, label: v }))}
              selected={legalStatusFilter}
              onChange={setLegalStatusFilter}
              placeholder="Όλες οι μορφές"
            />
            <MultiSelect
              label="Περιοχή"
              options={regionOptions.map(v => ({ value: v, label: v }))}
              selected={regionFilter}
              onChange={setRegionFilter}
              placeholder="Όλες οι περιοχές"
            />
            <MultiSelect
              label="Κλάδος"
              options={ALL_CATEGORIES.map(v => ({ value: v, label: v }))}
              selected={categoryFilter}
              onChange={setCategoryFilter}
              placeholder="Όλοι οι κλάδοι"
            />
            <MultiSelect
              label="Περιφέρεια"
              options={[...GREEK_REGIONS, 'Άγνωστη'].map(v => ({ value: v, label: v }))}
              selected={perifereiaFilter}
              onChange={setPerifereiaFilter}
              placeholder="Όλες οι περιφέρειες"
            />
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ταξινόμηση</label>
              <Select value={sort} onChange={e => setSort(e.target.value)} options={SORT_OPTIONS} className="min-w-[180px]" />
            </div>
            {legalStatusFilter.length === 0 && (
              <Button
                variant={includeIndividuals ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => setIncludeIndividuals(v => !v)}
                title="Από προεπιλογή κρύβονται οι ιδιώτες, οι αγρότες ειδικού καθεστώτος και οι εγγραφές χωρίς ΚΑΔ"
              >
                {includeIndividuals ? 'Απόκρυψη Ιδιωτών & Αγροτών Ειδ.Καθεστ.' : 'Εμφάνιση Ιδιωτών & Αγροτών Ειδ.Καθεστ.'}
              </Button>
            )}
            <Button
              variant={inactiveOnly ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setInactiveOnly(v => !v)}
              title="Εμφάνιση μόνο επιχειρήσεων που έχουν κάνει Παύση Εργασιών στην ΑΑΔΕ"
            >
              {inactiveOnly ? 'Προβολή Όλων' : 'Μόνο Ανενεργές'}
            </Button>
            {isAdmin && selected.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                loading={refreshingStatus}
                onClick={handleRefreshStatus}
                title="Επανέλεγχος κατάστασης επιλεγμένων στην ΑΑΔΕ"
              >
                <RefreshCw size={14} className="mr-1" />
                {`Επανέλεγχος Κατάστασης (${selected.size})`}
              </Button>
            )}
            {(accountantFilter.length > 0 || legalStatusFilter.length > 0 || regionFilter.length > 0 || categoryFilter.length > 0 || perifereiaFilter.length > 0 || inactiveOnly) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAccountantFilter([]); setLegalStatusFilter([]); setRegionFilter([]); setCategoryFilter([]); setPerifereiaFilter([]); setInactiveOnly(false) }}
              >
                Καθαρισμός φίλτρων
              </Button>
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
                      checked={businesses.length > 0 && selected.size === businesses.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </Th>
                  <Th>
                    <button onClick={() => toggleSort('afm')} className="flex items-center hover:text-indigo-700 transition-colors">
                      ΑΦΜ <SortIcon col="afm" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>
                    <button onClick={() => toggleSort('onomasia')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Επωνυμία <SortIcon col="onomasia" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>Κλάδος</Th>
                  <Th>ΚΑΔ Περιγραφή</Th>
                  <Th>
                    <button onClick={() => toggleSort('postalAreaDescription')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Περιοχή <SortIcon col="postalAreaDescription" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>Περιφέρεια</Th>
                  <Th>
                    <button onClick={() => toggleSort('accountant.officeName')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Λογιστής <SortIcon col="accountant.officeName" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>
                    <button onClick={() => toggleSort('legalStatusDescr')} className="flex items-center hover:text-indigo-700 transition-colors">
                      Μορφή <SortIcon col="legalStatusDescr" sortBy={sortBy} sortDir={sortDir} />
                    </button>
                  </Th>
                  <Th>Matches</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <Td colSpan={10} className="text-center text-gray-400 py-8">
                      Δεν βρέθηκαν επιχειρήσεις
                    </Td>
                  </TableRow>
                ) : (
                  businesses.map(b => {
                    const primaryKad = b.activities?.find(a => a.firmActKind === 1)
                    return (
                      <TableRow key={b.id}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(b.id)}
                            onChange={() => toggleSelect(b.id)}
                            className="rounded"
                          />
                        </Td>
                        <Td>
                          <Link href={`/businesses/${b.id}`} className="font-mono text-blue-800 hover:underline">
                            {b.afm}
                          </Link>
                        </Td>
                        <Td className="max-w-xs truncate font-medium">{b.onomasia || '-'}</Td>
                        <Td>
                          {(b.tags?.length || primaryKad?.firmActCode) && (
                            <CategoryBadge category={getEffectiveCategory(b)} />
                          )}
                        </Td>
                        <Td className="text-xs truncate max-w-[200px]" title={primaryKad?.firmActDescr || ''}>{primaryKad?.firmActDescr || '-'}</Td>
                        <Td>{b.postalAreaDescription || '-'}</Td>
                        <Td>
                          <Badge variant="secondary" className="text-xs">{resolveRegionFromZip(b.postalZipCode) || '-'}</Badge>
                        </Td>
                        <Td className="text-gray-500 text-xs">{b.accountant?.officeName || '-'}</Td>
                        <Td>
                          {b.legalStatusDescr && (
                            <Badge variant="secondary" className="text-xs">{b.legalStatusDescr}</Badge>
                          )}
                        </Td>
                        <Td>
                          {(b._count?.programMatches ?? 0) > 0 ? (
                            <Link href={`/businesses/${b.id}`}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                                ✓ {b._count!.programMatches}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </Td>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      {quickSendOpen && (
        <QuickSendModal
          businesses={businesses.filter(b => selected.has(b.id)).map(b => ({ id: b.id, onomasia: b.onomasia, afm: b.afm }))}
          onClose={() => setQuickSendOpen(false)}
          onSent={() => setSelected(new Set())}
        />
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Ανάθεση σε Λογιστή" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Ανάθεση {selected.size} επιχειρήσεων σε υφιστάμενο λογιστή.
          </p>
          <Select
            label="Λογιστής"
            value={assignAccountantId}
            onChange={e => setAssignAccountantId(e.target.value)}
            placeholder="— Χωρίς λογιστή —"
            options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
          />
          <div className="flex gap-2">
            <Button onClick={handleBulkAssign} loading={assigning}>Ανάθεση</Button>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Ακύρωση</Button>
          </div>
        </div>
      </Modal>

      {enrichOpen && <EnrichModal onClose={() => setEnrichOpen(false)} onDone={() => { setEnrichOpen(false); fetchData() }} />}
    </div>
  )
}

function EnrichModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ updated: number; notFound: number } | null>(null)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const res = await fetch('/api/businesses/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: e.target?.result }),
        })
        const data = await res.json()
        if (res.ok) {
          setResult({ updated: data.updated ?? 0, notFound: data.notFound ?? 0 })
        } else {
          setError(data.error || 'Σφάλμα ανεβάσματος')
        }
      } catch {
        setError('Σφάλμα δικτύου')
      }
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Μαζικός Εμπλουτισμός Στοιχείων</h2>
            <p className="text-xs text-slate-500 mt-0.5">Προσθήκη Viber/Κινητού & Email μαζικά</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-violet-800 flex items-center gap-2">
              <Smartphone size={16} className="text-violet-600" />
              📋 Γιατί χρειάζεται αυτό;
            </p>
            <p className="text-xs text-violet-700">
              Αν προσθέσατε πελάτες μόνο με ΑΦΜ, τα μηνύματα δεν φτάνουν πουθενά χωρίς <strong>κινητό (Viber)</strong> ή email.
              Το Viber είναι το #1 κανάλι — τα email συχνά πηγαίνουν αδιάβαστα.
            </p>
            <p className="text-xs text-violet-600 font-medium mt-2">👇 Τι κάνετε:</p>
            <ol className="text-xs text-violet-700 space-y-1 list-decimal list-inside">
              <li>Ετοιμάστε Excel με στήλες: <strong>ΑΦΜ</strong> και <strong>Κινητό</strong> (ή Email ή Viber) — δεν γίνονται δεκτά σταθερά τηλέφωνα</li>
              <li>Ανεβάστε το — το σύστημα βρίσκει αυτόματα κάθε πελάτη και συμπληρώνει τα στοιχεία</li>
            </ol>
          </div>
          {!result ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 block mb-1">Αρχείο Excel (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-100 file:text-violet-700 file:font-semibold hover:file:bg-violet-200"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <Button onClick={handleUpload} loading={uploading} disabled={!file}>
                  <Upload size={15} className="mr-2" />
                  Εμπλουτισμός
                </Button>
                <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                ✅ Ενημερώθηκαν <strong>{result.updated}</strong> επιχειρήσεις
                {result.notFound > 0 && ` · ${result.notFound} ΑΦΜ δεν βρέθηκαν`}
              </div>
              <Button onClick={onDone}>Κλείσιμο</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
