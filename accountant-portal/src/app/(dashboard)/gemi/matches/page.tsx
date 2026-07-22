'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Send } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'Όλες οι καταστάσεις' },
  { value: 'POTENTIAL', label: 'POTENTIAL' },
  { value: 'REVIEWED', label: 'REVIEWED' },
  { value: 'REJECTED', label: 'REJECTED' },
  { value: 'INTERESTED', label: 'INTERESTED' },
  { value: 'SUBMITTED', label: 'SUBMITTED' },
]

type BadgeVariant = 'secondary' | 'info' | 'danger' | 'success'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  POTENTIAL: 'secondary',
  REVIEWED: 'info',
  REJECTED: 'danger',
  INTERESTED: 'success',
  SUBMITTED: 'success',
}

const PAGE_SIZE = 50

export default function GemiMatchesPage() {
  return (
    <Suspense fallback={null}>
      <GemiMatchesPageInner />
    </Suspense>
  )
}

function GemiMatchesPageInner() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()

  const isAdmin = ['ADMIN', 'CONSULTANT'].includes(session?.user?.role ?? '')

  const [matches, setMatches] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [programFilter, setProgramFilter] = useState(() => searchParams.get('programId') || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.programs || [])
        setProgramOptions(list.map((p: any) => ({ value: p.id, label: p.title })))
      })
      .catch(() => {})
  }, [])

  const fetchMatches = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (programFilter) params.set('programId', programFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/gemi/matches?${params}`)
      const data = await res.json()
      setMatches(data.matches || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [page, programFilter, statusFilter])

  useEffect(() => { fetchMatches() }, [fetchMatches])
  useEffect(() => { setPage(1) }, [programFilter, statusFilter])

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        Δεν έχετε πρόσβαση σε αυτή τη σελίδα.
      </div>
    )
  }

  const campaignHref = programFilter
    ? `/gemi/campaigns/new?programId=${programFilter}`
    : '/gemi/campaigns/new'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ΓΕΜΗ — Ταιριάσματα Προγραμμάτων</h1>
          <p className="text-gray-500 mt-1">{total} ταιριάσματα συνολικά</p>
        </div>
        <Link href={campaignHref}>
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
            <Send size={15} />
            Αποστολή Καμπάνιας
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Φίλτρα</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1">
              {loading ? '...' : total} ταιριάσματα με τα τρέχοντα φίλτρα
            </span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Πρόγραμμα</label>
              <select
                value={programFilter}
                onChange={e => setProgramFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[220px]"
              >
                <option value="">Όλα τα προγράμματα</option>
                {programOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Κατάσταση</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {(programFilter || statusFilter) && (
              <button
                onClick={() => { setProgramFilter(''); setStatusFilter('') }}
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
                  <Th>ΑΦΜ</Th>
                  <Th>Επωνυμία</Th>
                  <Th>Πρόγραμμα</Th>
                  <Th>Βαθμολογία</Th>
                  <Th>Λόγοι Ταιριάσματος</Th>
                  <Th>Κατάσταση</Th>
                  <Th>Ημερομηνία</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.length === 0 ? (
                  <TableRow>
                    <Td colSpan={7} className="text-center text-gray-400 py-8">
                      Δεν βρέθηκαν ταιριάσματα
                    </Td>
                  </TableRow>
                ) : (
                  matches.map((m: any) => (
                    <TableRow key={m.id}>
                      <Td className="text-sm font-mono">{m.gemi?.afm || '—'}</Td>
                      <Td>
                        <Link href={`/gemi/businesses/${m.gemiId}`} className="text-blue-800 hover:underline font-medium text-sm">
                          {m.gemi?.onomasia || m.gemi?.afm || '—'}
                        </Link>
                        {m.gemi?.claimedAt && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Ανακτήθηκε</span>
                        )}
                      </Td>
                      <Td>
                        <Link href={`/programs/${m.programId}`} className="text-blue-600 hover:underline text-sm">
                          {m.program?.title || '—'}
                        </Link>
                      </Td>
                      <Td className="text-sm tabular-nums font-semibold text-green-700">{m.matchScore ?? '—'}</Td>
                      <Td className="text-sm text-gray-600 max-w-xs">
                        {Array.isArray(m.matchReason) && m.matchReason.length > 0
                          ? m.matchReason.slice(0, 2).join(' · ')
                          : '—'}
                      </Td>
                      <Td>
                        {m.status ? (
                          <Badge variant={STATUS_BADGE[m.status] ?? 'secondary'}>
                            {m.status}
                          </Badge>
                        ) : '—'}
                      </Td>
                      <Td className="text-sm text-gray-500 whitespace-nowrap">
                        {m.createdAt
                          ? new Date(m.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '—'}
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
