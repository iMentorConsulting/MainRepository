'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { MultiSelect } from '@/components/ui/multi-select'
import { Search, Upload, X, RefreshCw, Link2, Trash2, Send, Zap, Tag } from 'lucide-react'

interface GemiTemplate {
  id: string
  label: string
  subject: string
  htmlContent: string
}

interface TagOption {
  id: string
  label: string
}

const PAGE_SIZE = 50

interface GemiBusiness {
  id: string
  afm: string
  onomasia: string | null
  email: string | null
  phone: string | null
  importBatch: string | null
  createdAt: string
  aadeEnriched: boolean
  matchingDone: boolean
  claimed: boolean
  claimedBy?: string | null
  claimedAt?: string | null
  category?: string | null
  activities?: any[]
  tags?: string[]
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

function deriveCategoryFromKad(code: string | null | undefined): string | null {
  if (!code) return null
  const digits = code.replace(/\D/g, '')
  if (digits.length < 2) return null
  const n = parseInt(digits.slice(0, 2), 10)
  if (isNaN(n)) return null
  if (n === 55) return 'ΤΟΥΡΙΣΜΟΣ'
  if (n === 56) return 'ΕΣΤΙΑΣΗ'
  if (n >= 45 && n <= 47) return 'ΕΜΠΟΡΙΟ'
  if (n >= 1 && n <= 3) return 'ΑΓΡΟΤΙΚΑ'
  if (n >= 10 && n <= 33) return 'ΜΕΤΑΠΟΙΗΣΗ'
  return 'ΥΠΗΡΕΣΙΕΣ'
}

function getCategory(b: GemiBusiness): string | null {
  if (b.category) return b.category
  const kad = getPrimaryKad(b.activities)
  return deriveCategoryFromKad(kad?.code ?? null)
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
    if (!session || !['ADMIN', 'CONSULTANT'].includes((session.user as any)?.role)) {
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
  const [emailEngagement, setEmailEngagement] = useState('')
  const [kadCodes, setKadCodes] = useState<string[]>([])
  const [tagsFilter, setTagsFilter] = useState<string[]>([])

  const [kadOptions, setKadOptions] = useState<{ code: string; descr: string }[]>([])
  const [tagOptions, setTagOptions] = useState<TagOption[]>([])

  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [matching, setMatching] = useState(false)
  const [rematchingSelected, setRematchingSelected] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // Quick Send state
  const [programs, setPrograms] = useState<any[]>([])
  const [templates, setTemplates] = useState<GemiTemplate[]>([])
  const [quickProgramId, setQuickProgramId] = useState('')
  const [quickTemplateId, setQuickTemplateId] = useState('')
  const [quickSending, setQuickSending] = useState(false)

  // Bulk tag state
  const [bulkTag, setBulkTag] = useState('')
  const [bulkTagging, setBulkTagging] = useState(false)

  const requestSeq = useRef(0)

  // Fetch static options on mount
  useEffect(() => {
    fetch('/api/gemi/businesses/batches')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setBatches(d))
      .catch(() => {})
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : (d.programs || [])))
      .catch(() => {})
    fetch('/api/gemi/templates')
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {})
    fetch('/api/gemi/businesses/kad-options')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setKadOptions(d))
      .catch(() => {})
    fetch('/api/admin/tags')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setTagOptions(d))
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
    if (emailEngagement) params.set('emailEngagement', emailEngagement)
    kadCodes.forEach(code => params.append('kadCodes', code))
    tagsFilter.forEach(tag => params.append('tags', tag))
    try {
      const res = await fetch(`/api/gemi/businesses?${params}`)
      const data = await res.json()
      if (seq !== requestSeq.current) return
      setBusinesses(data.businesses || [])
      setTotal(data.total || 0)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [page, search, aadeEnriched, matchingDone, claimed, importBatch, region, category, hasCampaign, active, emailEngagement, kadCodes, tagsFilter])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [search, aadeEnriched, matchingDone, claimed, importBatch, region, category, hasCampaign, active, emailEngagement, kadCodes, tagsFilter])

  function handleSearch() { setSearch(searchInput) }

  async function handleEnrich(forceRetry = false) {
    setEnriching(true)
    let totalEnriched = 0
    let totalErrors = 0
    try {
      // Loop batches of 100 until nothing is left pending. Only records with
      // aadeEnriched=false are processed — already-enriched ones are never
      // re-queried, so this is safe to run any time after importing new CSVs.
      for (let round = 0; round < 200; round++) {
        const res = await fetch('/api/gemi/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 100, ...(forceRetry ? { forceRetry: true } : {}) }),
        })
        const data = await res.json()
        if (!res.ok) {
          setToast(data.error || 'Σφάλμα εμπλουτισμού')
          return
        }
        totalEnriched += data.enriched ?? 0
        totalErrors += data.errors ?? 0
        const remaining = data.remaining ?? 0
        if (data.monthlyLimitExceeded) {
          setToast(`⚠️ Μηνιαίο όριο ΑΑΔΕ εξαντλήθηκε — εμπλουτίστηκαν ${totalEnriched}. Το όριο ανανεώνεται την 1η του μήνα.`)
          fetchData()
          return
        }
        setToast(`Εμπλουτισμός ΑΑΔΕ: ${totalEnriched} εμπλουτίστηκαν${totalErrors ? `, ${totalErrors} σφάλματα` : ''} — απομένουν ${remaining}...`)
        if (remaining === 0 || (data.processed ?? 0) === 0) break
      }
      setToast(`Εμπλουτισμός ΑΑΔΕ ολοκληρώθηκε: ${totalEnriched} εμπλουτίστηκαν${totalErrors ? `, ${totalErrors} σφάλματα` : ''}`)
      fetchData()
      // Refresh batches too
      fetch('/api/gemi/businesses/batches').then(r => r.json()).then(d => Array.isArray(d) && setBatches(d)).catch(() => {})
    } catch {
      setToast(`Σφάλμα δικτύου — εμπλουτίστηκαν ${totalEnriched} μέχρι τώρα. Πατήστε ξανά για συνέχεια.`)
    } finally {
      setEnriching(false)
    }
  }

  async function handleBackfillCategories() {
    setBackfilling(true)
    try {
      const res = await fetch('/api/gemi/backfill-categories', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToast(`Κλάδος: ${data.updated ?? 0} εγγραφές ενημερώθηκαν`)
        fetchData()
      } else {
        setToast(data.error || 'Σφάλμα')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setBackfilling(false)
    }
  }

  async function handleMatch(rematchAll = false) {
    if (rematchAll && !confirm('Επανα-ταίριασμα ΟΛΩΝ των εμπλουτισμένων επιχειρήσεων με τα τρέχοντα κριτήρια προγραμμάτων; Τα ξεπερασμένα ταιριάσματα θα αφαιρεθούν.')) return
    setMatching(true)
    let totalProcessed = 0
    let totalMatches = 0
    try {
      // Loop batches of 200 until every enriched business has been matched.
      // Only aadeEnriched && !matchingDone records are processed, so this is
      // safe to re-run any time — already-matched businesses are skipped.
      // With rematchAll, the first call resets matchingDone on everything.
      for (let round = 0; round < 200; round++) {
        const res = await fetch('/api/gemi/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 200, reset: rematchAll && round === 0 }),
        })
        const data = await res.json()
        if (!res.ok) {
          setToast(data.error || 'Σφάλμα ταιριάσματος')
          return
        }
        totalProcessed += data.processed ?? 0
        totalMatches += data.totalMatches ?? 0
        const remaining = data.remaining ?? 0
        setToast(`Ταίριασμα: ${totalProcessed} επιχειρήσεις, ${totalMatches} ταιριάσματα — απομένουν ${remaining}...`)
        if (remaining === 0 || (data.processed ?? 0) === 0) break
      }
      setToast(`Ταίριασμα ολοκληρώθηκε: ${totalProcessed} επιχειρήσεις, ${totalMatches} ταιριάσματα`)
      fetchData()
    } catch {
      setToast(`Σφάλμα δικτύου — ${totalProcessed} επιχειρήσεις ταιριάστηκαν μέχρι τώρα. Πατήστε ξανά για συνέχεια.`)
    } finally {
      setMatching(false)
    }
  }

  async function handleRematchSelected() {
    if (selected.size === 0) return
    setRematchingSelected(true)
    try {
      const res = await fetch('/api/gemi/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      const data = await res.json()
      if (res.ok) {
        setToast(`Ταίριασμα ${data.processed} επιχειρήσεων: ${data.totalMatches} ταιριάσματα`)
        fetchData()
      } else {
        setToast(data.error || 'Σφάλμα ταιριάσματος')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setRematchingSelected(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === businesses.length && businesses.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(businesses.map(b => b.id)))
    }
  }

  async function handleDeleteBatch() {
    if (!importBatch) return
    if (!confirm(`Διαγραφή ΟΛΟΚΛΗΡΗΣ της παρτίδας «${importBatch}»;\n\nΘα διαγραφούν ΟΛΕΣ οι επιχειρήσεις της παρτίδας (μαζί με ταιριάσματα και ιστορικό καμπανιών τους). Η ενέργεια ΔΕΝ αναιρείται.`)) return
    if (!confirm(`Τελική επιβεβαίωση: διαγραφή παρτίδας «${importBatch}»;`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/gemi/businesses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importBatch }),
      })
      const data = await res.json()
      if (res.ok) {
        setToast(`Διαγράφηκε η παρτίδα «${importBatch}» — ${data.deleted} επιχειρήσεις`)
        setImportBatch('')
        setSelected(new Set())
        fetchData()
        fetch('/api/gemi/businesses/batches').then(r => r.json()).then(d => Array.isArray(d) && setBatches(d)).catch(() => {})
      } else {
        setToast(data.error || 'Σφάλμα διαγραφής παρτίδας')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setDeleting(false)
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Διαγραφή ${selected.size} επιχειρήσεων; Η ενέργεια δεν αναιρείται.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/gemi/businesses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      const data = await res.json()
      if (res.ok) {
        setToast(`Διαγράφηκαν ${data.deleted} επιχειρήσεις`)
        setSelected(new Set())
        fetchData()
      } else {
        setToast(data.error || 'Σφάλμα διαγραφής')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setDeleting(false)
    }
  }

  async function handleBulkTag(action: 'add' | 'remove') {
    if (!bulkTag || selected.size === 0) return
    setBulkTagging(true)
    try {
      const res = await fetch('/api/gemi/businesses/bulk-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), tag: bulkTag, action }),
      })
      if (res.ok) {
        setToast(`${action === 'add' ? 'Προστέθηκε' : 'Αφαιρέθηκε'} ετικέτα "${bulkTag}" σε ${selected.size} επιχειρήσεις`)
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        setToast(err.error || 'Σφάλμα')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setBulkTagging(false)
    }
  }

  async function handleQuickSend() {
    if (selected.size === 0) return
    if (!quickTemplateId) { setToast('Επιλέξτε πρότυπο email.'); return }
    const tpl = templates.find(t => t.id === quickTemplateId)
    if (!tpl) return
    if (!window.confirm(`Γρήγορη Αποστολή email σε ${selected.size} επιλεγμένες επιχειρήσεις;`)) return
    setQuickSending(true)
    try {
      const createRes = await fetch('/api/gemi/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Γρήγορη Αποστολή — ${tpl.label} (${new Date().toLocaleDateString('el-GR')})`,
          channel: 'EMAIL',
          programId: quickProgramId || undefined,
          subject: tpl.subject,
          htmlContent: tpl.htmlContent,
          status: 'DRAFT',
          targetGemiIds: Array.from(selected),
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        setToast(err.error || 'Σφάλμα δημιουργίας καμπάνιας'); return
      }
      const campaign = await createRes.json()
      const sendRes = await fetch(`/api/gemi/campaigns/${campaign.id}/send`, { method: 'POST' })
      if (sendRes.ok) {
        setToast(`Η αποστολή σε ${selected.size} επιχειρήσεις ξεκίνησε.`)
        setSelected(new Set())
      } else {
        const err = await sendRes.json().catch(() => ({}))
        setToast(err.error || 'Σφάλμα αποστολής')
      }
    } catch {
      setToast('Σφάλμα δικτύου')
    } finally {
      setQuickSending(false)
    }
  }

  const hasFilters = !!(search || aadeEnriched || matchingDone || claimed || importBatch || region || category || hasCampaign || active || emailEngagement || kadCodes.length || tagsFilter.length)

  function clearFilters() {
    setSearch(''); setSearchInput('')
    setAadeEnriched(''); setMatchingDone(''); setClaimed('')
    setImportBatch(''); setRegion(''); setCategory(''); setHasCampaign(''); setActive('')
    setEmailEngagement(''); setKadCodes([]); setTagsFilter([])
  }

  if (status === 'loading' || (status === 'authenticated' && !['ADMIN', 'CONSULTANT'].includes((session?.user as any)?.role))) {
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
          <Button variant="outline" size="sm" onClick={() => handleEnrich(false)} loading={enriching} className="border-blue-300 text-blue-700 hover:bg-blue-50">
            <RefreshCw size={14} className="mr-1.5" />Εμπλουτισμός ΑΑΔΕ
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleEnrich(true)} loading={enriching} className="border-orange-300 text-orange-700 hover:bg-orange-50" title="Επαναπροσπάθεια και για εγγραφές που απέτυχαν πρόσφατα (π.χ. μετά από αλλαγή κωδικών ΑΑΔΕ)">
            <RefreshCw size={14} className="mr-1.5" />Εμπλουτισμός (Force)
          </Button>
          <Button variant="outline" size="sm" onClick={handleBackfillCategories} loading={backfilling} className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <RefreshCw size={14} className="mr-1.5" />Συμπλήρωση Κλάδου
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleMatch(false)} loading={matching} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            <Link2 size={14} className="mr-1.5" />Εκτέλεση Ταιριάσματος
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleMatch(true)} loading={matching} className="border-purple-300 text-purple-700 hover:bg-purple-50">
            <RefreshCw size={14} className="mr-1.5" />Επανα-ταίριασμα Όλων
          </Button>
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={handleRematchSelected} loading={rematchingSelected} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Zap size={14} className="mr-1.5" />Ταίριασμα Επιλεγμένων ({selected.size})
              </Button>
              <Button size="sm" onClick={handleBulkDelete} loading={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                <Trash2 size={14} className="mr-1.5" />Διαγραφή ({selected.size})
              </Button>
            </>
          )}
          {importBatch && (
            <Button size="sm" onClick={handleDeleteBatch} loading={deleting} className="bg-red-700 hover:bg-red-800 text-white">
              <Trash2 size={14} className="mr-1.5" />Διαγραφή Παρτίδας «{importBatch}» ({total})
            </Button>
          )}
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

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Email Engagement</label>
              <select value={emailEngagement} onChange={e => setEmailEngagement(e.target.value)} className={selectCls}>
                <option value="">Όλες</option>
                <option value="opened">Άνοιξε email</option>
                <option value="not_opened">Δεν άνοιξε (εστάλη)</option>
                <option value="clicked">Έκανε κλικ</option>
                <option value="bounced">Bounce</option>
                <option value="unsubscribed">Διαγράφηκε</option>
              </select>
            </div>

            {kadOptions.length > 0 && (
              <MultiSelect
                label="ΚΑΔ"
                options={kadOptions.map(k => ({ value: k.code, label: `${k.code} — ${k.descr}` }))}
                selected={kadCodes}
                onChange={setKadCodes}
                placeholder="Όλοι οι ΚΑΔ"
                searchable
              />
            )}

            {tagOptions.length > 0 && (
              <MultiSelect
                label="Ετικέτα"
                options={tagOptions.map(t => ({ value: t.label, label: t.label }))}
                selected={tagsFilter}
                onChange={setTagsFilter}
                placeholder="Όλες"
              />
            )}

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
                    <Th className="w-8">
                      <input
                        type="checkbox"
                        checked={businesses.length > 0 && selected.size === businesses.length}
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < businesses.length }}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                    </Th>
                    <Th>ΑΦΜ</Th>
                    <Th>Επωνυμία</Th>
                    <Th>Κλάδος</Th>
                    <Th>ΚΑΔ Περιγραφή</Th>
                    <Th>Περιοχή</Th>
                    <Th>Περιφέρεια</Th>
                    <Th>Εμπλουτισμός</Th>
                    <Th>Ταίριασμα</Th>
                    <Th>Ανάθεση</Th>
                    <Th>Ετικέτες</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {businesses.length === 0 ? (
                    <TableRow>
                      <Td colSpan={11} className="text-center text-gray-400 py-10">
                        Δεν βρέθηκαν επιχειρήσεις ΓΕΜΗ
                      </Td>
                    </TableRow>
                  ) : (
                    businesses.map(b => {
                      const kad = getPrimaryKad(b.activities)
                      const regn = getRegionFromZip(b.postalZipCode)
                      return (
                        <TableRow key={b.id} className={`hover:bg-amber-50/40 transition-colors ${selected.has(b.id) ? 'bg-amber-50' : ''}`}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={selected.has(b.id)}
                              onChange={() => toggleSelect(b.id)}
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                          </Td>
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
                            <CategoryChip cat={getCategory(b)} />
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
                          <Td className="max-w-[160px]">
                            {b.tags && b.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {b.tags.map(tag => (
                                  <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-violet-100 text-violet-800 whitespace-nowrap">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
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

      {/* Floating bulk-action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-indigo-200 shadow-2xl rounded-2xl px-5 py-4 flex flex-col gap-3 max-w-3xl w-full">
          {/* Row 1: header + quick send */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800 shrink-0">
              <Zap size={16} className="text-indigo-600" />
              {selected.size} επιλεγμένες
            </div>
            <select
              value={quickProgramId}
              onChange={e => setQuickProgramId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white flex-1 min-w-[140px]"
            >
              <option value="">— Χωρίς πρόγραμμα —</option>
              {programs.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <select
              value={quickTemplateId}
              onChange={e => setQuickTemplateId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white flex-1 min-w-[140px]"
            >
              <option value="">— Επιλέξτε πρότυπο —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <Button
              size="sm"
              loading={quickSending}
              disabled={!quickTemplateId}
              onClick={handleQuickSend}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
            >
              <Send size={14} className="mr-1.5" />Αποστολή
            </Button>
            <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-gray-600 shrink-0 ml-auto">
              <X size={18} />
            </button>
          </div>
          {/* Row 2: bulk tag */}
          {tagOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 shrink-0">
                <Tag size={13} />
                Ετικέτα:
              </div>
              <select
                value={bulkTag}
                onChange={e => setBulkTag(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white flex-1 min-w-[140px]"
              >
                <option value="">— Επιλέξτε ετικέτα —</option>
                {tagOptions.map(t => (
                  <option key={t.id} value={t.label}>{t.label}</option>
                ))}
              </select>
              <Button
                size="sm"
                loading={bulkTagging}
                disabled={!bulkTag}
                onClick={() => handleBulkTag('add')}
                className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              >
                + Προσθήκη
              </Button>
              <Button
                size="sm"
                loading={bulkTagging}
                disabled={!bulkTag}
                onClick={() => handleBulkTag('remove')}
                className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              >
                − Αφαίρεση
              </Button>
            </div>
          )}
        </div>
      )}

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
