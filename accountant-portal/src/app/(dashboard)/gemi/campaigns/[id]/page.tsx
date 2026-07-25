'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, Send, Mail, MessageCircle, RefreshCw } from 'lucide-react'

const statusVariant: Record<string, any> = { DRAFT: 'secondary', SENT: 'success', SENDING: 'info', FAILED: 'danger', SCHEDULED: 'warning' }
const statusLabel: Record<string, string> = { DRAFT: 'Πρόχειρο', SENT: 'Απεστάλη', SENDING: 'Αποστολή...', FAILED: 'Αποτυχία', SCHEDULED: 'Προγρ/νο' }
const channelLabel: Record<string, string> = { EMAIL: 'Email', VIBER: 'Viber', EMAIL_AND_VIBER: 'Email + Viber' }

export default function GemiCampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Resend non-openers modal state
  const [resendModal, setResendModal] = useState(false)
  const [resendSubject, setResendSubject] = useState('')
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState<any>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 5000)
  }

  async function loadData() {
    const [c, r] = await Promise.all([
      fetch(`/api/gemi/campaigns/${id}`).then(res => res.json()),
      fetch(`/api/gemi/campaigns/${id}/recipients`).then(res => res.json()).catch(() => []),
    ])
    setCampaign(c)
    setRecipients(Array.isArray(r) ? r : r.recipients || [])
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [id])

  async function sendCampaign() {
    if (!confirm('Αποστολή καμπάνιας τώρα; Η ενέργεια δεν αναιρείται.')) return
    setSending(true)
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast(`Εστάλησαν ${data.sent} μηνύματα${data.errors ? ` (${data.errors} σφάλματα)` : ''}.`, true)
        await loadData()
      } else {
        showToast(data.error || 'Σφάλμα αποστολής', false)
      }
    } catch {
      showToast('Σφάλμα δικτύου', false)
    } finally {
      setSending(false)
    }
  }

  function openResendModal() {
    setResendSubject(campaign?.subject || '')
    setResendResult(null)
    setResendModal(true)
  }

  async function handleResend() {
    setResending(true)
    setResendResult(null)
    try {
      const res = await fetch(`/api/gemi/campaigns/${id}/resend-non-openers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: resendSubject }),
      })
      const data = await res.json()
      if (res.ok) {
        setResendResult(data)
        if (data.recipientCount > 0) {
          await loadData()
        }
      } else {
        showToast(data.error || 'Σφάλμα επαναποστολής', false)
        setResendModal(false)
      }
    } catch {
      showToast('Σφάλμα δικτύου', false)
      setResendModal(false)
    } finally {
      setResending(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  if (!campaign || campaign.error) return (
    <div className="text-center py-16 text-gray-400">Η καμπάνια δεν βρέθηκε.</div>
  )

  const sentCount = recipients.filter((r: any) => r.status === 'sent').length
  const errorCount = recipients.filter((r: any) => r.status === 'error').length
  const pendingCount = recipients.filter((r: any) => r.status === 'pending').length
  const isEmailCampaign = campaign.channel === 'EMAIL' || campaign.channel === 'EMAIL_AND_VIBER'

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Resend non-openers modal */}
      {resendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Επαναποστολή σε Μη Αναγνώστες</h2>
              <p className="text-sm text-gray-500 mt-1">
                Γίνεται fresh sync με Moosend, μετά η καμπάνια αποστέλλεται μόνο σε όσους δεν άνοιξαν το προηγούμενο email.
              </p>
            </div>

            {!resendResult ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Θέμα email</label>
                  <Input
                    value={resendSubject}
                    onChange={e => setResendSubject(e.target.value)}
                    placeholder="Θέμα email..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Μπορείς να αλλάξεις το θέμα (π.χ. να προσθέσεις «Υπενθύμιση:»)</p>
                </div>

                {/* Safety info box */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">Αυτόματες εξαιρέσεις — δεν θα λάβουν email:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Όσοι άνοιξαν ή έκαναν κλικ στο αρχικό email</li>
                    <li>Emails που αναπήδησαν (bounced)</li>
                    <li>Όσοι διαγράφηκαν από αυτή την καμπάνια</li>
                    <li>Όσοι είναι στη λίστα αποδεσμευμένων (global unsubscribers)</li>
                  </ul>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setResendModal(false)} disabled={resending}>Ακύρωση</Button>
                  <Button onClick={handleResend} loading={resending} disabled={!resendSubject.trim()}>
                    {resending ? 'Sync & αποστολή...' : 'Επαναποστολή'}
                  </Button>
                </div>
              </>
            ) : (
              /* Results view */
              <div className="space-y-4">
                {resendResult.recipientCount > 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <p className="text-emerald-800 font-semibold text-base">
                      ✓ Νέα καμπάνια δημιουργήθηκε για {resendResult.recipientCount} παραλήπτες
                    </p>
                    <p className="text-emerald-700 text-sm mt-1">Η αποστολή θα ολοκληρωθεί αυτόματα σε λίγα λεπτά.</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-600 text-sm">
                    Δεν βρέθηκαν μη αναγνώστες για επαναποστολή.
                  </div>
                )}

                {/* Exclusion breakdown */}
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-700">Ανάλυση εξαιρέσεων:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                    <span>✓ Άνοιξαν / έκαναν κλικ</span>
                    <span className="font-medium text-emerald-700">{resendResult.excluded.alreadyOpened}</span>
                    <span>⚠ Αναπήδηση (bounce)</span>
                    <span className="font-medium text-red-600">{resendResult.excluded.bounced}</span>
                    <span>⚠ Διαγραφή από καμπάνια</span>
                    <span className="font-medium text-red-600">{resendResult.excluded.campaignUnsub}</span>
                    <span>⚠ Global unsubscribe</span>
                    <span className="font-medium text-red-600">{resendResult.excluded.globalUnsub}</span>
                  </div>
                  {resendResult.synced && (
                    <p className="text-xs text-gray-400 pt-1">
                      Fresh sync: {resendResult.syncedRecipients} παραλήπτες ενημερώθηκαν από Moosend πριν την αποστολή.
                    </p>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setResendModal(false)}>Κλείσιμο</Button>
                  {resendResult.newCampaignId && (
                    <Link href={`/gemi/campaigns/${resendResult.newCampaignId}`}>
                      <Button onClick={() => setResendModal(false)}>Δες νέα καμπάνια →</Button>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href="/gemi/campaigns">
          <Button size="sm" variant="ghost"><ArrowLeft size={14} className="mr-1" />Πίσω</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{campaign.title}</h1>
          <p className="text-sm text-gray-500">{campaign.program?.title || 'Χωρίς πρόγραμμα'}</p>
        </div>
        <Badge variant={statusVariant[campaign.status] || 'default'}>{statusLabel[campaign.status] || campaign.status}</Badge>
        <Badge variant="secondary">{channelLabel[campaign.channel] || campaign.channel}</Badge>
        {campaign.status === 'DRAFT' && (
          <Button loading={sending} onClick={sendCampaign}>
            <Send size={14} className="mr-2" />Αποστολή
          </Button>
        )}
        {campaign.status === 'SENT' && isEmailCampaign && (
          <Button variant="outline" onClick={openResendModal}>
            <RefreshCw size={14} className="mr-2" />Επαναποστολή σε Μη Αναγνώστες
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Σύνολο παραληπτών', value: recipients.length },
          { label: 'Εστάλησαν', value: sentCount, color: 'text-green-700' },
          { label: 'Σφάλματα', value: errorCount, color: 'text-red-600' },
          { label: 'Εκκρεμή', value: pendingCount, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color || 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600 grid grid-cols-2 gap-3">
        <div><span className="font-medium text-gray-700">Θέμα:</span> {campaign.subject || '—'}</div>
        <div><span className="font-medium text-gray-700">Δημιουργήθηκε:</span> {formatDateTime(campaign.createdAt)}</div>
        {campaign.sentAt && <div><span className="font-medium text-gray-700">Εστάλη:</span> {formatDateTime(campaign.sentAt)}</div>}
        {campaign.channel === 'EMAIL' && campaign.subject && (
          <div className="col-span-2"><span className="font-medium text-gray-700">Κανάλι:</span> <Mail size={13} className="inline mr-1" />Email</div>
        )}
        {campaign.channel === 'VIBER' && (
          <div className="col-span-2"><span className="font-medium text-gray-700">Κανάλι:</span> <MessageCircle size={13} className="inline mr-1" />Viber</div>
        )}
      </div>

      {/* Recipients table */}
      {recipients.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Παραλήπτες</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Email / Τηλέφωνο</th>
                  <th className="px-4 py-3 text-left">Κατάσταση</th>
                  <th className="px-4 py-3 text-left">Εστάλη</th>
                  <th className="px-4 py-3 text-left">Σφάλμα</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recipients.slice(0, 200).map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.recipient}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.status === 'sent' ? 'success' : r.status === 'error' ? 'danger' : 'secondary'}>
                        {r.status === 'sent' ? 'Εστάλη' : r.status === 'error' ? 'Σφάλμα' : 'Εκκρεμεί'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.sentAt ? formatDateTime(r.sentAt) : '—'}</td>
                    <td className="px-4 py-2 text-red-600 text-xs max-w-xs truncate">{r.errorMessage || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recipients.length > 200 && (
              <p className="text-xs text-gray-400 text-center py-3">Εμφανίζονται οι πρώτοι 200 από {recipients.length} παραλήπτες.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
