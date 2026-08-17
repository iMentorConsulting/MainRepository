'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ExternalLink, Lock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'info', IN_ASSESSMENT: 'warning', REPORT_READY: 'purple',
  OFFER_SENT: 'purple', ACCEPTED: 'success', DECLINED: 'danger', COMPLETED: 'success',
}

const ANSWER_LABELS: Record<string, string> = { yes: 'Ναι', no: 'Όχι', unsure: 'Δεν είμαι σίγουρος/η' }

export default function ExodikastikosDetailPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [resultLink, setResultLink] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch(`/api/exodikastikos/${id}`)
    if (res.ok) {
      const d = await res.json()
      setItem(d)
      setResultLink(d.resultLink || '')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function update(data: any) {
    setSaving(true)
    const res = await fetch(`/api/exodikastikos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) setItem(await res.json())
    else alert('Σφάλμα')
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" /></div>
  if (!item) return <div className="text-gray-500">Δεν βρέθηκε</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/exodikastikos" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Εξωδικαστικός #{item.caseNumber}</h1>
        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Πελάτης</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <Link href={`/businesses/${item.business?.id}`} className="font-medium text-blue-800 hover:underline">
              {item.business?.onomasia || item.business?.afm}
            </Link>
          </div>
          <div className="text-gray-500">ΑΦΜ: {item.business?.afm} · {item.business?.clientType === 'INDIVIDUAL' ? 'Φυσικό Πρόσωπο' : 'Επιχείρηση'}</div>
          {item.accountant && <div className="text-gray-500">Λογιστής: {item.accountant.officeName}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ερωτηματολόγιο Επιλεξιμότητας</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {item.questionnaire?.isMarried && (
            <div className="flex justify-between border-b border-gray-50 pb-1">
              <span className="text-gray-500">Έγγαμος/η</span>
              <span className="font-medium">{ANSWER_LABELS[item.questionnaire.isMarried] || item.questionnaire.isMarried}</span>
            </div>
          )}
          {(item.questionnaire?.extra || []).map((a: any) => (
            <div key={a.id} className="flex justify-between border-b border-gray-50 pb-1">
              <span className="text-gray-500">{a.label}</span>
              <span className="font-medium">{ANSWER_LABELS[a.answer] || a.answer}</span>
            </div>
          ))}
          {item.notes && <div className="pt-2 text-gray-600 whitespace-pre-wrap">{item.notes}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock size={14} /> Κωδικοί Taxisnet</CardTitle></CardHeader>
        <CardContent className="text-sm text-gray-500 space-y-1">
          <div>Κωδικοί πελάτη: {item.hasTaxisnetCredentials ? <Badge variant="success">Αποθηκεύτηκαν</Badge> : <Badge variant="secondary">Δεν δόθηκαν</Badge>}</div>
          {item.hasSpouse && (
            <div>Κωδικοί συζύγου: {item.hasSpouseTaxisnetCredentials ? <Badge variant="success">Αποθηκεύτηκαν</Badge> : <Badge variant="secondary">Δεν δόθηκαν</Badge>}</div>
          )}
          <p className="text-xs text-gray-400 pt-1">Οι κωδικοί είναι κρυπτογραφημένοι και δεν εμφανίζονται στην εφαρμογή.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Αποτέλεσμα Εκτίμησης</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {item.resultLink ? (
            <a href={item.resultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-blue-800 hover:underline font-medium">
              Προβολή Εκτίμησης Αποτελέσματος <ExternalLink size={15} />
            </a>
          ) : (
            <p className="text-sm text-gray-400">Δεν είναι ακόμα διαθέσιμο. Η ομάδα του εξωδικαστικού θα ενημερώσει εδώ μόλις είναι έτοιμη η εκτίμηση (περίπου 15 ημέρες).</p>
          )}
          {isAdmin && (
            <div className="flex gap-2">
              <input value={resultLink} onChange={e => setResultLink(e.target.value)} placeholder="https://..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <Button onClick={() => update({ resultLink })} loading={saving}>Αποθήκευση</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Διαχείριση (Admin)</CardTitle></CardHeader>
          <CardContent>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Κατάσταση</label>
            <select value={item.status} onChange={e => update({ status: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Ιστορικό</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {item.activities?.map((a: any) => (
            <div key={a.id} className="text-sm border-b border-gray-50 pb-2">
              <div>{a.body}</div>
              <div className="text-xs text-gray-400">{a.authorName} · {formatDateTime(a.createdAt)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
