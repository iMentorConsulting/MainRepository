'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { ArrowLeft, Send, Mail, MessageCircle, Users, X, Edit } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export default function CampaignDetailPage() {
  const { id } = useParams()
  const [campaign, setCampaign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRecipients, setPreviewRecipients] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [recipientSearch, setRecipientSearch] = useState('')

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(setCampaign)
      .finally(() => setLoading(false))
  }, [id])

  async function openRecipientsPreview() {
    setShowPreview(true)
    setRecipientSearch('')
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/recipients-preview`)
      const data = await res.json()
      const recipients = data.recipients || []
      setPreviewRecipients(recipients)
      setSelectedIds(new Set(recipients.filter((r: any) => !r.excludedFromCampaigns).map((r: any) => r.id)))
    } catch (e) {
      setPreviewRecipients([])
    } finally {
      setPreviewLoading(false)
    }
  }

  function toggleRecipient(rid: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(rid)) next.delete(rid)
      else next.add(rid)
      return next
    })
  }

  async function sendCampaign() {
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Σφάλμα κατά την έναρξη αποστολής')
        return
      }
      const data = await res.json()
      alert(`Η αποστολή ξεκίνησε για ${data.total || 0} παραλήπτες. Η κατάσταση θα ενημερωθεί σταδιακά παρακάτω.`)
      setShowPreview(false)
      pollCampaign()
    } catch (e) {
      alert('Σφάλμα δικτύου κατά την αποστολή')
    } finally {
      setSending(false)
    }
  }

  function pollCampaign(attemptsLeft = 20) {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(updated => {
        setCampaign(updated)
        if (updated.status !== 'SENT' && attemptsLeft > 0) {
          setTimeout(() => pollCampaign(attemptsLeft - 1), 5000)
        }
      })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" /></div>
  if (!campaign) return <div className="text-center text-gray-500">Δεν βρέθηκε καμπάνια</div>

  const recipients = campaign.recipients || []
  const sent = recipients.filter((r: any) => r.status === 'sent').length
  const failed = recipients.filter((r: any) => r.status === 'failed').length
  const pending = recipients.filter((r: any) => r.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/campaigns"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{campaign.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-sm text-gray-500">
              {campaign.channel === 'EMAIL' ? <Mail size={14} /> : <MessageCircle size={14} />}
              {campaign.channel}
            </span>
            <Badge variant={campaign.status === 'SENT' ? 'success' : campaign.status === 'DRAFT' ? 'secondary' : 'warning'}>
              {campaign.status === 'SENT' ? 'Απεστάλη' : campaign.status === 'DRAFT' ? 'Πρόχειρο' : 'Προγραμμένο'}
            </Badge>
          </div>
        </div>
        <Link href={`/campaigns/${id}/edit`}>
          <Button variant="outline">
            <Edit size={16} className="mr-2" />
            Επεξεργασία
          </Button>
        </Link>
        {campaign.status === 'DRAFT' && (
          <Button onClick={openRecipientsPreview}>
            <Users size={16} className="mr-2" />
            Επιλογή Παραληπτών & Αποστολή
          </Button>
        )}
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Επιλογή Παραληπτών</h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 space-y-2.5">
              <input
                type="text"
                value={recipientSearch}
                onChange={e => setRecipientSearch(e.target.value)}
                placeholder="Αναζήτηση παραλήπτη (επωνυμία, email, τηλέφωνο)…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-400"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Επιλέχθηκαν <span className="font-semibold text-gray-900">{selectedIds.size}</span> από {previewRecipients.length} πιθανούς παραλήπτες.
                  Οι εξαιρεμένες επιχειρήσεις είναι προ-αποεπιλεγμένες.
                </span>
                <div className="flex gap-2">
                  <button type="button" className="text-blue-700 hover:underline" onClick={() => setSelectedIds(new Set(previewRecipients.map(r => r.id)))}>Επιλογή όλων</button>
                  <button type="button" className="text-gray-500 hover:underline" onClick={() => setSelectedIds(new Set())}>Καμία επιλογή</button>
                </div>
              </div>
              {previewRecipients.some(r => r.missingAccountant) && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ Το μήνυμα της καμπάνιας αναφέρεται σε λογιστή, αλλά κάποιοι παραλήπτες (σημειωμένοι με «Χωρίς λογιστή») δεν έχουν καταχωρημένο λογιστή — ελέγξτε πριν την αποστολή.
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {previewLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
                </div>
              ) : previewRecipients.length === 0 ? (
                <div className="text-center text-gray-400 py-10 text-sm">Δεν βρέθηκαν επιλέξιμοι παραλήπτες</div>
              ) : (() => {
                const q = recipientSearch.trim().toLowerCase()
                const filtered = q
                  ? previewRecipients.filter(r => r.name?.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q))
                  : previewRecipients
                if (filtered.length === 0) {
                  return <div className="text-center text-gray-400 py-10 text-sm">Δεν βρέθηκαν αποτελέσματα για «{recipientSearch}»</div>
                }
                return (
                <ul className="divide-y divide-gray-100">
                  {filtered.map(r => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleRecipient(r.id)}
                        className="rounded border-gray-300 text-blue-700 focus:ring-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{r.name}</div>
                        <div className="text-xs text-gray-400 truncate">{r.contact}</div>
                      </div>
                      {r.excludedFromCampaigns && (
                        <Badge variant="danger">Μόνιμη εξαίρεση</Badge>
                      )}
                      {r.missingAccountant && (
                        <Badge variant="warning" title="Το template αναφέρεται σε λογιστή, αλλά η επιχείρηση δεν έχει καταχωρημένο λογιστή">
                          Χωρίς λογιστή
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
                )
              })()}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowPreview(false)}>Άκυρο</Button>
              <Button onClick={sendCampaign} loading={sending} disabled={selectedIds.size === 0}>
                <Send size={16} className="mr-2" />
                Αποστολή σε {selectedIds.size} παραλήπτες
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Παραλήπτες', value: recipients.length, color: 'text-gray-900' },
          { label: 'Απεστάλησαν', value: sent, color: 'text-green-700' },
          { label: 'Αποτυχία', value: failed, color: 'text-red-600' },
          { label: 'Εκκρεμεί', value: pending, color: 'text-yellow-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Παραλήπτες ({recipients.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHead>
                  <TableRow>
                    <Th>Επιχείρηση</Th>
                    <Th>Παραλήπτης</Th>
                    <Th>Κατάσταση</Th>
                    <Th>Ημ/νία</Th>
                    <Th>Σφάλμα</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipients.length === 0 ? (
                    <TableRow><Td colSpan={5} className="text-center text-gray-400 py-6">Χωρίς παραλήπτες</Td></TableRow>
                  ) : (
                    recipients.map((r: any) => (
                      <TableRow key={r.id}>
                        <Td className="text-sm">{r.business?.onomasia || r.businessId}</Td>
                        <Td className="text-sm text-gray-500">{r.recipient}</Td>
                        <Td>
                          <Badge variant={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'danger' : 'secondary'}>
                            {r.status === 'sent' ? 'Απεστάλη' : r.status === 'failed' ? 'Αποτυχία' : 'Εκκρεμεί'}
                          </Badge>
                        </Td>
                        <Td className="text-xs text-gray-400">{r.sentAt ? formatDateTime(r.sentAt) : '-'}</Td>
                        <Td className="text-xs text-red-500 max-w-xs truncate">{r.errorMessage || '-'}</Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Πρότυπο Μηνύματος</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{campaign.messageTemplate}</pre>
            </CardContent>
          </Card>
          {campaign.program && (
            <Card>
              <CardHeader><CardTitle>Πρόγραμμα</CardTitle></CardHeader>
              <CardContent>
                <Link href={`/programs/${campaign.programId}`} className="text-blue-800 hover:underline text-sm">
                  {campaign.program.title}
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
