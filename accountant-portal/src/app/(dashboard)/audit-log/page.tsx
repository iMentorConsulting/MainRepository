'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { formatDateTime } from '@/lib/utils'

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Δημιουργία',
  UPDATE: 'Επεξεργασία',
  DELETE: 'Διαγραφή',
  BULK_ASSIGN: 'Μαζική Ανάθεση',
  BULK_DELETE: 'Μαζική Διαγραφή',
  SEND_CAMPAIGN: 'Αποστολή Καμπάνιας',
}

const ENTITY_LABELS: Record<string, string> = {
  Business: 'Επιχείρηση',
  Campaign: 'Καμπάνια',
}

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const { data: session, status } = useSession()
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [entities, setEntities] = useState<string[]>([])

  const [accountantId, setAccountantId] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  async function fetchLogs() {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (accountantId) params.set('accountantId', accountantId)
    if (action) params.set('action', action)
    if (entity) params.set('entity', entity)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (search) params.set('search', search)

    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setAccountants(data.accountants || [])
      setActions(data.actions || [])
      setEntities(data.entities || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return
    fetchLogs()
  }, [status, session, page])

  useEffect(() => {
    setPage(1)
  }, [accountantId, action, entity, dateFrom, dateTo, search])

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return
    if (page !== 1) return
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountantId, action, entity, dateFrom, dateTo, search])

  if (status === 'loading') return null
  if (session?.user?.role !== 'ADMIN') redirect('/')

  function clearFilters() {
    setAccountantId('')
    setAction('')
    setEntity('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  const hasFilters = !!(accountantId || action || entity || dateFrom || dateTo || search)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Καταγραφή Ενεργειών Λογιστών</h1>
        <p className="text-sm text-gray-500 mt-1">{total} ενέργειες συνολικά</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Φίλτρα</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Select
              label="Λογιστής"
              placeholder="Όλοι οι λογιστές"
              value={accountantId}
              onChange={e => setAccountantId(e.target.value)}
              options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
            />
            <Select
              label="Ενέργεια"
              placeholder="Όλες οι ενέργειες"
              value={action}
              onChange={e => setAction(e.target.value)}
              options={actions.map(a => ({ value: a, label: ACTION_LABELS[a] || a }))}
            />
            <Select
              label="Τύπος"
              placeholder="Όλοι οι τύποι"
              value={entity}
              onChange={e => setEntity(e.target.value)}
              options={entities.map(e => ({ value: e, label: ENTITY_LABELS[e] || e }))}
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
              placeholder="Αναζήτηση στις λεπτομέρειες..."
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
                    <th className="px-4 py-2.5 font-medium">Ημερομηνία</th>
                    <th className="px-4 py-2.5 font-medium">Λογιστής</th>
                    <th className="px-4 py-2.5 font-medium">Χρήστης</th>
                    <th className="px-4 py-2.5 font-medium">Ενέργεια</th>
                    <th className="px-4 py-2.5 font-medium">Τύπος</th>
                    <th className="px-4 py-2.5 font-medium">Λεπτομέρειες</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{log.user?.accountant?.officeName || '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-medium">{log.user?.name || '—'}</div>
                        <div className="text-xs text-gray-400">{log.user?.email}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{ACTION_LABELS[log.action] || log.action}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{ENTITY_LABELS[log.entity] || log.entity}</td>
                      <td className="px-4 py-2.5 text-gray-700">{log.details || '—'}</td>
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
