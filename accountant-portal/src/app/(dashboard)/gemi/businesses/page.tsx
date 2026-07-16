'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Search, Upload, X, RefreshCw, Link2 } from 'lucide-react'

const PAGE_SIZE = 50

interface GemiBusiness {
  id: string
  afm: string
  onomasia: string | null
  email: string | null
  phone: string | null
  importBatch: string | null
  importedAt: string
  aadeEnriched: boolean
  matchingDone: boolean
  claimed: boolean
  claimedBy?: string | null
}

function DetailPanel({ business, onClose }: { business: GemiBusiness; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white h-full w-full max-w-md shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{business.onomasia || business.afm}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">ΑΦΜ: {business.afm}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <dl className="space-y-3 text-sm">
            {(
              [
                ['ΑΦΜ', business.afm],
                ['Επωνυμία', business.onomasia],
                ['Email', business.email],
                ['Τηλέφωνο', business.phone],
                ['Παρτίδα Εισαγωγής', business.importBatch],
                ['Ημ. Εισαγωγής', business.importedAt ? new Date(business.importedAt).toLocaleDateString('el-GR') : null],
                ['Εμπλουτισμός ΑΑΔΕ', business.aadeEnriched ? '✓ Εμπλουτισμένη' : '⏳ Σε αναμονή'],
                ['Ταίριασμα', business.matchingDone ? '✓ Έγινε' : '⏳ Σε αναμονή'],
                ['Ανάθεση', business.claimed ? `Ανατεθειμένη${business.claimedBy ? ` σε ${business.claimedBy}` : ''}` : 'Μη ανατεθειμένη'],
              ] as [string, string | null | undefined][]
            ).map(([label, value]) =>
              value != null ? (
                <div key={label} className="flex gap-3">
                  <dt className="w-40 shrink-0 font-medium text-gray-500">{label}</dt>
                  <dd className="text-gray-900 break-all">{value}</dd>
                </div>
              ) : null
            )}
          </dl>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [batchName, setBatchName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  async function handleImport() {
    if (!file) return
    setUploading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const res = await fetch('/api/gemi/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: e.target?.result, batchName: batchName.trim() || undefined }),
        })
        const data = await res.json()
        if (res.ok) {
          setResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 })
        } else {
          setError(data.error || 'Σφάλμα εισαγωγής')
        }
      } catch {
        setError('Σφάλμα δικτύου')
      }
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Εισαγωγή CSV</h2>
            <p className="text-xs text-slate-500 mt-0.5">Νέες επιχειρήσεις από ΓΕΜΗ</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 block mb-1">Αρχείο CSV</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-700 file:font-semibold hover:file:bg-amber-200"
                  />
                  <p className="text-xs text-gray-400 mt-1">Αν έχετε Excel: File → Save As → CSV UTF-8. Columns: afm, email, phone</p>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 block mb-1">Όνομα Παρτίδας (προαιρετικό)</span>
                  <input
                    type="text"
                    placeholder="π.χ. ΓΕΜΗ-2026-07"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </label>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <Button onClick={handleImport} loading={uploading} disabled={!file} className="bg-amber-600 hover:bg-amber-700 text-white">
                  <Upload size={15} className="mr-2" />
                  Εισαγωγή
                </Button>
                <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                Εισήχθησαν <strong>{result.imported}</strong> επιχειρήσεις
                {result.skipped > 0 && ` · ${result.skipped} παραλείφθηκαν (υπάρχουν ήδη)`}
              </div>
              <Button onClick={onDone}>Κλείσιμο</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-sm">
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0">
        <X size={15} />
      </button>
    </div>
  )
}

export default function GemiBusinessesPage() {
  return (
    <Suspense fallback={null}>
      <GemiBusinessesPageInner />
    </Suspense>
  )
}

function GemiBusinessesPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      router.replace('/')
    }
  }, [session, status, router])

  const [businesses, setBusinesses] = useState<GemiBusiness[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [aadeEnriched, setAadeEnriched] = useState('')
  const [matchingDone, setMatchingDone] = useState('')
  const [claimed, setClaimed] = useState('')
  const [importBatchInput, setImportBatchInput] = useState('')
  const [importBatch, setImportBatch] = useState('')

  // Modals / panel
  const [importOpen, setImportOpen] = useState(false)
  const [detail, setDetail] = useState<GemiBusiness | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Action loading
  const [enriching, setEnriching] = useState(false)
  const [matching, setMatching] = useState(false)

  const requestSeq = useRef(0)

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (search) params.set('search', search)
    if (aadeEnriched) params.set('aadeEnriched', aadeEnriched)
    if (matchingDone) params.set('matchingDone', matchingDone)
    if (claimed) params.set('claimed', claimed)
    if (importBatch) params.set('importBatch', importBatch)
    try {
      const res = await fetch(`/api/gemi/businesses?${params}`)
      const data = await res.json()
      if (seq !== requestSeq.current) return
      setBusinesses(data.businesses || [])
      setTotal(data.total || 0)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [page, search, aadeEnriched, matchingDone, claimed, importBatch])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, aadeEnriched, matchingDone, claimed, importBatch])

  function handleSearch() { setSearch(searchInput) }
  function handleImportBatchSearch() { setImportBatch(importBatchInput) }

  async function handleEnrich() {
    setEnriching(true)
    try {
      const res = await fetch('/api/gemi/enrich', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToast(`Εμπλουτισμός ΑΑΔΕ: ${data.enriched ?? 0} εμπλουτίστηκαν, ${data.skipped ?? 0} παραλείφθηκαν`)
        fetchData()
      } else {
        setToast(data.error || 'Σφάλμα εμπλουτισμού')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setEnriching(false)
    }
  }

  async function handleMatch() {
    setMatching(true)
    try {
      const res = await fetch('/api/gemi/match', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToast(`Ταίριασμα: ${data.matched ?? 0} ταιριάστηκαν, ${data.skipped ?? 0} παραλείφθηκαν`)
        fetchData()
      } else {
        setToast(data.error || 'Σφάλμα ταιριάσματος')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setMatching(false)
    }
  }

  const hasFilters = !!(search || aadeEnriched || matchingDone || claimed || importBatch)

  if (status === 'loading' || (status === 'authenticated' && (session?.user as any)?.role !== 'ADMIN')) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">ΓΕΜΗ — Επιχειρήσεις</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              ΓΕΜΗ
            </span>
          </div>
          <p className="text-gray-500 mt-1 text-sm">{total} επιχειρήσεις στη δεξαμενή ΓΕΜΗ</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnrich}
            loading={enriching}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <RefreshCw size={14} className="mr-1.5" />
            Εμπλουτισμός ΑΑΔΕ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMatch}
            loading={matching}
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Link2 size={14} className="mr-1.5" />
            Εκτέλεση Ταιριάσματος
          </Button>
          <Button
            size="sm"
            onClick={() => setImportOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Upload size={14} className="mr-1.5" />
            Εισαγωγή CSV
          </Button>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Φίλτρα</span>
            <span className="inline-flex items-center text-xs font-semibold bg-amber-50 text-amber-700 rounded-full px-2.5 py-1 border border-amber-200">
              {loading ? '...' : total} {total === 1 ? 'επιχείρηση' : 'επιχειρήσεις'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Αναζήτηση</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ΑΦΜ, επωνυμία, email..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  onBlur={handleSearch}
                  className="pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-48"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Εμπλουτισμός</label>
              <select
                value={aadeEnriched}
                onChange={e => setAadeEnriched(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              >
                <option value="">Όλες</option>
                <option value="yes">Εμπλουτισμένες</option>
                <option value="no">Ανεμπλούτιστες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ταίριασμα</label>
              <select
                value={matchingDone}
                onChange={e => setMatchingDone(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              >
                <option value="">Όλες</option>
                <option value="yes">Ταιριασμένες</option>
                <option value="no">Αταίριαστες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ανάθεση</label>
              <select
                value={claimed}
                onChange={e => setClaimed(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              >
                <option value="">Όλες</option>
                <option value="yes">Ανατεθειμένες</option>
                <option value="no">Μη ανατεθειμένες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Παρτίδα</label>
              <input
                type="text"
                placeholder="π.χ. ΓΕΜΗ-2026-07"
                value={importBatchInput}
                onChange={e => setImportBatchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleImportBatchSearch()}
                onBlur={handleImportBatchSearch}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-40"
              />
            </div>

            {hasFilters && (
              <button
                onClick={() => {
                  setSearch(''); setSearchInput('')
                  setAadeEnriched(''); setMatchingDone(''); setClaimed('')
                  setImportBatch(''); setImportBatchInput('')
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline self-end pb-2"
              >
                Καθαρισμός φίλτρων
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <Th>ΑΦΜ</Th>
                  <Th>Επωνυμία</Th>
                  <Th>Email</Th>
                  <Th>Τηλέφωνο</Th>
                  <Th>Ημ. Εισαγωγής</Th>
                  <Th>Εμπλουτισμός</Th>
                  <Th>Ταίριασμα</Th>
                  <Th>Ανάθεση</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <Td colSpan={8} className="text-center text-gray-400 py-10">
                      Δεν βρέθηκαν επιχειρήσεις ΓΕΜΗ
                    </Td>
                  </TableRow>
                ) : (
                  businesses.map(b => (
                    <TableRow key={b.id} className="hover:bg-amber-50/40 transition-colors">
                      <Td>
                        <button
                          onClick={() => setDetail(b)}
                          className="font-mono text-amber-800 hover:text-amber-600 hover:underline font-medium"
                        >
                          {b.afm}
                        </button>
                      </Td>
                      <Td className="max-w-[220px] truncate font-medium text-gray-800">
                        {b.onomasia || <span className="text-gray-400">—</span>}
                      </Td>
                      <Td className="text-sm text-gray-600 max-w-[180px] truncate">
                        {b.email || <span className="text-gray-400">—</span>}
                      </Td>
                      <Td className="text-sm text-gray-600 font-mono">
                        {b.phone || <span className="text-gray-400">—</span>}
                      </Td>
                      <Td className="text-xs text-gray-500 whitespace-nowrap">
                        {b.importedAt
                          ? new Date(b.importedAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '—'}
                      </Td>
                      <Td>
                        {b.aadeEnriched ? (
                          <Badge variant="success" className="text-xs">✓ Εμπλουτισμένη</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">⏳ Αναμονή</Badge>
                        )}
                      </Td>
                      <Td>
                        {b.matchingDone ? (
                          <Badge variant="success" className="text-xs">✓ Έγινε</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">⏳ Αναμονή</Badge>
                        )}
                      </Td>
                      <Td>
                        {b.claimed ? (
                          <Badge variant="purple" className="text-xs">Ανατεθειμένη</Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
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

      {detail && <DetailPanel business={detail} onClose={() => setDetail(null)} />}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); fetchData() }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
