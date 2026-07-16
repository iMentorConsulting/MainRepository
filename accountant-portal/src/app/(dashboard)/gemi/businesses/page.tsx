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
  claimedAt?: string | null
  category?: string | null
  activities?: any[]
  postalAreaDescription?: string | null
  postalZipCode?: string | null
  stopDate?: string | null
}

const ZIP_PREFIX_TO_REGION: Record<string, string> = {
  '10':'Αττική','11':'Αττική','12':'Αττική','13':'Αττική','14':'Αττική','15':'Αττική','16':'Αττική','17':'Αττική','18':'Αττική','19':'Αττική',
  '20':'Πελοπόννησος','21':'Πελοπόννησος','22':'Πελοπόννησος','23':'Πελοπόννησος','24':'Πελοπόννησος',
  '25':'Δυτική Ελλάδα','26':'Δυτική Ελλάδα','27':'Δυτική Ελλάδα',
  '28':'Ιόνια Νησιά','29':'Ιόνια Νησιά','49':'Ιόνια Νησιά',
  '30':'Στερεά Ελλάδα','31':'Στερεά Ελλάδα','32':'Στερεά Ελλάδα','33':'Στερεά Ελλάδα','34':'Στερεά Ελλάδα','35':'Στερεά Ελλάδα','36':'Στερεά Ελλάδα',
  '37':'Θεσσαλία','38':'Θεσσαλία','39':'Θεσσαλία','40':'Θεσσαλία','41':'Θεσσαλία','42':'Θεσσαλία','43':'Θεσσαλία',
  '44':'Ήπειρος','45':'Ήπειρος','46':'Ήπειρος','47':'Ήπειρος','48':'Ήπειρος',
  '50':'Δυτική Μακεδονία','51':'Δυτική Μακεδονία','52':'Δυτική Μακεδονία','53':'Δυτική Μακεδονία',
  '54':'Κεντρική Μακεδονία','55':'Κεντρική Μακεδονία','56':'Κεντρική Μακεδονία','57':'Κεντρική Μακεδονία','58':'Κεντρική Μακεδονία','59':'Κεντρική Μακεδονία',
  '60':'Κεντρική Μακεδονία','61':'Κεντρική Μακεδονία','62':'Κεντρική Μακεδονία','63':'Κεντρική Μακεδονία',
  '64':'Αν. Μακεδονία & Θράκη','65':'Αν. Μακεδονία & Θράκη','66':'Αν. Μακεδονία & Θράκη','67':'Αν. Μακεδονία & Θράκη','68':'Αν. Μακεδονία & Θράκη','69':'Αν. Μακεδονία & Θράκη',
  '70':'Κρήτη','71':'Κρήτη','72':'Κρήτη','73':'Κρήτη','74':'Κρήτη',
  '81':'Βόρειο Αιγαίο','82':'Βόρειο Αιγαίο','83':'Βόρειο Αιγαίο',
  '84':'Νότιο Αιγαίο','85':'Νότιο Αιγαίο',
}

function getRegionFromZip(zip: string | null | undefined): string | null {
  if (!zip) return null
  const prefix = zip.replace(/\s/g, '').slice(0, 2)
  return ZIP_PREFIX_TO_REGION[prefix] ?? null
}

function getPrimaryKad(activities: any[] | undefined): { code: string; descr: string } | null {
  if (!activities?.length) return null
  const primary = activities.find(a => a.firmActKind === 1) || activities[0]
  if (!primary) return null
  return { code: primary.firmActCode ?? '', descr: primary.firmActDescr ?? '' }
}

const CATEGORY_COLORS: Record<string, string> = {
  ΤΟΥΡΙΣΜΟΣ: 'bg-sky-100 text-sky-800',
  ΕΜΠΟΡΙΟ: 'bg-blue-100 text-blue-800',
  ΜΕΤΑΠΟΙΗΣΗ: 'bg-orange-100 text-orange-800',
  ΕΣΤΙΑΣΗ: 'bg-rose-100 text-rose-800',
  ΥΠΗΡΕΣΙΕΣ: 'bg-indigo-100 text-indigo-800',
  ΑΓΡΟΤΙΚΑ: 'bg-green-100 text-green-800',
}

