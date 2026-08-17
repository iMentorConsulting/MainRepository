'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import { Pagination } from '@/components/ui/pagination'
import { formatDateTime } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Δημιουργία',
  UPDATE: 'Επεξεργασία',
  DELETE: 'Διαγραφή',
  BULK_ASSIGN: 'Μαζική Ανάθεση',
  BULK_DELETE: 'Μαζική Διαγραφή',
  SEND_CAMPAIGN: 'Αποστολή Καμπάνιας',
  PAGE_VIEW: 'Περιήγηση Σελίδας',
}

const ENTITY_LABELS: Record<string, string> = {
  Business: 'Επιχείρηση',
  Campaign: 'Καμπάνια',
  Page: 'Σελίδα',
}

const CHART_COLORS = ['#4f46e5', '#16a34a', '#dc2626', '#d97706', '#0891b2', '#9333ea', '#db2777', '#65a30d']

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const { data: session, status } = useSession()
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [users, setUsers] = useState<{ id: string; name: string; office: string | null }[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [entities, setEntities] = useState<string[]>([])

  const [accountantFilter, setAccountantFilter] = useState<string[]>([])
  const [userFilter, setUserFilter] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string[]>([])
  const [entityFilter, setEntityFilter] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [chartData, setChartData] = useState<any[]>([])
  const [chartKeys, setChartKeys] = useState<string[]>([])

  function buildParams(extra?: Record<string, string>) {
    const params = new URLSearchParams()
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    if (userFilter.length) params.set('userIds', userFilter.join(','))
    if (actionFilter.length) params.set('actions', actionFilter.join(','))
    if (entityFilter.length) params.set('entities', entityFilter.join(','))
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (search) params.set('search', search)
    for (const [k, v] of Object.entries(extra || {})) params.set(k, v)
    return params
  }

  async function fetchLogs() {
    setLoading(true)
    const params = buildParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sortBy,
      sortDir,
    })
    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setAccountants(data.accountants || [])
      setUsers(data.users || [])
      setActions(data.actions || [])
      setEntities(data.entities || [])
    }
    setLoading(false)
  }

  async function fetchChart() {
    const res = await fetch(`/api/admin/audit-logs?${buildParams({ chart: '1' }).toString()}`)
    if (res.ok) {
      const data = await res.json()
      setChartData(data.data || [])
      setChartKeys(data.keys || [])
    }
  }

  const filterDeps = [accountantFilter, userFilter, actionFilter, entityFilter, dateFrom, dateTo, search]

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, page, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return
    fetchLogs()
    fetchChart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, ...filterDeps])

  if (status === 'loading') return null
  if (session?.user?.role !== 'ADMIN') redirect('/')

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir(field === 'createdAt' ? 'desc' : 'asc') }
  }

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    const active = sortBy === field
    const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ChevronUp : ChevronDown
    return (
      <th className="px-4 py-2.5 font-medium">
        <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-indigo-700 transition-colors">
          {children}
          <Icon size={13} />
        </button>
      </th>
    )
  }

  function clearFilters() {
    setAccountantFilter([])
    setUserFilter([])
    setActionFilter([])
    setEntityFilter([])
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  const hasFilters = !!(accountantFilter.length || userFilter.length || actionFilter.length || entityFilter.length || dateFrom || dateTo || search)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Καταγραφή Ενεργειών Λογιστών</h1>
        <p className="text-sm text-gray-500 mt-1">{total} ενέργειες συνολικά</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Φίλτρα</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
            <MultiSelect
              label="Λογιστές"
              placeholder="Όλοι οι λογιστές"
              options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
              selected={accountantFilter}
              onChange={setAccountantFilter}
            />
            <MultiSelect
              label="Χρήστες"
              placeholder="Όλοι οι χρήστες"
              options={users.map(u => ({ value: u.id, label: u.office ? `${u.name} (${u.office})` : u.name }))}
              selected={userFilter}
              onChange={setUserFilter}
            />
            <MultiSelect
              label="Ενέργειες"
              placeholder="Όλες οι ενέργειες"
              options={actions.map(a => ({ value: a, label: ACTION_LABELS[a] || a }))}
              selected={actionFilter}
              onChange={setActionFilter}
            />
            <MultiSelect
              label="Τύποι"
              placeholder="Όλοι οι τύποι"
              options={entities.map(e => ({ value: e, label: ENTITY_LABELS[e] || e }))}
              selected={entityFilter}
              onChange={setEntityFilter}
            />
            <Input
              label="Από Ημερομηνία"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <Input
              label="Έως Ημερομηνία"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
            <Input
              label="Αναζήτηση"
              placeholder="Στις λεπτομέρειες..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline mt-3">
              Καθαρισμός φίλτρων
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Δραστηριότητα στον Χρόνο</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Δεν υπάρχουν δεδομένα για τα επιλεγμένα φίλτρα</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartKeys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Δεν βρέθηκαν ενέργειες</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <SortHeader field="createdAt">Ημερομηνία</SortHeader>
                    <SortHeader field="accountant">Λογιστής</SortHeader>
                    <SortHeader field="user">Χρήστης</SortHeader>
                    <SortHeader field="action">Ενέργεια</SortHeader>
                    <SortHeader field="entity">Τύπος</SortHeader>
                    <SortHeader field="target">Επιχείρηση / Στόχος</SortHeader>
                    <th className="px-4 py-2.5 font-medium">Λεπτομέρειες</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{log.user?.accountant?.officeName || '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-medium">{log.user?.name || '—'}</div>
                        <div className="text-xs text-gray-400">{log.user?.email}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{ACTION_LABELS[log.action] || log.action}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{ENTITY_LABELS[log.entity] || log.entity}</td>
                      <td className="px-4 py-2.5">
                        {log.target ? (
                          log.target.href ? (
                            <Link href={log.target.href} className="text-blue-700 hover:underline">{log.target.name}</Link>
                          ) : (
                            <span>{log.target.name}</span>
                          )
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-md whitespace-pre-wrap break-words">{log.entity === 'Page' ? '—' : (log.details || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
    </div>
  )
}
