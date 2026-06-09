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
import { Plus, Search, Download, Filter, Trash2, UserCog, Send, Sparkles, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { QuickSendModal } from '@/components/quick-send-modal'
import * as XLSX from 'xlsx'

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
  activities: { firmActCode: string; firmActKind: number | null }[]
  _count?: { programMatches: number }
}

const PAGE_SIZE = 20

// ── Bulk Enrich Modal ─────────────────────────────────────────────────────────
function EnrichModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [result, setResult] = useState<{ updated: number; notFound: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const normalised = data.map(row => {
          const norm: any = {}
          for (const key of Object.keys(row)) {
            const k = key.toLowerCase().trim()
            if (k === 'afm' || k === 'αφμ') norm.afm = String(row[key]).trim()
            if (k === 'email') norm.email = String(row[key]).trim()
            if (k.includes('phone') || k.includes('τηλ') || k === 'τηλέφωνο') norm.phone = String(row[key]).trim()
            if (k.includes('viber')) norm.viberPhone = String(row[key]).trim()
          }
          return norm
        }).filter((r: any) => r.afm)
        setRows(normalised)
        setError('')
      } catch {
        setError('Σφάλμα ανάγνωσης αρχείου. Βεβαιωθείτε ότι είναι έγκυρο Excel (.xlsx).')
      }
    }
    reader.readAsBinaryString(file)
  }

  async function submit() {
    if (rows.length === 0) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/businesses/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: rows }),
    })
    setSaving(false)
    if (res.ok) setResult(await res.json())
    else setError('Σφάλμα ενημέρωσης. Δοκιμάστε ξανά.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-500" />
            <h2 className="text-base font-bold text-gray-900">Εμπλουτισμός Email & Τηλεφώνων</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {result ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-bold text-gray-900">{result.updated} επιχειρήσεις ενημερώθηκαν!</p>
              {result.notFound > 0 && <p className="text-sm text-amber-600 mt-1">{result.notFound} ΑΦΜ δεν βρέθηκαν στο σύστημα.</p>}
            </div>
            <Button onClick={onClose}>Κλείσιμο</Button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
              <p className="font-bold text-amber-800">📋 Προσθέσατε πελάτες μόνο με ΑΦΜ και τώρα θέλετε να στείλετε καμπάνια;</p>
              <p>Χωρίς email ή τηλέφωνο <strong>τα μηνύματα δεν φτάνουν πουθενά</strong>. Εδώ μπορείτε να προσθέσετε τα στοιχεία επικοινωνίας μαζικά — για όλους τους πελάτες ταυτόχρονα.</p>
              <div className="mt-2 space-y-1 text-amber-800">
                <p className="font-medium">👇 Τι κάνετε:</p>
                <p>1. Ετοιμάστε Excel με 2 στήλες: <code className="bg-amber-100 px-1 rounded font-mono">ΑΦΜ</code> και <code className="bg-amber-100 px-1 rounded font-mono">Email</code> (ή <code className="bg-amber-100 px-1 rounded font-mono">Τηλέφωνο</code>)</p>
                <p>2. Ανεβάστε το — το σύστημα βρίσκει αυτόματα τον κάθε πελάτη και συμπληρώνει τα στοιχεία</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Αρχείο Excel (.xlsx)</label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <Upload size={24} className="text-gray-400" />
                <span className="text-sm text-gray-500">Κάντε κλικ για επιλογή ή σύρετε το αρχείο εδώ</span>
                {rows.length > 0 && <span className="text-xs text-indigo-600 font-semibold">{rows.length} εγγραφές έτοιμες</span>}
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              </label>
            </div>

            {rows.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-600 grid grid-cols-4 gap-2">
                  <span>ΑΦΜ</span><span>Email</span><span>Τηλέφωνο</span><span>Viber</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {rows.slice(0, 20).map((r: any, i: number) => (
                    <div key={i} className="px-4 py-1.5 text-xs text-gray-700 grid grid-cols-4 gap-2">
                      <span className="font-mono">{r.afm}</span>
                      <span className="truncate text-gray-500">{r.email || '—'}</span>
                      <span className="truncate text-gray-500">{r.phone || '—'}</span>
                      <span className="truncate text-gray-500">{r.viberPhone || '—'}</span>
                    </div>
                  ))}
                  {rows.length > 20 && <div className="px-4 py-1.5 text-xs text-gray-400">...και {rows.length - 20} ακόμα</div>}
                </div>
              </div>
            )}

            {error && <div className="flex items-center gap-2 text-sm text-red-600"><AlertCircle size={15} />{error}</div>}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
              <Button disabled={rows.length === 0} loading={saving} onClick={submit}>
                <Sparkles size={15} className="mr-1" />
                Εμπλουτισμός {rows.length > 0 ? `(${rows.length} εγγραφές)` : ''}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [legalStatusOptions, setLegalStatusOptions] = useState<string[]>([])
  const [regionOptions, setRegionOptions] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [legalStatusFilter, setLegalStatusFilter] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [sort, setSort] = useState('createdAt:desc')

  const [quickSendOpen, setQuickSendOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignAccountantId, setAssignAccountantId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [enrichOpen, setEnrichOpen] = useState(false)

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
      ...(legalStatusFilter.length ? { legalStatuses: legalStatusFilter.join(',') } : {}),
      ...(regionFilter.length ? { regions: regionFilter.join(',') } : {}),
    })
    const res = await fetch(`/api/businesses?${params}`)
    const data = await res.json()
    setBusinesses(data.businesses || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, search, accountantFilter, legalStatusFilter, regionFilter, sort])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setSelected(new Set()) }, [page, search, accountantFilter, legalStatusFilter, regionFilter, sort])
  useEffect(() => { setPage(1) }, [accountantFilter, legalStatusFilter, regionFilter, sort])

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
      {enrichOpen && <EnrichModal onClose={() => { setEnrichOpen(false); fetchData() }} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Επιχειρήσεις</h1>
          <p className="text-gray-500 mt-1">{total} επιχειρήσεις συνολικά</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} size="sm">
            <Download size={16} className="mr-1" />
            Export Excel
          </Button>
          {!isAdmin && (
            <Button variant="outline" onClick={() => setEnrichOpen(true)} size="sm">
              <Sparkles size={16} className="mr-1" />
              Εμπλουτισμός Email/Τηλ.
            </Button>
          )}
          <Link href="/businesses/new">
            <Button size={isAdmin ? 'sm' : 'md'} className={!isAdmin ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 text-base shadow-lg' : ''}>
              <Plus size={isAdmin ? 16 : 20} className="mr-2" />
              {isAdmin ? 'Νέα Επιχείρηση' : '+ Προσθήκη Επιχείρησης'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Accountant onboarding cards — always visible */}
      {!isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/businesses/new?mode=afm" className="group block">
            <div className="bg-white border-2 border-indigo-200 hover:border-indigo-400 rounded-2xl p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">🔍</div>
              <div>
                <p className="font-bold text-gray-900 text-base">Προσθήκη μέσω ΑΦΜ</p>
                <p className="text-sm text-gray-500 mt-0.5">Βάλτε το ΑΦΜ του πελάτη → τα στοιχεία συμπληρώνονται αυτόματα από ΑΑΔΕ</p>
                <p className="text-xs text-indigo-600 font-semibold mt-2 group-hover:underline">Προσθήκη 1 πελάτη →</p>
              </div>
            </div>
          </Link>
          <Link href="/businesses/new?mode=excel" className="group block">
            <div className="bg-white border-2 border-violet-200 hover:border-violet-400 rounded-2xl p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📊</div>
              <div>
                <p className="font-bold text-gray-900 text-base">Μαζική Εισαγωγή από Excel</p>
                <p className="text-sm text-gray-500 mt-0.5">Εξαγάγετε τους πελάτες από το λογιστικό σας πρόγραμμα → ανεβάστε το Excel εδώ</p>
                <p className="text-xs text-violet-600 font-semibold mt-2 group-hover:underline">Εισαγωγή πολλών πελατών →</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {!isAdmin && total === 0 && !loading && (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white text-center shadow-xl">
          <div className="text-4xl mb-3">🏢</div>
          <h2 className="text-xl font-bold mb-2">Δεν έχετε προσθέσει πελάτες ακόμη!</h2>
          <p className="text-indigo-100 text-sm">
            Κάθε πελάτης που λείπει = χαμένη ευκαιρία χρηματοδότησης και χαμένη προμήθεια για εσάς.
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
                options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
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
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ταξινόμηση</label>
              <Select value={sort} onChange={e => setSort(e.target.value)} options={SORT_OPTIONS} className="min-w-[180px]" />
            </div>
            {(accountantFilter.length > 0 || legalStatusFilter.length > 0 || regionFilter.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAccountantFilter([]); setLegalStatusFilter([]); setRegionFilter([]) }}
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
                  <Th>ΑΦΜ</Th>
                  <Th>Επωνυμία</Th>
                  <Th>Κύρια ΚΑΔ</Th>
                  <Th>Περιοχή</Th>
                  <Th>ΤΚ</Th>
                  <Th>Λογιστής</Th>
                  <Th>Μορφή</Th>
                  <Th>Matches</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <Td colSpan={9} className="text-center text-gray-400 py-8">
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
                        <Td className="font-mono text-xs">{primaryKad?.firmActCode || '-'}</Td>
                        <Td>{b.postalAreaDescription || '-'}</Td>
                        <Td className="font-mono text-xs">{b.postalZipCode || '-'}</Td>
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
    </div>
  )
}
