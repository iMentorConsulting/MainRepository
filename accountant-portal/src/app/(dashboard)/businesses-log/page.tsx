'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Building2, Search, RefreshCw, Download, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'

const SOURCE_LABELS: Record<string, string> = {
  'accountant':      'Λογιστής (Portal)',
  'exodikastikos':   'Εξωδικαστικός',
  'ermis-lead':      'Ερμής / Case Mgmt',
  'finance-import':  'Finance Import',
  'lead-form':       'Lead Form (Ιστοσελίδα)',
  'website-form':    'Φόρμα ΑΦΜ (Ιστοσελίδα)',
  'case-management': 'Case Management',
}

const SOURCE_COLORS: Record<string, string> = {
  'accountant':      'bg-indigo-100 text-indigo-700',
  'exodikastikos':   'bg-purple-100 text-purple-700',
  'ermis-lead':      'bg-violet-100 text-violet-700',
  'finance-import':  'bg-orange-100 text-orange-700',
  'lead-form':       'bg-emerald-100 text-emerald-700',
  'website-form':    'bg-teal-100 text-teal-700',
  'case-management': 'bg-blue-100 text-blue-700',
}

function fmt(d: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
}

export default function BusinessesLogPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [selectedAccountants, setSelectedAccountants] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (selectedSources.length)      params.set('sources', selectedSources.join(','))
    if (selectedAccountants.length)  params.set('accountantIds', selectedAccountants.join(','))
    if (dateFrom)  params.set('dateFrom', dateFrom)
    if (dateTo)    params.set('dateTo', dateTo)
    if (debouncedSearch) params.set('search', debouncedSearch)

    const res = await fetch(`/api/admin/businesses-log?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [page, selectedSources, selectedAccountants, dateFrom, dateTo, debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  // reset page on filter change
  useEffect(() => { setPage(1) }, [selectedSources, selectedAccountants, dateFrom, dateTo, debouncedSearch])

  const sourceOptions = (data?.allSources || []).map((s: any) => ({
    value: s.source,
    label: `${SOURCE_LABELS[s.source] || s.source} (${s._count})`,
  }))
  const accountantOptions = (data?.allAccountants || []).map((a: any) => ({
    value: a.id,
    label: a.officeName,
  }))

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 size={20} className="text-indigo-600" />
            Εισαγωγές Επιχειρήσεων
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ιστορικό δημιουργίας επιχειρήσεων — πηγή, ώρα και χρήστης
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} className="flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Ανανέωση
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter size={14} />
          Φίλτρα
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ΑΦΜ ή επωνυμία..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <MultiSelect
            options={sourceOptions}
            selected={selectedSources}
            onChange={setSelectedSources}
            placeholder="Πηγή εισαγωγής"
          />
          <MultiSelect
            options={accountantOptions}
            selected={selectedAccountants}
            onChange={setSelectedAccountants}
            placeholder="Λογιστικό γραφείο"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              title="Από"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              title="Έως"
            />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span><strong>{data.total.toLocaleString('el-GR')}</strong> επιχειρήσεις</span>
          <span className="text-slate-300">|</span>
          <span>Σελίδα {page} από {totalPages}</span>
          {(selectedSources.length || selectedAccountants.length || dateFrom || dateTo || debouncedSearch) && (
            <button
              onClick={() => { setSelectedSources([]); setSelectedAccountants([]); setDateFrom(''); setDateTo(''); setSearch('') }}
              className="text-indigo-600 hover:underline text-xs"
            >
              Καθαρισμός φίλτρων
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow>
              <Th>Ημερομηνία / Ώρα</Th>
              <Th>ΑΦΜ</Th>
              <Th>Επωνυμία</Th>
              <Th>Πηγή Εισαγωγής</Th>
              <Th>Λογιστικό Γραφείο</Th>
              <Th>Χρήστης</Th>
              <Th>Τρόπος</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <Td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Φόρτωση...</Td>
              </TableRow>
            ) : !data?.rows?.length ? (
              <TableRow>
                <Td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Δεν βρέθηκαν εγγραφές</Td>
              </TableRow>
            ) : data.rows.map((row: any) => (
              <TableRow key={row.id}>
                <Td className="whitespace-nowrap text-xs text-slate-500 font-mono">
                  {fmt(row.createdAt)}
                </Td>
                <Td>
                  <Link href={`/businesses/${row.id}`} className="text-sm font-mono text-indigo-600 hover:underline">
                    {row.afm}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/businesses/${row.id}`} className="text-sm text-slate-700 hover:text-indigo-600 max-w-[200px] truncate block">
                    {row.onomasia || <span className="text-slate-400 italic">—</span>}
                  </Link>
                </Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[row.source] || 'bg-slate-100 text-slate-600'}`}>
                    {row.sourceLabel}
                  </span>
                </Td>
                <Td className="text-sm text-slate-600">
                  {row.officeName || <span className="text-slate-400">—</span>}
                </Td>
                <Td className="text-xs text-slate-500">
                  {row.userName
                    ? <><span className="font-medium text-slate-700">{row.userName}</span><br /><span className="text-slate-400">{row.userEmail}</span></>
                    : <span className="text-slate-400">—</span>
                  }
                </Td>
                <Td>
                  {row.source === 'accountant' ? (
                    <Badge variant={row.bulk ? 'warning' : 'default'} className="text-xs">
                      {row.bulk ? 'Μαζική' : 'Μεμονωμένη'}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}
