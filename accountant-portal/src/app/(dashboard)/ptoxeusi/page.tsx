'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, ExternalLink, Gavel, Trash2, Sparkles, Handshake, Coins } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'info', IN_ASSESSMENT: 'warning', REPORT_READY: 'purple',
  OFFER_SENT: 'purple', ACCEPTED: 'success', DECLINED: 'danger', COMPLETED: 'success',
}

export default function PtoxeusiPage() {
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
    const res = await fetch(`/api/ptoxeusi?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setCases(d.cases || [])
      setAccountants(d.accountants || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchCases() }, [statusFilter, accountantFilter])

  async function handleDelete(id: string, caseNumber: number) {
    if (!confirm(`Διαγραφή της αίτησης #${caseNumber}; Η ενέργεια δεν αναιρείται.`)) return
    const res = await fetch(`/api/ptoxeusi/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCases(cs => cs.filter(c => c.id !== id))
    } else {
      alert('Η διαγραφή απέτυχε')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Αναθέσεις Πτώχευσης</h1>
          <p className="text-gray-500 mt-1">{cases.length} αιτήσεις δωρεάν εκτίμησης</p>
        </div>
        <Link href="/ptoxeusi/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέα Αίτηση
          </Button>
        </Link>
      </div>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 55%, #7c2d12 100%)' }}>
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative p-6 sm:p-8 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            Πτώχευση
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Δώστε στους πελάτες σας μια δεύτερη ευκαιρία<br className="hidden sm:block" />
            και κερδίστε προμήθεια σε κάθε ανάθεση.
          </h2>
          <p className="mt-3 text-slate-100 text-sm sm:text-base">
            Κάθε πελάτης σας σε οικονομικό αδιέξοδο είναι μια ευκαιρία: για εκείνον να αποκτήσει μια ρεαλιστική,
            τεκμηριωμένη αξιολόγηση της πτωχευτικής διαδικασίας, και για εσάς να αποκτήσετε ένα νέο κανάλι εσόδων
            χωρίς καμία επιπλέον δουλειά. Όλη η διαδικασία αναλαμβάνεται από την ομάδα της I-MENTOR.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ptoxeusi/new">
              <Button className="bg-white text-slate-800 hover:bg-slate-100">
                <Plus size={16} className="mr-2" />
                Ξεκινήστε μια νέα ανάθεση
              </Button>
            </Link>
            <Link href="/services">
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10">
                Δείτε τις υπηρεσίες <ExternalLink size={14} className="ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Commission + Steps ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Commission */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><Coins size={17} /></div>
            <div>
              <p className="font-bold text-emerald-900 flex items-center gap-2">Κερδίζετε προμήθεια <Badge variant="success">Νέο εισόδημα</Badge></p>
              <p className="text-sm text-emerald-800/80 mt-1">
                Κάθε υπόθεση που προχωράει στην Πτώχευση συνοδεύεται από αμοιβή για το γραφείο σας.
                Δεν χρειάζεται να αναλάβετε καμία διαδικασία — απλά συστήνετε τον πελάτη και η I-MENTOR αναλαμβάνει τα υπόλοιπα.
                Η προμήθεια καταβάλλεται με την πληρωμή της αρχικής αμοιβής.{' '}
                <Link href="/commissions" className="font-semibold underline hover:text-emerald-900">Δείτε τις Προμήθειές σας →</Link>
              </p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Handshake size={15} className="text-indigo-500" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Εσείς απλά συστήνετε — εμείς κάνουμε τα υπόλοιπα</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { n: '1', color: 'bg-teal-100 text-teal-700', title: 'Σύσταση πελάτη', desc: '2 κλικ από αυτή τη σελίδα.' },
              { n: '2', color: 'bg-blue-100 text-blue-700', title: 'Δωρεάν εκτίμηση', desc: 'Ανάλυση οικονομικής κατάστασης & πρόβλεψη αποτελέσματος.' },
              { n: '3', color: 'bg-amber-100 text-amber-700', title: 'Υποβολή Αίτησης Πτώχευσης', desc: 'Προετοιμασία φακέλου & παρακολούθηση της διαδικασίας.' },
              { n: '4', color: 'bg-emerald-100 text-emerald-700', title: 'Αμοιβή & Προμήθεια', desc: 'Ο πελάτης καταβάλλει αρχική αμοιβή και η προμήθειά σας γίνεται διαθέσιμη.' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-2.5">
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${s.color}`}>{s.n}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
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
                {isAdmin && <Th></Th>}
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 8 : 6} className="text-center text-gray-400 py-8">Δεν βρέθηκαν αιτήσεις</Td>
                </TableRow>
              ) : (
                cases.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/ptoxeusi/${c.id}`} className="font-medium text-blue-800 hover:underline">#{c.caseNumber}</Link>
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
                    {isAdmin && (
                      <Td>
                        <button onClick={() => handleDelete(c.id, c.caseNumber)} className="text-gray-400 hover:text-red-600" title="Διαγραφή">
                          <Trash2 size={16} />
                        </button>
                      </Td>
                    )}
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
