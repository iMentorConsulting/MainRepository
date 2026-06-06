'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { Pagination } from '@/components/ui/pagination'

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

export default function MatchesPage() {
  const { data: session } = useSession()
  const [matches, setMatches] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const isAdmin = session?.user?.role === 'ADMIN'

  const fetchMatches = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/matches?${params}`)
    const data = await res.json()
    setMatches(data.matches || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, statusFilter])

  useEffect(() => { fetchMatches() }, [fetchMatches])

  async function updateStatus(matchId: string, status: MatchStatus) {
    await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status } : m))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
          <p className="text-gray-500 mt-1">{total} matches συνολικά</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="max-w-xs">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
                  <Th>Επιχείρηση</Th>
                  <Th>ΑΦΜ</Th>
                  <Th>Πρόγραμμα</Th>
                  <Th>Σκορ</Th>
                  <Th>Λόγοι</Th>
                  <Th>Κατάσταση</Th>
                  {isAdmin && <Th>Ενέργειες</Th>}
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.length === 0 ? (
                  <TableRow>
                    <Td colSpan={7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν matches</Td>
                  </TableRow>
                ) : (
                  matches.map(m => (
                    <TableRow key={m.id}>
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
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                            <div
                              className={`h-1.5 rounded-full ${m.matchScore >= 80 ? 'bg-green-500' : m.matchScore >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                              style={{ width: `${m.matchScore}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{Math.round(m.matchScore)}%</span>
                        </div>
                      </Td>
                      <Td className="max-w-xs">
                        <ul className="text-xs text-gray-500 space-y-0.5">
                          {m.matchReason?.slice(0, 2).map((r: string, i: number) => (
                            <li key={i} className="truncate">{r}</li>
                          ))}
                        </ul>
                      </Td>
                      <Td>
                        <Badge variant={statusVariant[m.status]}>{statusOptions.find(o => o.value === m.status)?.label}</Badge>
                      </Td>
                      {isAdmin && (
                        <Td>
                          <select
                            value={m.status}
                            onChange={e => updateStatus(m.id, e.target.value as MatchStatus)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="POTENTIAL">Πιθανό</option>
                            <option value="REVIEWED">Ελέγχθηκε</option>
                            <option value="REJECTED">Απορρίφθηκε</option>
                            <option value="INTERESTED">Ενδιαφέρον</option>
                            <option value="SUBMITTED">Υποβλήθηκε</option>
                          </select>
                        </Td>
                      )}
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
