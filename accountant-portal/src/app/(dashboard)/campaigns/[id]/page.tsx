'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { ArrowLeft, Send, Mail, MessageCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export default function CampaignDetailPage() {
  const { id } = useParams()
  const [campaign, setCampaign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(setCampaign)
      .finally(() => setLoading(false))
  }, [id])

  async function sendCampaign() {
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Σφάλμα κατά την έναρξη αποστολής')
        return
      }
      const data = await res.json()
      alert(`Η αποστολή ξεκίνησε για ${data.total || 0} παραλήπτες. Η κατάσταση θα ενημερωθεί σταδιακά παρακάτω.`)
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
        {campaign.status === 'DRAFT' && (
          <Button onClick={sendCampaign} loading={sending}>
            <Send size={16} className="mr-2" />
            Αποστολή
          </Button>
        )}
      </div>

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
