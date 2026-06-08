'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KadTable } from '@/components/businesses/kad-table'
import { MatchCard } from '@/components/matching/match-card'
import { ArrowLeft, Mail, Phone, MapPin, Building2, Calendar, Edit } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function BusinessDetailPage() {
  const { id } = useParams()
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch(`/api/businesses/${id}`)
      .then(r => r.json())
      .then(data => {
        setBusiness(data)
        setNotes(data.notes || '')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function toggleExcludeFromCampaigns() {
    const next = !business.excludedFromCampaigns
    await fetch(`/api/businesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludedFromCampaigns: next }),
    })
    setBusiness((prev: any) => ({ ...prev, excludedFromCampaigns: next }))
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
      <div className="flex items-center gap-3">
        <Link href="/businesses">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{business.onomasia || 'Επιχείρηση'}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-gray-500 text-sm">ΑΦΜ: {business.afm}</span>
            {business.legalStatusDescr && (
              <Badge variant="secondary">{business.legalStatusDescr}</Badge>
            )}
            {business.deactivationFlag === 'Y' && (
              <Badge variant="danger">Ανενεργή</Badge>
            )}
          </div>
        </div>
        <Link href={`/businesses/${id}/edit`}>
          <Button variant="outline">
            <Edit size={16} className="mr-2" />
            Επεξεργασία
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
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
                    {business.regdate || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">ΔΟΥ</dt>
                  <dd>{business.doyDescr || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Κατάσταση</dt>
                  <dd>{business.deactivationFlagDescr || 'Ενεργή'}</dd>
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
                <div className="col-span-2 pt-2 border-t border-gray-100">
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
                          {r.channel === 'EMAIL' ? 'Email' : 'Viber'} · {r.recipient}
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
          {business.programMatches && business.programMatches.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Matches Προγραμμάτων ({business.programMatches.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {business.programMatches.map((m: any) => (
                    <MatchCard
                      key={m.id}
                      businessName={business.onomasia || ''}
                      afm={business.afm}
                      programTitle={m.program?.title || ''}
                      matchScore={m.matchScore}
                      matchReason={m.matchReason}
                      status={m.status}
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
                <Button variant="ghost" size="sm" onClick={() => setEditNotes(!editNotes)}>
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

          {business.tags && business.tags.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {business.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
