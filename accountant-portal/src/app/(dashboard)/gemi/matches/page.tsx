'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Send, FlaskConical, CheckCircle, XCircle, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react'
import { ErmisTranscriptModal } from '@/components/programs/ermis-transcript-modal'

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
  const [emailEngagementFilter, setEmailEngagementFilter] = useState('')
  const [enrichedFilter, setEnrichedFilter] = useState('')
  const [importBatchFilter, setImportBatchFilter] = useState('')
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([])
  const [importBatchOptions, setImportBatchOptions] = useState<string[]>([])

  const [diagnoseAfm, setDiagnoseAfm] = useState('')
  const [diagnoseProgramId, setDiagnoseProgramId] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null)
  const [diagnoseError, setDiagnoseError] = useState('')

  const [rematchRunning, setRematchRunning] = useState(false)
  const [rematchStatus, setRematchStatus] = useState<{ processed: number; remaining: number } | null>(null)

  const [transcriptMatch, setTranscriptMatch] = useState<{ businessId: string; programId: string } | null>(null)

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.programs || [])
        setProgramOptions(list.map((p: any) => ({ value: p.id, label: p.title })))
      })
      .catch(() => {})
    fetch('/api/gemi/matches/filter-options')
      .then(r => r.json())
      .then(data => setImportBatchOptions(data.importBatches || []))
      .catch(() => {})
  }, [])

  const fetchMatches = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (programFilter) params.set('programId', programFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (emailEngagementFilter) params.set('emailEngagement', emailEngagementFilter)
      if (enrichedFilter !== '') params.set('enriched', enrichedFilter)
      if (importBatchFilter) params.set('importBatch', importBatchFilter)
      const res = await fetch(`/api/gemi/matches?${params}`)
      const data = await res.json()
      setMatches(data.matches || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [page, programFilter, statusFilter, emailEngagementFilter, enrichedFilter, importBatchFilter])

  useEffect(() => { fetchMatches() }, [fetchMatches])
  useEffect(() => { setPage(1) }, [programFilter, statusFilter, emailEngagementFilter, enrichedFilter, importBatchFilter])

  async function runRematch() {
    setRematchRunning(true)
    setRematchStatus(null)
    try {
      // Step 1: reset all matchingDone flags
      await fetch('/api/gemi/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true, limit: 0 }) })
      // Step 2: process batches until done
      let remaining = Infinity
      let totalProcessed = 0
      while (remaining > 0) {
        const res = await fetch('/api/gemi/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 500 }) })
        const data = await res.json()
        totalProcessed += data.processed || 0
        remaining = data.remaining ?? 0
        setRematchStatus({ processed: totalProcessed, remaining })
        if ((data.processed || 0) === 0) break
      }
      await fetchMatches()
    } finally {
      setRematchRunning(false)
    }
  }

  async function runDiagnosis() {
    if (!diagnoseAfm.trim() || !diagnoseProgramId) return
    setDiagnosing(true)
    setDiagnoseError('')
    setDiagnoseResult(null)
    try {
      const res = await fetch(`/api/gemi/diagnose?afm=${encodeURIComponent(diagnoseAfm.trim())}&programId=${encodeURIComponent(diagnoseProgramId)}`)
      const data = await res.json()
      if (!res.ok) setDiagnoseError(data.error || 'Σφάλμα ελέγχου')
      else setDiagnoseResult(data)
    } catch {
      setDiagnoseError('Σφάλμα ελέγχου')
    } finally {
      setDiagnosing(false)
    }
  }

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
        <div className="flex items-center gap-3">
          <Button
            onClick={runRematch}
            loading={rematchRunning}
            variant="outline"
            className="flex items-center gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
            title="Επαναξιολογεί όλες τις ΓΕΜΗ επιχειρήσεις έναντι των ενεργών προγραμμάτων"
          >
            <RefreshCw size={14} className={rematchRunning ? 'animate-spin' : ''} />
            {rematchRunning
              ? rematchStatus ? `${rematchStatus.processed} / ~${rematchStatus.processed + rematchStatus.remaining}` : 'Εκκίνηση…'
              : 'Re-match All'}
          </Button>
          <Link href={campaignHref}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
              <Send size={15} />
              Αποστολή Καμπάνιας
            </Button>
          </Link>
        </div>
        {rematchStatus && !rematchRunning && (
          <p className="text-xs text-green-700 mt-1 text-right">
            Ολοκληρώθηκε — {rematchStatus.processed} επιχειρήσεις επαναξιολογήθηκαν
          </p>
        )}
      </div>

      {/* Eligibility checker */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <FlaskConical size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-700">Έλεγχος Επιλεξιμότητας ΓΕΜΗ</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">ΑΦΜ Επιχείρησης ΓΕΜΗ</label>
              <input
                value={diagnoseAfm}
                onChange={e => setDiagnoseAfm(e.target.value)}
                placeholder="π.χ. 123456789"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Πρόγραμμα</label>
              <select
                value={diagnoseProgramId}
                onChange={e => setDiagnoseProgramId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[260px]"
              >
                <option value="">Επιλέξτε πρόγραμμα…</option>
                {programOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={runDiagnosis}
              loading={diagnosing}
              disabled={!diagnoseAfm.trim() || !diagnoseProgramId}
              variant="outline"
            >
              Έλεγχος
            </Button>
          </div>

          {diagnoseError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} />
              {diagnoseError}
            </div>
          )}

          {diagnoseResult && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                {diagnoseResult.overall ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                    <CheckCircle size={15} /> Η επιχείρηση πληροί τις προϋποθέσεις
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <XCircle size={15} /> Η επιχείρηση δεν πληροί όλες τις προϋποθέσεις
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {diagnoseResult.business?.onomasia || diagnoseResult.business?.afm} ·{' '}
                  {diagnoseResult.business?.aadeEnriched ? 'ΑΑΑΔΕ ✓' : 'ΑΑΑΔΕ —'}
                </span>
              </div>
              {diagnoseResult.results?.length === 0 && (
                <p className="text-sm text-gray-500">Δεν υπάρχουν ειδικά κριτήρια για αυτό το πρόγραμμα — γενική επιλεξιμότητα.</p>
              )}
              <div className="space-y-1.5">
                {diagnoseResult.results?.map((r: any, i: number) => (
                  <div key={i} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${r.pass ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {r.pass ? <CheckCircle size={14} className="mt-0.5 shrink-0 text-green-600" /> : <XCircle size={14} className="mt-0.5 shrink-0 text-red-600" />}
                    <span>{r.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Email Engagement</label>
              <select
                value={emailEngagementFilter}
                onChange={e => setEmailEngagementFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Όλες</option>
                <option value="sent">Εστάλη</option>
                <option value="opened">Άνοιξε</option>
                <option value="not_opened">Δεν άνοιξε</option>
                <option value="clicked">Έκανε κλικ</option>
                <option value="bounced">Bounce</option>
                <option value="unsubscribed">Διαγράφηκε</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ενημέρωση</label>
              <select
                value={enrichedFilter}
                onChange={e => setEnrichedFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Όλες</option>
                <option value="true">Ενημερωμένες</option>
                <option value="false">Μη ενημερωμένες</option>
              </select>
            </div>
            {importBatchOptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Παρτίδα</label>
                <select
                  value={importBatchFilter}
                  onChange={e => setImportBatchFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">Όλες</option>
                  {importBatchOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
            {(programFilter || statusFilter || emailEngagementFilter || enrichedFilter || importBatchFilter) && (
              <button
                onClick={() => {
                  setProgramFilter('')
                  setStatusFilter('')
                  setEmailEngagementFilter('')
                  setEnrichedFilter('')
                  setImportBatchFilter('')
                }}
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
                      <Td>
                        {(m.status === 'INTERESTED' || m.status === 'SUBMITTED') && m.gemi?.claimedBusinessId && (
                          <button
                            onClick={() => setTranscriptMatch({ businessId: m.gemi.claimedBusinessId, programId: m.programId })}
                            className="text-indigo-600 hover:text-indigo-800 transition-colors"
                            title="Συζήτηση Ερμή"
                          >
                            <MessageSquare size={16} />
                          </button>
                        )}
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

      {transcriptMatch && (
        <ErmisTranscriptModal
          businessId={transcriptMatch.businessId}
          programId={transcriptMatch.programId}
          onClose={() => setTranscriptMatch(null)}
        />
      )}
    </div>
  )
}
