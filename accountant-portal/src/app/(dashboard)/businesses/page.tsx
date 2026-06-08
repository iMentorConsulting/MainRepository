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
import { Plus, Search, Download, Upload, Filter, Trash2, UserCog } from 'lucide-react'

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

  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [legalStatusOptions, setLegalStatusOptions] = useState<string[]>([])
  const [regionOptions, setRegionOptions] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [legalStatusFilter, setLegalStatusFilter] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [sort, setSort] = useState('createdAt:desc')

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
            <Button size="sm">
              <Plus size={16} className="mr-1" />
              Νέα Επιχείρηση
            </Button>
          </Link>
        </div>
      </div>

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
            {isAdmin && selected.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                  <UserCog size={14} className="mr-1" />
                  Ανάθεση σε Λογιστή ({selected.size})
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete} loading={deleting}>
                  <Trash2 size={14} className="mr-1" />
                  Διαγραφή ({selected.size})
                </Button>
              </>
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
                  {isAdmin && (
                    <Th className="w-10">
                      <input
                        type="checkbox"
                        checked={businesses.length > 0 && selected.size === businesses.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </Th>
                  )}
                  <Th>ΑΦΜ</Th>
                  <Th>Επωνυμία</Th>
                  <Th>Κύρια ΚΑΔ</Th>
                  <Th>Περιοχή</Th>
                  <Th>ΤΚ</Th>
                  <Th>Λογιστής</Th>
                  <Th>Μορφή</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <Td colSpan={isAdmin ? 8 : 7} className="text-center text-gray-400 py-8">
                      Δεν βρέθηκαν επιχειρήσεις
                    </Td>
                  </TableRow>
                ) : (
                  businesses.map(b => {
                    const primaryKad = b.activities?.find(a => a.firmActKind === 1)
                    return (
                      <TableRow key={b.id}>
                        {isAdmin && (
                          <Td>
                            <input
                              type="checkbox"
                              checked={selected.has(b.id)}
                              onChange={() => toggleSelect(b.id)}
                              className="rounded"
                            />
                          </Td>
                        )}
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
