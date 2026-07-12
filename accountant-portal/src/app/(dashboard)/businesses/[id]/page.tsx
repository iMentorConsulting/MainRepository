'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KadTable } from '@/components/businesses/kad-table'
import { MatchCard } from '@/components/matching/match-card'
import { QuickSendModal } from '@/components/quick-send-modal'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Edit, Send, Trash2, X as XIcon, Plus, Printer, ClipboardList, Scale, Database } from 'lucide-react'
import { NewCaseModal } from '@/components/cases/new-case-modal'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { formatDate } from '@/lib/utils'
import { ALL_CATEGORIES, getEffectiveCategory, categoryTag, CATEGORY_TAG_PREFIX } from '@/lib/business-categories'
import { CategoryBadge } from '@/components/businesses/category-badge'
import { resolveRegionFromZip } from '@/lib/greek-regions'

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  'accountant':      { label: 'Logistis (Λογιστής)', color: 'bg-indigo-100 text-indigo-800' },
  'finance-import':  { label: 'Finance Import', color: 'bg-amber-100 text-amber-800' },
  'ermis-lead':      { label: 'Ερμής (AI)', color: 'bg-purple-100 text-purple-800' },
  'case-management': { label: 'Case Management', color: 'bg-cyan-100 text-cyan-800' },
  'website-form':    { label: 'Φόρμα Ιστοσελίδας', color: 'bg-green-100 text-green-800' },
  'lead-form':       { label: 'Lead Form', color: 'bg-teal-100 text-teal-800' },
  'exodikastikos':   { label: 'Εξωδικαστικός', color: 'bg-rose-100 text-rose-800' },
}
function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  const meta = SOURCE_LABELS[source] ?? { label: source, color: 'bg-slate-100 text-slate-700' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
      <Database size={10} />
      {meta.label}
    </span>
  )
}

const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}
const CASE_STATUS_VARIANT: Record<string, any> = {
  NEW: 'info', ACCEPTED: 'purple', IN_PROGRESS: 'warning',
  WAITING_CLIENT: 'secondary', WAITING_ACCOUNTANT: 'secondary',
  COMPLETED: 'success', CANCELLED: 'danger',
}
const EXODIKASTIKOS_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}
const EXODIKASTIKOS_STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'info', IN_ASSESSMENT: 'warning', REPORT_READY: 'purple',
  OFFER_SENT: 'purple', ACCEPTED: 'success', DECLINED: 'danger', COMPLETED: 'success',
}

