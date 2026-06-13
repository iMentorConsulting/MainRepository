'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, ExternalLink, Scale } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'info', IN_ASSESSMENT: 'warning', REPORT_READY: 'purple',
  OFFER_SENT: 'purple', ACCEPTED: 'success', DECLINED: 'danger', COMPLETED: 'success',
}

export default function ExodikastikosPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [cases, setCases] = useState<any[]>([])
  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])

  async function fetchCases() {
    const params = new URLSearchParams()
    if (statusFilter.length) params.set('statuses', statusFilter.join(','))
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    const res = await fetch(`/api/exodikastikos?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setCases(d.cases || [])
      setAccountants(d.accountants || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchCases() }, [statusFilter, accountantFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Εξωδικαστικός</h1>
          <p className="text-gray-500 mt-1">{cases.length} αιτήσεις δωρεάν εκτίμησης</p>
        </div>
        <Link href="/exodikastikos/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέα Αίτηση
          </Button>
        </Link>
      </div>

      <div className="flex items-start gap-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
          <Scale size={20} />
        </div>
        <div className="text-sm text-slate-700">
          <p className="font-medium mb-1">Τι είναι ο Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών;</p>
          <p className="text-slate-600">
            Δωρεάν εκτίμηση ρύθμισης/διαγραφής οφειλών προς Δημόσιο, ΕΦΚΑ και τράπεζες, για επιχειρήσεις και φυσικά
            πρόσωπα. Η ομάδα της I-MENTOR αναλαμβάνει την υπόθεση, αξιολογεί τα δεδομένα από την κρατική πλατφόρμα
            και επιστρέφει αναλυτική αναφορά και προσφορά εντός ~15 ημερών.
          </p>
          <a href="https://i-mentor.gr/exodikastikos/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-700 hover:underline font-medium mt-2">
            Περισσότερα για την υπηρεσία <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-3 items-end">
          <MultiSelect
            label="Κατάσταση"
            placeholder="Όλες οι καταστάσεις"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <MultiSelect
            label="Λογιστές"
            placeholder="Όλοι οι λογιστές"
            options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
            selected={accountantFilter}
            onChange={setAccountantFilter}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>#</Th>
                <Th>Πελάτης</Th>
                <Th>Τύπος</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
                <Th>Αποτέλεσμα</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 7 : 6} className="text-center text-gray-400 py-8">Δεν βρέθηκαν αιτήσεις</Td>
                </TableRow>
              ) : (
                cases.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/exodikastikos/${c.id}`} className="font-medium text-blue-800 hover:underline">#{c.caseNumber}</Link>
                    </Td>
                    <Td className="text-sm">
                      <Link href={`/businesses/${c.business?.id}`} className="hover:underline">{c.business?.onomasia || c.business?.afm}</Link>
                    </Td>
                    <Td className="text-sm text-gray-500">{c.business?.clientType === 'INDIVIDUAL' ? 'Φυσικό Πρόσωπο' : 'Επιχείρηση'}</Td>
                    {isAdmin && <Td className="text-sm text-gray-500">{c.accountant?.officeName || '—'}</Td>}
                    <Td><Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(c.createdAt)}</Td>
                    <Td>
                      {c.resultLink ? (
                        <a href={c.resultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-800 hover:underline">
                          Προβολή <ExternalLink size={13} />
                        </a>
                      ) : <span className="text-gray-400 text-sm">—</span>}
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
