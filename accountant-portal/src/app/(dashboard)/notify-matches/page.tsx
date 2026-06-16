'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Send, BarChart2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Accountant {
  id: string
  officeName: string
}

interface Program {
  id: string
  title: string
}

interface MatchPreview {
  id: string
  matchScore: number
  business: { onomasia: string | null; afm: string }
}

interface CampaignRow {
  id: string
  title: string
  channel: string
  status: string
  sentAt: string | null
  createdAt: string
  accountant: { officeName: string } | null
  program: { title: string } | null
  _count: { recipients: number }
}

export default function NotifyMatchesPage() {
  const { data: session, status } = useSession()
  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [accountantId, setAccountantId] = useState('')
  const [programId, setProgramId] = useState('')
  const [matches, setMatches] = useState<MatchPreview[] | null>(null)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [sending, setSending] = useState(false)
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)

  useEffect(() => {
    fetch('/api/accountants').then(r => r.json()).then(d => setAccountants(d.accountants || []))
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
    fetch('/api/campaigns?limit=200')
      .then(r => r.json())
      .then(d => setCampaigns((d.campaigns || []).filter((c: CampaignRow) => c.status === 'SENT' && (c._count?.recipients ?? 0) > 0)))
      .finally(() => setLoadingCampaigns(false))
  }, [])

  useEffect(() => {
    if (!accountantId || !programId) {
      setMatches(null)
      return
    }
    setLoadingMatches(true)
    fetch(`/api/programs/${programId}/notify-custom?accountantId=${accountantId}`)
      .then(r => r.json())
      .then(d => setMatches(d.matches || []))
      .finally(() => setLoadingMatches(false))
  }, [accountantId, programId])

  if (status === 'loading') return null
  if (session?.user?.role !== 'ADMIN') redirect('/')

  async function handleSend() {
    if (!accountantId || !programId) return
    if (!confirm('Αποστολή ειδοποίησης matches σε αυτόν τον λογιστή για το επιλεγμένο πρόγραμμα;')) return
    setSending(true)
    try {
      const res = await fetch(`/api/programs/${programId}/notify-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountantId }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message || `Στάλθηκε ειδοποίηση για ${data.notified} match${data.notified === 1 ? '' : 'es'}`)
      } else {
        alert(data.error || 'Σφάλμα αποστολής')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αποστολή Custom Ειδοποιήσεων Matches</h1>
        <p className="text-sm text-gray-500 mt-1">
          Επιλέξτε έναν λογιστή και ένα πρόγραμμα για να στείλετε χειροκίνητα ειδοποίηση με τα matches του προγράμματος για τους πελάτες του λογιστή.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Επιλογή Λογιστή & Προγράμματος</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Λογιστής"
              placeholder="Επιλέξτε λογιστή..."
              value={accountantId}
              onChange={e => setAccountantId(e.target.value)}
              options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
            />
            <Select
              label="Πρόγραμμα"
              placeholder="Επιλέξτε πρόγραμμα..."
              value={programId}
              onChange={e => setProgramId(e.target.value)}
              options={programs.map(p => ({ value: p.id, label: p.title }))}
            />
          </div>

          {accountantId && programId && (
            <div className="border-t pt-4">
              {loadingMatches ? (
                <p className="text-sm text-gray-400">Φόρτωση matches...</p>
              ) : matches && matches.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Βρέθηκαν <strong>{matches.length}</strong> match{matches.length === 1 ? '' : 'es'} για αυτόν τον λογιστή σε αυτό το πρόγραμμα:
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5 max-h-60 overflow-y-auto">
                    {matches.map(m => (
                      <li key={m.id}>
                        {m.business.onomasia || 'Άγνωστη επιχείρηση'} (ΑΦΜ: {m.business.afm}) — {m.matchScore}%
                      </li>
                    ))}
                  </ul>
                  <Button onClick={handleSend} loading={sending}>
                    <Send size={16} className="mr-2" />
                    Αποστολή Ειδοποίησης
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Δεν υπάρχουν matches για αυτόν τον λογιστή σε αυτό το πρόγραμμα.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Notifications report ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 size={18} />
            Ιστορικό Ενημερώσεων προς Λογιστές
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCampaigns ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Δεν υπάρχουν αποσταλμένες ενημερώσεις.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Τίτλος</th>
                    <th className="text-left py-2 pr-4">Λογιστής</th>
                    <th className="text-left py-2 pr-4">Πρόγραμμα</th>
                    <th className="text-left py-2 pr-4">Κανάλι</th>
                    <th className="text-left py-2 pr-4">Παραλήπτες</th>
                    <th className="text-left py-2">Ημερομηνία</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-800">{c.title}</td>
                      <td className="py-2 pr-4 text-gray-500">{c.accountant?.officeName || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">{c.program?.title || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{c.channel === 'EMAIL_AND_VIBER' ? 'Email + Viber' : c.channel}</td>
                      <td className="py-2 pr-4 text-gray-700 font-medium">{c._count.recipients}</td>
                      <td className="py-2 text-gray-400 whitespace-nowrap">{formatDateTime(c.sentAt || c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