function CategoryChip({ cat }: { cat: string | null | undefined }) {
  if (!cat) return <span className="text-gray-300">—</span>
  const cls = CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{cat}</span>
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
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
                  <Upload size={15} className="mr-2" />Εισαγωγή
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
      <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0"><X size={15} /></button>
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
  const [batches, setBatches] = useState<string[]>([])

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [aadeEnriched, setAadeEnriched] = useState('')
  const [matchingDone, setMatchingDone] = useState('')
  const [claimed, setClaimed] = useState('')
  const [importBatch, setImportBatch] = useState('')
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState('')
  const [hasCampaign, setHasCampaign] = useState('')
  const [active, setActive] = useState('')

  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [matching, setMatching] = useState(false)

  const requestSeq = useRef(0)

  // Fetch distinct import batches for dropdown
  useEffect(() => {
    fetch('/api/gemi/businesses/batches')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setBatches(d))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (search) params.set('search', search)
    if (aadeEnriched) params.set('aadeEnriched', aadeEnriched)
    if (matchingDone) params.set('matchingDone', matchingDone)
    if (claimed) params.set('claimed', claimed)
    if (importBatch) params.set('importBatch', importBatch)
    if (region) params.set('region', region)
    if (category) params.set('category', category)
    if (hasCampaign) params.set('hasCampaign', hasCampaign)
    if (active) params.set('active', active)
    try {
      const res = await fetch(`/api/gemi/businesses?${params}`)
      const data = await res.json()
      if (seq !== requestSeq.current) return
      setBusinesses(data.businesses || [])
      setTotal(data.total || 0)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [page, search, aadeEnriched, matchingDone, claimed, importBatch, region, category, hasCampaign, active])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, aadeEnriched, matchingDone, claimed, importBatch, region, category, hasCampaign, active])

  function handleSearch() { setSearch(searchInput) }

  async function handleEnrich() {
    setEnriching(true)
    try {
      const res = await fetch('/api/gemi/enrich', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToast(`Εμπλουτισμός ΑΑΔΕ: ${data.enriched ?? 0} εμπλουτίστηκαν`)
        fetchData()
        // Refresh batches too
        fetch('/api/gemi/businesses/batches').then(r => r.json()).then(d => Array.isArray(d) && setBatches(d)).catch(() => {})
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
        setToast(`Ταίριασμα: ${data.matched ?? 0} ταιριάστηκαν`)
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

  const hasFilters = !!(search || aadeEnriched || matchingDone || claimed || importBatch || region || category || hasCampaign || active)

  function clearFilters() {
    setSearch(''); setSearchInput('')
    setAadeEnriched(''); setMatchingDone(''); setClaimed('')
    setImportBatch(''); setRegion(''); setCategory(''); setHasCampaign(''); setActive('')
  }

  if (status === 'loading' || (status === 'authenticated' && (session?.user as any)?.role !== 'ADMIN')) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const selectCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">ΓΕΜΗ — Επιχειρήσεις</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">ΓΕΜΗ</span>
          </div>
          <p className="text-gray-500 mt-1 text-sm">{total} επιχειρήσεις στη δεξαμενή ΓΕΜΗ</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleEnrich} loading={enriching} className="border-blue-300 text-blue-700 hover:bg-blue-50">
            <RefreshCw size={14} className="mr-1.5" />Εμπλουτισμός ΑΑΔΕ
          </Button>
          <Button variant="outline" size="sm" onClick={handleMatch} loading={matching} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            <Link2 size={14} className="mr-1.5" />Εκτέλεση Ταιριάσματος
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Upload size={14} className="mr-1.5" />Εισαγωγή CSV
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
            {/* Search */}
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
              <label className="text-xs font-medium text-gray-500 block mb-1">Παρτίδα</label>
              <select value={importBatch} onChange={e => setImportBatch(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Περιφέρεια</label>
              <select value={region} onChange={e => setRegion(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                {['Αττική','Κεντρική Μακεδονία','Θεσσαλία','Ανατολική Μακεδονία και Θράκη','Ήπειρος','Δυτική Μακεδονία','Ιόνια Νησιά','Δυτική Ελλάδα','Στερεά Ελλάδα','Πελοπόννησος','Βόρειο Αιγαίο','Νότιο Αιγαίο','Κρήτη'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Κλάδος</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
                <option value="">Όλοι</option>
                {['ΥΠΗΡΕΣΙΕΣ','ΕΜΠΟΡΙΟ','ΜΕΤΑΠΟΙΗΣΗ','ΤΟΥΡΙΣΜΟΣ','ΕΣΤΙΑΣΗ','ΑΓΡΟΤΙΚΑ'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Εμπλουτισμός</label>
              <select value={aadeEnriched} onChange={e => setAadeEnriched(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="yes">Εμπλουτισμένες</option>
                <option value="no">Ανεμπλούτιστες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ταίριασμα</label>
              <select value={matchingDone} onChange={e => setMatchingDone(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="yes">Ταιριασμένες</option>
                <option value="no">Αταίριαστες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ανάθεση</label>
              <select value={claimed} onChange={e => setClaimed(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="yes">Ανατεθειμένες</option>
                <option value="no">Μη ανατεθειμένες</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ενημέρωση</label>
              <select value={hasCampaign} onChange={e => setHasCampaign(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="yes">Έλαβαν</option>
                <option value="no">Δεν έλαβαν</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Κατάσταση</label>
              <select value={active} onChange={e => setActive(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="yes">Ενεργές</option>
                <option value="no">Ανενεργές</option>
              </select>
            </div>

            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 underline self-end pb-2">
                Καθαρισμός
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
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <Th>ΑΦΜ</Th>
                    <Th>Επωνυμία</Th>
                    <Th>Κλάδος</Th>
                    <Th>ΚΑΔ Περιγραφή</Th>
                    <Th>Περιοχή</Th>
                    <Th>Περιφέρεια</Th>
                    <Th>Εμπλουτισμός</Th>
                    <Th>Ταίριασμα</Th>
                    <Th>Ανάθεση</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {businesses.length === 0 ? (
                    <TableRow>
                      <Td colSpan={9} className="text-center text-gray-400 py-10">
                        Δεν βρέθηκαν επιχειρήσεις ΓΕΜΗ
                      </Td>
                    </TableRow>
                  ) : (
                    businesses.map(b => {
                      const kad = getPrimaryKad(b.activities)
                      const regn = getRegionFromZip(b.postalZipCode)
                      return (
                        <TableRow key={b.id} className="hover:bg-amber-50/40 transition-colors">
                          <Td>
                            <a href={`/gemi/businesses/${b.id}`} className="font-mono text-amber-800 hover:text-amber-600 hover:underline font-medium text-xs">
                              {b.afm}
                            </a>
                          </Td>
                          <Td className="max-w-[200px]">
                            <a href={`/gemi/businesses/${b.id}`} className="hover:text-amber-700 hover:underline font-medium text-gray-800 text-sm leading-tight block truncate">
                              {b.onomasia || <span className="text-gray-400">—</span>}
                            </a>
                          </Td>
                          <Td>
                            <CategoryChip cat={b.category} />
                          </Td>
                          <Td className="max-w-[200px]">
                            {kad ? (
                              <span className="text-xs text-gray-600 block truncate" title={kad.descr}>
                                <span className="font-mono text-gray-400 mr-1">{kad.code}</span>
                                {kad.descr}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </Td>
                          <Td className="text-xs text-gray-600 max-w-[130px] truncate">
                            {b.postalAreaDescription || <span className="text-gray-300">—</span>}
                          </Td>
                          <Td className="text-xs text-gray-600 whitespace-nowrap">
                            {regn || <span className="text-gray-300">—</span>}
                          </Td>
                          <Td>
                            {b.aadeEnriched ? (
                              <Badge variant="success" className="text-xs">✓</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">⏳</Badge>
                            )}
                          </Td>
                          <Td>
                            {b.matchingDone ? (
                              <Badge variant="success" className="text-xs">✓</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">⏳</Badge>
                            )}
                          </Td>
                          <Td>
                            {b.claimed ? (
                              <div>
                                <Badge variant="purple" className="text-xs">Ανατεθειμένη</Badge>
                                {b.claimedBy && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[120px]">{b.claimedBy}</p>}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </Td>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
          </>
        )}
      </div>

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            fetchData()
            fetch('/api/gemi/businesses/batches').then(r => r.json()).then(d => Array.isArray(d) && setBatches(d)).catch(() => {})
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
