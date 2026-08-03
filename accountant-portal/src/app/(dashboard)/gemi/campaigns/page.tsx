'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle, Send, RefreshCw, Trash2, X } from 'lucide-react'
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

interface SyncDebug {
  moosendIds: string[]
  engagementPerPart: { id: string; openers: number }[]
  totalEngagementEmails: number
  recipientsInDb: number
  recipientsMatched: number
  recipientsNotInEngagement: string[]
}

export default function GemiCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  // Extra Moosend ID inputs keyed by campaign id
  const [extraIds, setExtraIds] = useState<Record<string, string>>({})
  // Debug modal
  const [syncDebug, setSyncDebug] = useState<{ campaignTitle: string; data: SyncDebug } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 5000)
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

  async function syncStats(id: string, campaignTitle: string) {
    setSyncing(id)
    const body: any = {}
    if (extraIds[id]?.trim()) body.additionalMoosendIds = extraIds[id].trim()
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}/sync-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const recMsg = typeof data.recipientsUpdated === 'number' ? ` (${data.recipientsUpdated} παραλήπτες ενημερώθηκαν)` : ''
        showToast(`Στατιστικά ενημερώθηκαν${recMsg}`, true)
        if (data.debug) setSyncDebug({ campaignTitle, data: data.debug })
        loadCampaigns()
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error || 'Σφάλμα συγχρονισμού.', false)
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

      {/* Sync debug modal */}
      {syncDebug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Sync Debug — {syncDebug.campaignTitle}</h2>
              <button onClick={() => setSyncDebug(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4 text-sm">
              <div>
                <p className="font-medium text-slate-700 mb-1">Moosend IDs που χρησιμοποιήθηκαν ({syncDebug.data.moosendIds.length}):</p>
                <ul className="space-y-1">
                  {syncDebug.data.engagementPerPart.map(p => (
                    <li key={p.id} className={`font-mono text-xs px-2 py-1 rounded ${p.openers > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                      {p.id} → <strong>{p.openers} openers</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 rounded p-2">
                  <p className="text-slate-500">Emails στο engagement map</p>
                  <p className="text-xl font-bold text-slate-800">{syncDebug.data.totalEngagementEmails}</p>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <p className="text-slate-500">Παραλήπτες στη ΒΔ</p>
                  <p className="text-xl font-bold text-slate-800">{syncDebug.data.recipientsInDb}</p>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <p className="text-slate-500">Ταιριαστοί (matched)</p>
                  <p className="text-xl font-bold text-emerald-700">{syncDebug.data.recipientsMatched}</p>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <p className="text-slate-500">Χωρίς match</p>
                  <p className="text-xl font-bold text-slate-800">{syncDebug.data.recipientsInDb - syncDebug.data.recipientsMatched}</p>
                </div>
              </div>
              {syncDebug.data.recipientsNotInEngagement.length > 0 && (
                <div>
                  <p className="font-medium text-slate-700 mb-1">Παραλήπτες χωρίς engagement (έως 20):</p>
                  <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap font-mono">
                    {syncDebug.data.recipientsNotInEngagement.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          </div>
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
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              loading={syncing === c.id}
                              onClick={() => syncStats(c.id, c.title)}
                            >
                              <RefreshCw size={12} className="mr-1" />
                              Sync Stats
                            </Button>
                            <input
                              type="text"
                              placeholder="Extra Moosend ID"
                              value={extraIds[c.id] || ''}
                              onChange={e => setExtraIds(prev => ({ ...prev, [c.id]: e.target.value }))}
                              className="text-xs border border-slate-200 rounded px-2 py-0.5 w-36 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
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
