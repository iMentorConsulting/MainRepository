'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle, Send, RefreshCw, Trash2 } from 'lucide-react'
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
  const [syncingAll, setSyncingAll] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
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

  async function syncAllStats() {
    const syncable = campaigns.filter((c: any) => c.moosendCampaignId)
    if (syncable.length === 0) { showToast('Καμία καμπάνια με στατιστικά Moosend.', false); return }
    setSyncingAll(true)
    let ok = 0
    let failed = 0
    for (const c of syncable) {
      try {
        const res = await fetch(`/api/gemi/campaigns/${c.id}/sync-stats`, { method: 'POST' })
        if (res.ok) ok++
        else failed++
      } catch {
        failed++
      }
    }
    setSyncingAll(false)
    showToast(`Sync στατιστικών: ${ok} καμπάνιες ενημερώθηκαν${failed ? `, ${failed} απέτυχαν` : ''}`, failed === 0)
    loadCampaigns()
  }

  async function deleteCampaign(id: string, title: string) {
    if (!confirm(`Διαγραφή καμπάνιας «${title}»; Η ενέργεια δεν αναιρείται.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Η καμπάνια διαγράφηκε.', true)
        loadCampaigns()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Σφάλμα διαγραφής.', false)
      }
    } catch {
      showToast('Σφάλμα δικτύου.', false)
    } finally {
      setDeleting(null)
    }
  }

  async function syncStats(id: string) {
    setSyncing(id)
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}/sync-stats`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const recMsg = typeof data.recipientsUpdated === 'number' ? ` (${data.recipientsUpdated} παραλήπτες ενημερώθηκαν)` : ''
        showToast(`Στατιστικά ενημερώθηκαν${recMsg}`, true)
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncAllStats} loading={syncingAll}>
            <RefreshCw size={14} className="mr-1.5" />Sync Όλων
          </Button>
          <Link href="/gemi/campaigns/new">
            <Button><Plus size={16} className="mr-2" />Νέα Καμπάνια</Button>
          </Link>
        </div>
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
                <Th>Παραδόθηκαν</Th>
                <Th>Bounced</Th>
                <Th>Ανοίγματα</Th>
                <Th>Κλικ</Th>
                <Th></Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <Td colSpan={11} className="text-center text-gray-400 py-8">
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
                    <Td className="text-sm font-medium">{c.totalSent ?? c._count?.recipients ?? 0}</Td>
                    <Td className="text-sm">{c.totalDelivered ?? 0}</Td>
                    <Td className="text-sm">
                      <span className={c.totalBounced > 0 ? 'text-red-600 font-medium' : ''}>{c.totalBounced ?? 0}</span>
                    </Td>
                    <Td className="text-sm">
                      {c.totalOpened ?? 0}
                      {c.totalSent > 0 && (
                        <span className="text-xs text-gray-400 ml-1">({Math.round((c.totalOpened / c.totalSent) * 100)}%)</span>
                      )}
                    </Td>
                    <Td className="text-sm">
                      {c.totalClicked ?? 0}
                      {c.totalSent > 0 && (
                        <span className="text-xs text-gray-400 ml-1">({Math.round((c.totalClicked / c.totalSent) * 100)}%)</span>
                      )}
                    </Td>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={deleting === c.id}
                          onClick={() => deleteCampaign(c.id, c.title)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
              {campaigns.length > 0 && (() => {
                const totalSent = campaigns.reduce((s, c) => s + (c.totalSent ?? c._count?.recipients ?? 0), 0)
                const totalDelivered = campaigns.reduce((s, c) => s + (c.totalDelivered ?? 0), 0)
                const totalBounced = campaigns.reduce((s, c) => s + (c.totalBounced ?? 0), 0)
                const totalOpened = campaigns.reduce((s, c) => s + (c.totalOpened ?? 0), 0)
                const totalClicked = campaigns.reduce((s, c) => s + (c.totalClicked ?? 0), 0)
                return (
                  <TableRow className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                    <Td colSpan={5} className="text-right text-xs uppercase tracking-wide text-gray-500">Σύνολα</Td>
                    <Td className="text-sm">{totalSent}</Td>
                    <Td className="text-sm">{totalDelivered}</Td>
                    <Td className="text-sm"><span className={totalBounced > 0 ? 'text-red-600' : ''}>{totalBounced}</span></Td>
                    <Td className="text-sm">
                      {totalOpened}
                      {totalSent > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round((totalOpened / totalSent) * 100)}%)</span>}
                    </Td>
                    <Td className="text-sm">
                      {totalClicked}
                      {totalSent > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round((totalClicked / totalSent) * 100)}%)</span>}
                    </Td>
                    <Td />
                  </TableRow>
                )
              })()}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
