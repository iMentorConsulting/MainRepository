'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, MessageSquare, CheckCircle2 } from 'lucide-react'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { ErmisTranscriptModal } from '@/components/programs/ermis-transcript-modal'

const PAGE_SIZE = 25

type Transcript = {
  businessId: string
  programId: string
  business: { id: string; onomasia: string; afm: string; accountant: { officeName: string } | null }
  program: { id: string; title: string }
  createdAt: string
  tokenUsage: number
  caseAssigned: boolean
  messageCount: number
  lastMessage: string | null
}

export default function ErmisTranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [caseAssignedFilter, setCaseAssignedFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<{ businessId: string; programId: string } | null>(null)

  const fetchTranscripts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)
    if (caseAssignedFilter) params.set('caseAssigned', caseAssignedFilter)
    const res = await fetch(`/api/ermis-transcripts?${params}`)
    const data = await res.json()
    setTranscripts(data.transcripts || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, search, caseAssignedFilter])

  useEffect(() => { fetchTranscripts() }, [fetchTranscripts])
  useEffect(() => { setPage(1) }, [search, caseAssignedFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Συζητήσεις με τον Ερμή</h1>
        <p className="text-gray-500 mt-1">{total} συζητήσεις συνολικά</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Επιχείρηση</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Επωνυμία, ΑΦΜ..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                onBlur={() => setSearch(searchInput)}
                className="pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Ανάθεση</label>
            <select
              value={caseAssignedFilter}
              onChange={e => setCaseAssignedFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Όλα</option>
              <option value="yes">Έγινε ανάθεση υπόθεσης</option>
              <option value="no">Χωρίς ανάθεση</option>
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
                  <Th>Πρόγραμμα</Th>
                  <Th>Λογιστής</Th>
                  <Th>Τελευταίο Μήνυμα</Th>
                  <Th className="text-xs">Μηνύματα</Th>
                  <Th className="text-xs">Tokens</Th>
                  <Th className="text-xs">Ημερομηνία</Th>
                  <Th className="text-xs">Ανάθεση</Th>
                  <Th />
                </TableRow>
              </TableHead>
              <TableBody>
                {transcripts.length === 0 ? (
                  <TableRow>
                    <Td colSpan={9} className="text-center text-gray-400 py-8">Δεν βρέθηκαν συζητήσεις</Td>
                  </TableRow>
                ) : (
                  transcripts.map(t => (
                    <TableRow key={`${t.businessId}-${t.programId}`}>
                      <Td className="max-w-[220px]">
                        <Link href={`/businesses/${t.businessId}`} className="text-blue-800 hover:underline font-medium truncate block">
                          {t.business?.onomasia || '-'}
                        </Link>
                      </Td>
                      <Td className="max-w-[220px]">
                        <Link href={`/programs/${t.programId}`} className="text-blue-600 hover:underline text-sm truncate block">
                          {t.program?.title}
                        </Link>
                      </Td>
                      <Td className="text-xs text-gray-500 max-w-[120px] truncate">{t.business?.accountant?.officeName || '-'}</Td>
                      <Td className="text-xs text-gray-500 max-w-[280px] truncate" title={t.lastMessage || ''}>
                        {t.lastMessage || '—'}
                      </Td>
                      <Td className="text-xs text-gray-500">{t.messageCount}</Td>
                      <Td className="text-xs text-gray-500">{t.tokenUsage?.toLocaleString('el-GR') || 0}</Td>
                      <Td className="text-xs text-gray-500">
                        {new Date(t.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </Td>
                      <Td>
                        {t.caseAssigned ? (
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 size={11} /> Ναι
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <button
                          onClick={() => setOpen({ businessId: t.businessId, programId: t.programId })}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                          title="Δείτε τη συζήτηση με τον Ερμή"
                        >
                          <MessageSquare size={16} />
                        </button>
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

      {open && (
        <ErmisTranscriptModal
          businessId={open.businessId}
          programId={open.programId}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