export default function BusinessDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [quickSend, setQuickSend] = useState(false)
  const [newCase, setNewCase] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [tagOptions, setTagOptions] = useState<{ id: string; label: string; active: boolean }[]>([])
  const [tagSelect, setTagSelect] = useState('')
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`/api/businesses/${id}`)
      .then(r => r.json())
      .then(data => {
        setBusiness(data)
        setNotes(data.notes || '')
      })
      .finally(() => setLoading(false))
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
    fetch('/api/admin/tags')
      .then(r => r.json())
      .then(data => setTagOptions(Array.isArray(data) ? data.filter((t: any) => t.active) : []))
      .catch(() => {})
  }, [id])

  async function saveTags(tags: string[]) {
    setBusiness((prev: any) => ({ ...prev, tags }))
    await fetch(`/api/businesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    })
  }

  function setCategory(category: string) {
    const otherTags = (business.tags || []).filter((t: string) => !t.startsWith(CATEGORY_TAG_PREFIX))
    saveTags(category ? [...otherTags, categoryTag(category as any)] : otherTags)
  }

  function addTag(tag: string) {
    const t = tag.trim()
    if (!t || (business.tags || []).includes(t)) return
    saveTags([...(business.tags || []), t])
  }

  function removeTag(tag: string) {
    saveTags((business.tags || []).filter((t: string) => t !== tag))
  }

  async function toggleExcludeFromCampaigns() {
    const next = !business.excludedFromCampaigns
    await fetch(`/api/businesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludedFromCampaigns: next }),
    })
    setBusiness((prev: any) => ({ ...prev, excludedFromCampaigns: next }))
  }

  async function handleDelete() {
    if (!confirm(`Διαγραφή της επιχείρησης "${business.onomasia || business.afm}"; Η ενέργεια δεν αναιρείται και θα διαγραφούν και τα ιστορικά μηνύματα.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/businesses/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/businesses')
      } else {
        alert('Σφάλμα διαγραφής')
      }
    } finally {
      setDeleting(false)
    }
  }

  async function saveNotes() {
    await fetch(`/api/businesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setBusiness((prev: any) => ({ ...prev, notes }))
    setEditNotes(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )
  if (!business) return <div className="text-center text-gray-500">Δεν βρέθηκε επιχείρηση</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/businesses">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{business.onomasia || 'Επιχείρηση'}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-mono text-gray-500 text-sm">ΑΦΜ: {business.afm}</span>
            {business.legalStatusDescr && (
              <Badge variant="secondary">{business.legalStatusDescr}</Badge>
            )}
            {(business.deactivationFlag === 'Y' || business.stopDate) && (
              <Badge variant="danger">Ανενεργή</Badge>
            )}
            <SourceBadge source={business.source} />
            <CategoryBadge category={getEffectiveCategory(business)} size="lg" />
            <select
              value={getEffectiveCategory(business) || ''}
              onChange={e => setCategory(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              title="Αλλαγή κλάδου"
            >
              <option value="">-</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {resolveRegionFromZip(business.postalZipCode) && (
              <Badge variant="info" className="flex items-center gap-1">
                <MapPin size={12} />
                {resolveRegionFromZip(business.postalZipCode)}
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => window.print()}
        >
          <Printer size={16} className="mr-2" />
          Εκτύπωση / PDF
        </Button>
        <Button
          onClick={() => setQuickSend(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          <Send size={15} />
          Γρήγορη Αποστολή
        </Button>
        <Button variant="outline" onClick={() => setNewCase(true)}>
          <ClipboardList size={16} className="mr-2" />
          Ανάθεση Επιχορήγησης
        </Button>
        <Link href={`/exodikastikos/new?businessId=${business.id}`}>
          <Button variant="outline">
            <Scale size={16} className="mr-2" />
            Ανάθεση Εξωδικαστικού
          </Button>
        </Link>
        <Link href={`/businesses/${id}/edit`}>
          <Button variant="outline">
            <Edit size={16} className="mr-2" />
            Επεξεργασία
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={handleDelete}
          loading={deleting}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 size={15} className="mr-1.5" />
          Διαγραφή
        </Button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold text-gray-900">{business.onomasia || 'Επιχείρηση'}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap text-sm">
          <span className="font-mono text-gray-500">ΑΦΜ: {business.afm}</span>
          {business.legalStatusDescr && <span>{business.legalStatusDescr}</span>}
        </div>
      </div>

      {quickSend && (
        <QuickSendModal
          businesses={[{ id: business.id, onomasia: business.onomasia, afm: business.afm, accountantId: business.accountantId, accountantOfficeName: business.accountant?.officeName }]}
          onClose={() => setQuickSend(false)}
        />
      )}

      <NewCaseModal
        open={newCase}
        onClose={() => setNewCase(false)}
        initialBusinessId={business.id}
        onCreated={() => setNewCase(false)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-1 print:gap-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6 print:space-y-3">
          <Card>
            <CardHeader><CardTitle>Στοιχεία Επιχείρησης</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Επωνυμία</dt>
                  <dd className="font-medium">{business.onomasia || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Εμπορικός Τίτλος</dt>
                  <dd>{business.commercialTitle || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Νομική Μορφή</dt>
                  <dd>{business.legalStatusDescr || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Ημερ. Ίδρυσης</dt>
                  <dd className="flex items-center gap-1">
                    <Calendar size={12} className="text-gray-400" />
                    {formatDate(business.regdate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">ΔΟΥ</dt>
                  <dd>{business.doyDescr || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Κατάσταση</dt>
                  <dd>{(business.deactivationFlag === 'Y' || business.stopDate) ? `Ανενεργή${business.stopDate ? ` (Παύση Εργασιών ${business.stopDate})` : ''}` : 'Ενεργή'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Διεύθυνση & Επικοινωνία</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-gray-500 flex items-center gap-1"><MapPin size={12} />Διεύθυνση</dt>
                  <dd>{[business.postalAddress, business.postalAddressNo, business.postalZipCode, business.postalAreaDescription].filter(Boolean).join(', ') || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 flex items-center gap-1"><Mail size={12} />Email</dt>
                  <dd>{business.email ? <a href={`mailto:${business.email}`} className="text-blue-600 hover:underline">{business.email}</a> : '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 flex items-center gap-1"><Phone size={12} />Τηλέφωνο</dt>
                  <dd>{business.phone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Viber</dt>
                  <dd>{business.viberPhone || '-'}</dd>
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-100 print:hidden">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!business.excludedFromCampaigns}
                      onChange={toggleExcludeFromCampaigns}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className={business.excludedFromCampaigns ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      Εξαίρεση από καμπάνιες (η επιχείρηση δεν θα λαμβάνει ποτέ email/Viber καμπάνιες)
                    </span>
                  </label>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>ΚΑΔ Δραστηριοτήτων ({business.activities?.length || 0})</CardTitle></CardHeader>
            <CardContent>
              <KadTable activities={business.activities || []} />
            </CardContent>
          </Card>

          {/* Campaign messaging history */}
          {business.campaignRecipients && business.campaignRecipients.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Μηνύματα Καμπανιών ({business.campaignRecipients.length})</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y divide-gray-100">
                  {business.campaignRecipients.map((r: any) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/campaigns/${r.campaign?.id}`} className="font-medium text-blue-700 hover:underline truncate block">
                          {r.campaign?.title || '—'}
                        </Link>
                        <div className="text-xs text-gray-400">
                          {r.channel === 'EMAIL' ? 'Email' : r.channel === 'VIBER' ? 'Viber' : 'Email + Viber'} · {r.recipient}
                          {r.sentAt && <> · {formatDate(r.sentAt)}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.status === 'sent' && <Badge variant="success">Εστάλη</Badge>}
                        {r.status === 'failed' && <Badge variant="danger">Απέτυχε</Badge>}
                        {r.status === 'pending' && <Badge variant="secondary">Σε εκκρεμότητα</Badge>}
                        {r.openedAt && <Badge variant="info">Ανοίχτηκε</Badge>}
                        {r.clickedAt && <Badge variant="purple">Κλικ</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Matches */}
          {business.programMatches && business.programMatches.filter((m: any) => m.status !== 'REJECTED').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Matches Προγραμμάτων ({business.programMatches.filter((m: any) => m.status !== 'REJECTED').length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {business.programMatches.filter((m: any) => m.status !== 'REJECTED').map((m: any) => (
                    <MatchCard
                      key={m.id}
                      businessName={business.onomasia || ''}
                      afm={business.afm}
                      programTitle={m.program?.title || ''}
                      matchScore={m.matchScore}
                      matchReason={m.matchReason}
                      status={m.status}
                      extraCriteria={(m.program?.extraCriteriaIds || []).map((cid: string) => criteriaMap[cid] || cid)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Λογιστής</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {business.accountant ? (
                <div>
                  <div className="font-medium">{business.accountant.officeName}</div>
                  <div className="text-gray-500">{business.accountant.contactPerson}</div>
                  <div className="text-gray-500">{business.accountant.email}</div>
                </div>
              ) : (
                <span className="text-gray-400">Χωρίς λογιστή</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Σημειώσεις</CardTitle>
                <Button variant="ghost" size="sm" className="print:hidden" onClick={() => setEditNotes(!editNotes)}>
                  <Edit size={14} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {editNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveNotes}>Αποθήκευση</Button>
                    <Button variant="outline" size="sm" onClick={() => setEditNotes(false)}>Ακύρωση</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{business.notes || 'Χωρίς σημειώσεις'}</p>
              )}
            </CardContent>
          </Card>

          {business.clientCases && business.clientCases.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Υποθέσεις ({business.clientCases.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {business.clientCases.map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className="flex items-center justify-between gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.program?.title || `Υπόθεση #${c.caseNumber}`}</div>
                      <div className="text-xs text-gray-400">{formatDate(c.createdAt)}</div>
                    </div>
                    <Badge variant={CASE_STATUS_VARIANT[c.status] || 'secondary'} className="text-xs shrink-0">
                      {CASE_STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {business.exodikastikosCases && business.exodikastikosCases.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Εξωδικαστικός ({business.exodikastikosCases.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {business.exodikastikosCases.map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/exodikastikos/${c.id}`}
                    className="flex items-center justify-between gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">Αίτηση #{c.caseNumber}</div>
                      <div className="text-xs text-gray-400">{formatDate(c.createdAt)}</div>
                    </div>
                    <Badge variant={EXODIKASTIKOS_STATUS_VARIANT[c.status] || 'secondary'} className="text-xs shrink-0">
                      {EXODIKASTIKOS_STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {(business.iMentorServices || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Υπηρεσίες I-MENTOR</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {(business.iMentorServices || []).map((s: string) => (
                    <Badge key={s} variant="info">{s}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Tags / Ιδιαιτερότητες</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(business.tags || []).length === 0 && <span className="text-sm text-gray-400">Χωρίς tags</span>}
                {(business.tags || []).map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-600 print:hidden">
                      <XIcon size={11} />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 print:hidden">
                <select
                  value={tagSelect}
                  onChange={e => setTagSelect(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Επιλέξτε tag...</option>
                  {tagOptions.filter(t => !(business.tags || []).includes(t.label)).map(t => (
                    <option key={t.id} value={t.label}>{t.label}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (tagSelect) { addTag(tagSelect); setTagSelect('') } }}
                >
                  <Plus size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
