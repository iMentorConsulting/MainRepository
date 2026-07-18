'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle, Send, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const statusVariant: Record<string, any> = {
  DRAFT: 'secondary',
  SCHEDULED: 'warning',
  SENT: 'success',
  SENDING: 'info',
  FAILED: 'danger',
}
const statusLabel: Record<string, string> = {
  DRAFT: 'Πρόχειρο',
  SCHEDULED: 'Προγρ/νο',
  SENT: 'Απεστάλη',
  SENDING: 'Αποστολή...',
  FAILED: 'Αποτυχία',
}

const channelVariant: Record<string, any> = {
  EMAIL: 'info',
  VIBER: 'purple',
  EMAIL_AND_VIBER: 'default',
  BOTH: 'default',
}
const channelLabel: Record<string, string> = {
  EMAIL: 'Email',
  VIBER: 'Viber',
  EMAIL_AND_VIBER: 'Email + Viber',
  BOTH: 'Email + Viber',
}
const channelIcon: Record<string, React.ReactNode> = {
  EMAIL: <Mail size={12} />,
  VIBER: <MessageCircle size={12} />,
  EMAIL_AND_VIBER: <Send size={12} />,
  BOTH: <Send size={12} />,
}

export default function GemiCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  function loadCampaigns() {
    setLoading(true)
    fetch('/api/gemi/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || d || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadCampaigns() }, [])

  async function syncStats(id: string) {
    setSyncing(id)
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}/sync-stats`, { method: 'POST' })
      if (res.ok) {
        showToast('Τα στατιστικά ενημερώθηκαν.', true)
        loadCampaigns()
      } else {
        showToast('Σφάλμα συγχρονισμού.', false)
      }
    } catch {
      showToast('Σφάλμα δικτύου.', false)
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ΓΕΜΗ — Καμπάνιες</h1>
          <p className="text-gray-500 mt-1">{campaigns.length} καμπάνιες</p>
        </div>
        <Link href="/gemi/campaigns/new">
          <Button><Plus size={16} className="mr-2" />Νέα Καμπάνια</Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Τίτλος</Th>
                <Th>Κανάλι</Th>
                <Th>Πρόγραμμα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημ. Αποστολής</Th>
                <Th>Αποστολές</Th>
                <Th>Ανοίγματα</Th>
                <Th>Κλικ</Th>
                <Th></Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <Td colSpan={9} className="text-center text-gray-400 py-8">
                    Δεν υπάρχουν καμπάνιες ΓΕΜΗ
                  </Td>
                </TableRow>
              ) : (
                campaigns.map((c: any) => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/gemi/campaigns/${c.id}`} className="font-medium text-blue-800 hover:underline">
                        {c.title}
                      </Link>
                    </Td>
                    <Td>
                      <Badge variant={channelVariant[c.channel] || 'default'}>
                        {channelIcon[c.channel]}
                        {channelLabel[c.channel] || c.channel}
                      </Badge>
                    </Td>
                    <Td className="text-sm text-gray-500">{c.program?.title || '—'}</Td>
                    <Td>
                      <Badge variant={statusVariant[c.status] || 'default'}>
                        {statusLabel[c.status] || c.status}
                      </Badge>
                    </Td>
                    <Td className="text-sm text-gray-500">
                      {c.sentAt ? formatDateTime(c.sentAt) : '—'}
                    </Td>
                    <Td className="text-sm">{c.sentCount ?? c._count?.recipients ?? '—'}</Td>
                    <Td className="text-sm">{c.openCount ?? '—'}</Td>
                    <Td className="text-sm">{c.clickCount ?? '—'}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {c.moosendCampaignId && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={syncing === c.id}
                            onClick={() => syncStats(c.id)}
                          >
                            <RefreshCw size={12} className="mr-1" />
                            Sync Stats
                          </Button>
                        )}
                        <Link href={`/gemi/campaigns/${c.id}`}>
                          <Button size="sm" variant="ghost">Λεπτομέρειες</Button>
                        </Link>
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
