'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, MessageSquare, CheckCircle2 } from 'lucide-react'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { ErmisTranscriptModal } from '@/components/programs/ermis-transcript-modal'
import { estimateCostEur } from '@/lib/ermis-cost'

const PAGE_SIZE = 25

type Transcript = {
  source: 'business' | 'gemi'
  businessId: string | null
  gemiId: string | null
  programId: string
  onomasia: string | null
  afm: string | null
  accountantOffice: string | null
  program: { id: string; title: string } | null
  createdAt: string
  tokenUsage: number
  tokenUsageInput: number
  tokenUsageOutput: number
  caseAssigned: boolean
  messageCount: number
  lastMessage: string | null
  eligibilityStatus: string | null
  intentStatus: string | null
}

const ELIGIBILITY_LABELS: Record<string, { label: string; variant: 'success' | 'danger' | 'default' }> = {
  ELIGIBLE: { label: 'Επιλέξιμος', variant: 'success' },
  NOT_ELIGIBLE: { label: 'Μη επιλέξιμος', variant: 'danger' },
  UNCLEAR: { label: 'Σε εξέλιξη', variant: 'default' },
}

const INTENT_LABELS: Record<string, { label: string; variant: 'success' | 'danger' | 'default' }> = {
  INTERESTED: { label: 'Ενδιαφέρεται', variant: 'success' },
  NOT_INTERESTED: { label: 'Δεν ενδιαφέρεται', variant: 'danger' },
  UNCLEAR: { label: 'Άγνωστο', variant: 'default' },
}

export default function ErmisTranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [caseAssignedFilter, setCaseAssignedFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<{ businessId: string; programId: string } | null>(null)

  const fetchTranscripts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)
    if (caseAssignedFilter) params.set('caseAssigned', caseAssignedFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    const res = await fetch(`/api/ermis-transcripts?${params}`)
    const data = await res.json()
    setTranscripts(data.transcripts || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, search, caseAssignedFilter, sourceFilter])

  useEffect(() => { fetchTranscripts() }, [fetchTranscripts])
  useEffect(() => { setPage(1) }, [search, caseAssignedFilter, sourceFilter])

  function openTranscript(t: Transcript) {
    if (!t.businessId) return
    setOpen({ businessId: t.businessId, programId: t.programId })
  }

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
            <label className="text-xs font-medium text-gray-500 block mb-1">Πηγή</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Όλες</option>
              <option value="business">Πελάτες λογιστών</option>
              <option value="gemi">ΓΕΜΗ επιχειρήσεις</option>
            </select>
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
                  <Th>Πηγή</Th>
                  <Th>Πρόγραμμα</Th>
                  <Th>Λογιστής</Th>
                  <Th>Τελευταίο Μήνυμα</Th>
                  <Th className="text-xs">Μηνύματα</Th>
                  <Th className="text-xs">Tokens</Th>
                  <Th className="text-xs">Κόστος</Th>
                  <Th className="text-xs">Ημερομηνία</Th>
                  <Th className="text-xs">Επιλεξιμότητα</Th>
                  <Th className="text-xs">Πρόθεση</Th>
                  <Th className="text-xs">Ανάθεση</Th>
                  <Th />
                </TableRow>
              </TableHead>
              <TableBody>
                {transcripts.length === 0 ? (
                  <TableRow>
                    <Td colSpan={13} className="text-center text-gray-400 py-8">Δεν βρέθηκαν συζητήσεις</Td>
                  </TableRow>
                ) : (
                  transcripts.map((t, i) => (
                    <TableRow key={`${t.source}-${t.gemiId ?? t.businessId}-${t.programId}-${i}`}>
                      <Td className="max-w-[200px]">
                        {t.source === 'business' && t.businessId ? (
                          <Link href={`/businesses/${t.businessId}`} className="text-blue-800 hover:underline font-medium truncate block">
                            {t.onomasia || t.afm || '-'}
                          </Link>
                        ) : t.gemiId ? (
                          <Link href={`/gemi/businesses/${t.gemiId}`} className="text-blue-800 hover:underline font-medium truncate block">
                            {t.onomasia || t.afm || '-'}
                          </Link>
                        ) : (
                          <span className="font-medium text-sm truncate block">{t.onomasia || t.afm || '-'}</span>
                        )}
                        {t.afm && <span className="text-xs text-gray-400 font-mono">{t.afm}</span>}
                      </Td>
                      <Td>
                        {t.source === 'gemi' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">ΓΕΜΗ</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Πελάτης</span>
                        )}
                      </Td>
                      <Td className="max-w-[200px]">
                        {t.program ? (
                          <Link href={`/programs/${t.programId}`} className="text-blue-600 hover:underline text-sm truncate block">
                            {t.program.title}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td className="text-xs text-gray-500 max-w-[120px] truncate">{t.accountantOffice || '—'}</Td>
                      <Td className="text-xs text-gray-500 max-w-[260px] truncate" title={t.lastMessage || ''}>
                        {t.lastMessage || '—'}
                      </Td>
                      <Td className="text-xs text-gray-500">{t.messageCount}</Td>
                      <Td className="text-xs text-gray-500">{t.tokenUsage?.toLocaleString('el-GR') || 0}</Td>
                      <Td className="text-xs text-gray-500">{estimateCostEur(t.tokenUsage || 0, t.tokenUsageInput, t.tokenUsageOutput)}</Td>
                      <Td className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </Td>
                      <Td>
                        {t.eligibilityStatus && ELIGIBILITY_LABELS[t.eligibilityStatus] ? (
                          <Badge variant={ELIGIBILITY_LABELS[t.eligibilityStatus].variant} className="w-fit">
                            {ELIGIBILITY_LABELS[t.eligibilityStatus].label}
                          </Badge>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </Td>
                      <Td>
                        {t.intentStatus && INTENT_LABELS[t.intentStatus] ? (
                          <Badge variant={INTENT_LABELS[t.intentStatus].variant} className="w-fit">
                            {INTENT_LABELS[t.intentStatus].label}
                          </Badge>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </Td>
                      <Td>
                        {t.caseAssigned ? (
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 size={11} /> Ναι
                          </Badge>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </Td>
                      <Td>
                        {t.businessId ? (
                          <button
                            onClick={() => openTranscript(t)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                            title="Δείτε τη συζήτηση με τον Ερμή"
                          >
                            <MessageSquare size={16} />
                          </button>
                        ) : <span className="text-xs text-gray-300">—</span>}
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
