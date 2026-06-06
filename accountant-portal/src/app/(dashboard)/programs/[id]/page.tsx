'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MatchCard } from '@/components/matching/match-card'
import { ArrowLeft, Zap, Calendar, Tag } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const categoryLabel: Record<string, string> = {
  ESPA: 'ΕΣΠΑ', DYPA: 'ΔΥΠΑ', MICROLOANS: 'Μικροδάνεια', LOAN: 'Δάνεια', OTHER: 'Άλλο',
}

export default function ProgramDetailPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const [program, setProgram] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch(`/api/programs/${id}`)
      .then(r => r.json())
      .then(setProgram)
      .finally(() => setLoading(false))
  }, [id])

  async function runMatching() {
    setRunning(true)
    const res = await fetch(`/api/programs/${id}/match`, { method: 'POST' })
    const data = await res.json()
    alert(`Βρέθηκαν ${data.count} matches!`)
    // Reload
    const updated = await fetch(`/api/programs/${id}`).then(r => r.json())
    setProgram(updated)
    setRunning(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )
  if (!program) return <div className="text-center text-gray-500">Δεν βρέθηκε πρόγραμμα</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/programs">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{program.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="default">{categoryLabel[program.category] || program.category}</Badge>
            <Badge variant={program.active ? 'success' : 'secondary'}>{program.active ? 'Ενεργό' : 'Ανενεργό'}</Badge>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={runMatching} loading={running} variant="outline">
              <Zap size={16} className="mr-1" />
              Εκτέλεση Matching
            </Button>
            <Link href={`/programs/${id}/edit`}>
              <Button variant="outline">Επεξεργασία</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {program.description && (
            <Card>
              <CardHeader><CardTitle>Περιγραφή</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-gray-700 leading-relaxed">{program.description}</p></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Κριτήρια Επιλεξιμότητας</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {program.kadRules?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">ΚΑΔ</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.kadRules.map((r: string) => (
                      <span key={r} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {program.regionRules?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Περιοχές</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.regionRules.map((r: string) => (
                      <Badge key={r} variant="secondary">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {program.legalStatusRules?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Νομική Μορφή</div>
                  <div className="flex flex-wrap gap-1.5">
                    {program.legalStatusRules.map((r: string) => (
                      <Badge key={r} variant="info">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(program.minRegdate || program.maxRegdate) && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Ημ. Ίδρυσης</div>
                  <span className="text-sm text-gray-700">
                    {program.minRegdate || '...'} — {program.maxRegdate || '...'}
                  </span>
                </div>
              )}
              {!program.kadRules?.length && !program.regionRules?.length && !program.legalStatusRules?.length && !program.minRegdate && !program.maxRegdate && (
                <p className="text-sm text-gray-400 italic">Χωρίς ειδικά κριτήρια — γενικό πρόγραμμα</p>
              )}
            </CardContent>
          </Card>

          {/* Matches */}
          <Card>
            <CardHeader>
              <CardTitle>Matched Επιχειρήσεις ({program.matches?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {program.matches?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {program.matches.slice(0, 20).map((m: any) => (
                    <MatchCard
                      key={m.id}
                      businessName={m.business?.onomasia || ''}
                      afm={m.business?.afm || ''}
                      programTitle={program.title}
                      matchScore={m.matchScore}
                      matchReason={m.matchReason}
                      status={m.status}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Zap size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Δεν υπάρχουν matches ακόμη.</p>
                  {isAdmin && <p className="text-sm">Πατήστε "Εκτέλεση Matching" για να τρέξετε τον αλγόριθμο.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Πληροφορίες</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Έναρξη</span>
                <span>{formatDate(program.startDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Λήξη</span>
                <span>{formatDate(program.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Matches</span>
                <span className="font-semibold">{program.matches?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Καμπάνιες</span>
                <span>{program.campaigns?.length || 0}</span>
              </div>
            </CardContent>
          </Card>

          {program.internalNotes && isAdmin && (
            <Card>
              <CardHeader><CardTitle>Εσωτερικές Σημειώσεις</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-gray-700">{program.internalNotes}</p></CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
