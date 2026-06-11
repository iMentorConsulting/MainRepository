'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

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

export default function NotifyMatchesPage() {
  const { data: session, status } = useSession()
  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [accountantId, setAccountantId] = useState('')
  const [programId, setProgramId] = useState('')
  const [matches, setMatches] = useState<MatchPreview[] | null>(null)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch('/api/accountants').then(r => r.json()).then(d => setAccountants(d.accountants || []))
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
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
    </div>
  )
}
