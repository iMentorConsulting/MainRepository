'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getYoutubeId } from '@/components/programs/video-urls-input'
import { MatchCard } from '@/components/matching/match-card'
import { ArrowLeft, Zap, Calendar, Tag, ExternalLink, Archive, Trash2, Bell, Paperclip, X, Users, Building2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { GREEK_REGIONS } from '@/lib/greek-regions'
import { LEGAL_FORMS } from '@/lib/legal-forms'
import { parseRequirementsList } from '@/lib/requirements-list'
import { EligibilityQuestionsEditor } from '@/components/programs/eligibility-questions-editor'

function formatEuro(value: number | null | undefined) {
  if (value === null || value === undefined) return null
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

const categoryLabel: Record<string, string> = {
  ESPA: 'ΕΣΠΑ', DYPA: 'ΔΥΠΑ', MICROCREDITS: 'Μικροπιστώσεις', EXTRAJUDICIAL: 'Εξωδικαστικός Μηχανισμός', RENOVATION: 'Ανακαίνιση', OTHER: 'Άλλο',
}

export default function ProgramDetailPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const router = useRouter()
  const [program, setProgram] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [pendingNotifications, setPendingNotifications] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})
  const [diagnoseAfm, setDiagnoseAfm] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnoseError, setDiagnoseError] = useState('')
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null)
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch(`/api/programs/${id}`)
      .then(r => r.json())
      .then(setProgram)
      .finally(() => setLoading(false))
    fetch(`/api/programs/${id}/notify`)
      .then(r => r.json())
      .then(d => setPendingNotifications(d.pending ?? 0))
      .catch(() => {})
    fetch('/api/admin/criteria')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {}
          for (const c of data) map[c.id] = c.label
          setCriteriaMap(map)
        }
      })
      .catch(() => {})
  }, [id])

  async function toggleArchive() {
    setArchiving(true)
    await fetch(`/api/programs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !program.archived }),
    })
    setProgram((p: any) => ({ ...p, archived: !p.archived }))
    setArchiving(false)
  }

  async function handleDelete() {
    if (!confirm(`Διαγραφή προγράμματος «${program.title}»;\n\nΘα διαγραφούν και όλα τα matches. Αυτή η ενέργεια δεν αναιρείται.`)) return
    setDeleting(true)
    const res = await fetch(`/api/programs/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/programs')
    else setDeleting(false)
  }

  async function runMatching() {
    setRunning(true)
    const res = await fetch(`/api/programs/${id}/match`, { method: 'POST' })
    const data = await res.json()
    const [updated, notifyData] = await Promise.all([
      fetch(`/api/programs/${id}`).then(r => r.json()),
      fetch(`/api/programs/${id}/notify`).then(r => r.json()),
    ])
    setProgram(updated)
    setPendingNotifications(notifyData.pending ?? 0)
    alert(`Βρέθηκαν ${data.count} νέα matches! Μπορείτε τώρα να στείλετε ειδοποιήσεις στους λογιστές.`)
    setRunning(false)
  }

  async function openNotifyPreview() {
    setPreviewLoading(true)
    setShowPreview(true)
    setPreviewData(null)
    const res = await fetch(`/api/programs/${id}/notify?preview=true`)
    const data = await res.json()
    setPreviewData(data)
    // Pre-select accountant match IDs; direct matches are always included automatically
    const acctIds = new Set<string>(
      (data.accountants ?? []).flatMap((a: any) => a.businesses.map((b: any) => b.matchId))
    )
    setSelectedMatchIds(acctIds)
    setPreviewLoading(false)
  }

  function toggleMatch(matchId: string) {
    setSelectedMatchIds(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  function toggleAccountant(acct: any) {
    const ids = acct.businesses.map((b: any) => b.matchId)
    const allSelected = ids.every((id: string) => selectedMatchIds.has(id))
    setSelectedMatchIds(prev => {
      const next = new Set(prev)
      ids.forEach((id: string) => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  async function sendNotifications() {
    setNotifying(true)
    const directIds = (previewData?.directBusinesses ?? []).map((b: any) => b.matchId)
    const res = await fetch(`/api/programs/${id}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchIds: [...Array.from(selectedMatchIds), ...directIds] }),
    })
    const data = await res.json()
    setPendingNotifications(0)
    setShowPreview(false)
    setPreviewData(null)
    const directMsg = data.directNotified > 0
      ? ` (${data.directNotified} απευθείας πελάτες I-MENTOR — εσωτερικό email)`
      : ''
    alert(`Εστάλησαν ειδοποιήσεις για ${data.notified} matches σε ${data.accountants} λογιστές.${directMsg}`)
    setNotifying(false)
  }

  async function runDiagnosis() {
    if (!diagnoseAfm.trim()) return
    setDiagnosing(true)
    setDiagnoseError('')
    setDiagnoseResult(null)
    try {
      const res = await fetch(`/api/programs/${id}/diagnose?afm=${encodeURIComponent(diagnoseAfm.trim())}`)
      const data = await res.json()
      if (!res.ok) setDiagnoseError(data.error || 'Σφάλμα ελέγχου')
      else setDiagnoseResult(data)
    } catch {
      setDiagnoseError('Σφάλμα ελέγχου')
    } finally {
      setDiagnosing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )
  if (!program) return <div className="text-center text-gray-500">Δεν βρέθηκε πρόγραμμα</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/programs">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{program.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="default">{categoryLabel[program.category] || program.category}</Badge>
            <Badge variant={program.active ? 'success' : 'secondary'}>{program.active ? 'Ενεργό' : 'Ανενεργό'}</Badge>
            {program.archived && <Badge variant="secondary">Αρχειοθετημένο</Badge>}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={runMatching} loading={running} variant="outline">
              <Zap size={16} className="mr-1" />
              Matching
            </Button>
            {pendingNotifications !== null && pendingNotifications > 0 && (
              <Button onClick={openNotifyPreview} loading={previewLoading} variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 relative">
                <Bell size={15} className="mr-1" />
                Αποστολή Ειδοποιήσεων
                <span className="ml-1.5 bg-green-600 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{pendingNotifications}</span>
              </Button>
            )}
            <Link href={`/programs/${id}/edit`}>
              <Button variant="outline">Επεξεργασία</Button>
            </Link>
            <Button onClick={toggleArchive} loading={archiving} variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50">
              <Archive size={15} className="mr-1" />
              {program.archived ? 'Αναίρεση Αρχειοθέτησης' : 'Αρχειοθέτηση'}
            </Button>
            <Button onClick={handleDelete} loading={deleting} variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 size={15} className="mr-1" />
              Διαγραφή
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {program.description && (
            <Card>
              <CardHeader><CardTitle>Περιγραφή</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-gray-700 leading-relaxed">{program.description}</p></CardContent>
            </Card>
          )}

          {(program.minInvestment != null || program.maxInvestment != null || program.minSubsidyPct != null || program.maxSubsidyPct != null || program.minInterestRate != null || program.maxInterestRate != null || program.otherRequirements || program.websiteUrl || program.regionRules?.length > 0 || program.minRegdate || program.maxRegdate) && (
            <Card>
              <CardHeader><CardTitle>Στοιχεία Προγράμματος</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {program.regionRules?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Περιοχές</div>
                    <div className="flex flex-wrap gap-1.5">
                      {program.regionRules.length >= GREEK_REGIONS.length ? (
                        <Badge variant="secondary">Όλη η Ελλάδα</Badge>
                      ) : (
                        program.regionRules.map((r: string) => (
                          <Badge key={r} variant="secondary">{r}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {(program.minRegdate || program.maxRegdate) && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Ημερομηνία Έναρξης Επιχείρησης</div>
                    <span className="text-sm text-gray-700">
                      {program.minRegdate ? formatDate(program.minRegdate) : '...'} — {program.maxRegdate ? formatDate(program.maxRegdate) : '...'}
                    </span>
                  </div>
                )}
                {(program.minInvestment != null || program.maxInvestment != null) && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Ποσό Επένδυσης</div>
                    <span className="text-sm text-gray-700">
                      {program.minInvestment != null ? formatEuro(program.minInvestment) : '...'}
                      {' — '}
                      {program.maxInvestment != null ? formatEuro(program.maxInvestment) : '...'}
                    </span>
                  </div>
                )}
                {((program.minSubsidyPct != null && program.minSubsidyPct !== 0) || (program.maxSubsidyPct != null && program.maxSubsidyPct !== 0)) && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">% Επιχορήγησης</div>
                    <span className="text-sm font-semibold text-blue-700">
                      {program.minSubsidyPct != null && program.maxSubsidyPct != null
                        ? `${program.minSubsidyPct}% — ${program.maxSubsidyPct}%`
                        : program.minSubsidyPct != null
                        ? `από ${program.minSubsidyPct}%`
                        : `έως ${program.maxSubsidyPct}%`}
                    </span>
                  </div>
                )}
                {((program.minInterestRate != null && program.minInterestRate !== 0) || (program.maxInterestRate != null && program.maxInterestRate !== 0)) && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Επιτόκιο</div>
                    <span className="text-sm font-semibold text-amber-700">
                      {program.minInterestRate != null && program.maxInterestRate != null
                        ? `${program.minInterestRate}% — ${program.maxInterestRate}%`
                        : program.minInterestRate != null
                        ? `από ${program.minInterestRate}%`
                        : `έως ${program.maxInterestRate}%`}
                    </span>
                  </div>
                )}
                {program.otherRequirements && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Άλλες Προϋποθέσεις</div>
                    <ol className="text-sm text-gray-700 leading-relaxed list-decimal list-outside pl-5 space-y-1">
                      {parseRequirementsList(program.otherRequirements).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {program.extraCriteriaIds?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Πρόσθετες Προϋποθέσεις</div>
                    <div className="flex flex-wrap gap-1.5">
                      {program.extraCriteriaIds.map((cid: string) => (
                        <Badge key={cid} variant="secondary">{criteriaMap[cid] || cid}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {program.websiteUrl && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Σελίδα στο Website μας</div>
                    <a href={program.websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
                      {program.websiteUrl}
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Κριτήρια Επιλεξιμότητας</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {program.kadRules?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">ΚΑΔ</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.kadRules.map((r: string) => (
                      <span key={r} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {program.excludedLegalForms?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Εξαιρούμενες Νομικές Μορφές</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.excludedLegalForms.map((r: string) => (
                      <Badge key={r} variant="danger">{LEGAL_FORMS.find(f => f.value === r)?.label || r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {!program.kadRules?.length && !program.excludedLegalForms?.length && (
                <p className="text-sm text-gray-400 italic">Χωρίς ειδικά κριτήρια — γενικό πρόγραμμα</p>
              )}
              {program.excludeTags?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Φίλτρα Εξαίρεσης (Tags)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.excludeTags.map((r: string) => (
                      <Badge key={r} variant="danger">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {program.requireTags?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Υποχρεωτικά Tags (Matching)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.requireTags.map((r: string) => (
                      <Badge key={r} variant="success">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Πληροφορίες</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Υποβολή Αιτήσεων από</span>
                <span>{formatDate(program.startDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Προθεσμία Υποβολής Αιτήσεων</span>
                <span>{formatDate(program.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Matches Προγράμματος με Πελάτες</span>
                <span className="font-semibold">{program._count?.matches ?? program.matches?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Καμπάνιες Προγράμματος</span>
                <span>{program.campaigns?.length || 0}</span>
              </div>
            </CardContent>
          </Card>

          {program.internalNotes && isAdmin && (
            <Card>
              <CardHeader><CardTitle>Εσωτερικές Σημειώσεις</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-gray-700">{program.internalNotes}</p></CardContent>
            </Card>
          )}

          {isAdmin && <EligibilityQuestionsEditor programId={program.id} />}

          {program.attachmentUrls?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Σχετικά Αρχεία</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {program.attachmentUrls.map((url: string, i: number) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
                        <Paperclip size={13} />
                        {program.attachmentNames?.[i] || `Σχετικό αρχείο ${i + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {program.videoUrls?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Βίντεο Παρουσίασης</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {program.videoUrls.map((url: string, i: number) => {
                    const videoId = getYoutubeId(url)
                    if (!videoId) return null
                    return (
                      <div key={i} className="aspect-[9/16] rounded-lg overflow-hidden bg-black">
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}`}
                          title={`Βίντεο ${i + 1}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        />
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matched Επιχειρήσεις ({program._count?.matches ?? program.matches?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {program.matches?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {program.matches.map((m: any) => (
                <MatchCard
                  key={m.id}
                  businessName={m.business?.onomasia || ''}
                  afm={m.business?.afm || ''}
                  programTitle={program.title}
                  matchScore={m.matchScore}
                  matchReason={m.matchReason}
                  status={m.status}
                  accountantName={m.business?.accountant?.officeName}
                  extraCriteria={(program.extraCriteriaIds || []).map((cid: string) => criteriaMap[cid] || cid)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Zap size={32} className="mx-auto mb-2 opacity-30" />
              <p>Δεν υπάρχουν matches ακόμη.</p>
              {isAdmin && <p className="text-sm">Πατήστε "Εκτέλεση Matching" για να τρέξετε τον αλγόριθμο.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Έλεγχος Επιλεξιμότητας Επιχείρησης</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-2">Δώστε το ΑΦΜ μιας επιχείρησης που δεν εμφανίζεται στα matches, για να δείτε ποιο ακριβώς κριτήριο την αποκλείει.</p>
            <div className="flex gap-2">
              <input
                value={diagnoseAfm}
                onChange={e => setDiagnoseAfm(e.target.value)}
                placeholder="ΑΦΜ"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48"
              />
              <Button variant="outline" loading={diagnosing} onClick={runDiagnosis}>Έλεγχος</Button>
            </div>
            {diagnoseError && <p className="text-sm text-red-600 mt-2">{diagnoseError}</p>}
            {diagnoseResult && (
              <div className="mt-3 space-y-1.5">
                <p className="text-sm font-medium text-gray-700">
                  {diagnoseResult.business.onomasia} (ΑΦΜ {diagnoseResult.business.afm}) —{' '}
                  <span className={diagnoseResult.overall ? 'text-emerald-700' : 'text-red-700'}>
                    {diagnoseResult.overall ? 'Πληροί όλα τα κριτήρια' : 'Δεν πληροί κάποιο κριτήριο'}
                  </span>
                </p>
                {diagnoseResult.results.map((r: any, i: number) => (
                  <div key={i} className={`text-sm rounded-md px-3 py-1.5 ${r.pass ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    <span className="font-medium">{r.criterion}:</span> {r.detail}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notify preview modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Bell size={18} className="text-green-600" />
                  Προεπισκόπηση Ειδοποιήσεων
                </h2>
                {previewData && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {previewData.pending} matches → {previewData.accountants?.length ?? 0} λογιστές
                    {previewData.directBusinesses?.length > 0 && ` + ${previewData.directBusinesses.length} απευθείας πελάτες`}
                  </p>
                )}
              </div>
              <button onClick={() => { setShowPreview(false); setPreviewData(null) }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
                </div>
              ) : previewData ? (
                <>
                  {previewData.accountants?.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Users size={13} /> Λογιστές
                      </h3>
                      {previewData.accountants.map((acct: any) => {
                        const acctMatchIds = acct.businesses.map((b: any) => b.matchId)
                        const allChecked = acctMatchIds.every((mid: string) => selectedMatchIds.has(mid))
                        const someChecked = acctMatchIds.some((mid: string) => selectedMatchIds.has(mid))
                        const selectedCount = acctMatchIds.filter((mid: string) => selectedMatchIds.has(mid)).length
                        return (
                          <div key={acct.id} className="border border-slate-200 rounded-xl p-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                                onChange={() => toggleAccountant(acct)}
                                className="mt-0.5 cursor-pointer accent-indigo-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium text-slate-800 text-sm">{acct.officeName}</p>
                                  <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                    {selectedCount}/{acct.businesses.length} πελάτ{acct.businesses.length === 1 ? 'ης' : 'ες'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">{acct.contactPerson} · {acct.email}</p>
                                <ul className="mt-2 space-y-1">
                                  {acct.businesses.map((b: any) => (
                                    <li key={b.id} className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={selectedMatchIds.has(b.matchId)}
                                        onChange={() => toggleMatch(b.matchId)}
                                        className="cursor-pointer accent-indigo-600 flex-shrink-0"
                                      />
                                      <Link href={`/businesses/${b.id}`} target="_blank"
                                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1 min-w-0">
                                        <Building2 size={11} className="flex-shrink-0" />
                                        <span className="truncate">{b.onomasia || '—'}</span>
                                        <span className="text-slate-400 font-mono flex-shrink-0">({b.afm})</span>
                                        <ExternalLink size={10} className="flex-shrink-0 text-slate-400" />
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {previewData.directBusinesses?.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 size={13} /> Απευθείας πελάτες I-MENTOR — αυτόματη αποστολή
                      </h3>
                      <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-1">
                        <p className="text-xs text-amber-700 mb-2 font-medium">Εσωτερικό email στην ομάδα I-MENTOR — στέλνεται αυτόματα χωρίς επιλογή.</p>
                        {previewData.directBusinesses.map((b: any) => (
                          <div key={b.id} className="flex items-center gap-2">
                            <span className="text-amber-500 flex-shrink-0 text-xs">✓</span>
                            <Link href={`/businesses/${b.id}`} target="_blank"
                              className="text-xs text-amber-800 hover:underline flex items-center gap-1 min-w-0">
                              <Building2 size={11} className="flex-shrink-0" />
                              <span className="truncate">{b.onomasia || '—'}</span>
                              <span className="font-mono flex-shrink-0">({b.afm})</span>
                              <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewData.pending === 0 && (
                    <p className="text-center text-slate-400 py-8 text-sm">Δεν υπάρχουν εκκρεμείς ειδοποιήσεις.</p>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {selectedMatchIds.size} λογιστές επιλεγμένοι
                {(previewData?.directBusinesses?.length ?? 0) > 0 && ` + ${previewData.directBusinesses.length} αυτόματα`}
              </p>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => { setShowPreview(false); setPreviewData(null) }}>Ακύρωση</Button>
                <Button
                  onClick={sendNotifications}
                  loading={notifying}
                  disabled={!previewData || selectedMatchIds.size === 0}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Bell size={14} className="mr-1.5" />
                  Αποστολή σε {selectedMatchIds.size} matches
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
