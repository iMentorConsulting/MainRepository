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
import { ArrowLeft, Zap, Calendar, Tag, ExternalLink, Archive, Trash2, Bell, Paperclip } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { GREEK_REGIONS } from '@/lib/greek-regions'
import { LEGAL_FORMS } from '@/lib/legal-forms'

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
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})
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

  async function sendNotifications() {
    if (!confirm(`Αποστολή ειδοποιήσεων για ${pendingNotifications} matches σε λογιστές;\n\nΟι λογιστές θα λάβουν email και notification στην πλατφόρμα.`)) return
    setNotifying(true)
    const res = await fetch(`/api/programs/${id}/notify`, { method: 'POST' })
    const data = await res.json()
    setPendingNotifications(0)
    const directMsg = data.directNotified > 0
      ? `\n\n${data.directNotified} match${data.directNotified === 1 ? '' : 'es'} αφορ${data.directNotified === 1 ? 'ά' : 'ούν'} επιχειρήσεις χωρίς ανάθεση λογιστή — εστάλη εσωτερικό email στην ομάδα I-MENTOR για απευθείας επικοινωνία.`
      : ''
    alert(`Εστάλησαν ειδοποιήσεις για ${data.notified} matches σε ${data.accountants} λογιστές.${directMsg}`)
    setNotifying(false)
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
              <Button onClick={sendNotifications} loading={notifying} variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 relative">
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
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{program.otherRequirements}</p>
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
    </div>
  )
}
