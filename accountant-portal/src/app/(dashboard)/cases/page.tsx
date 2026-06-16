'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { NewCaseModal } from '@/components/cases/new-case-modal'
import { Plus, Trash2, Sparkles, MessageCircle, LayoutDashboard, CalendarClock, ShieldCheck, Coins } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  NEW: 'info', ACCEPTED: 'purple', IN_PROGRESS: 'warning',
  WAITING_CLIENT: 'secondary', WAITING_ACCOUNTANT: 'secondary',
  COMPLETED: 'success', CANCELLED: 'danger',
}
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Χαμηλή', NORMAL: 'Κανονική', HIGH: 'Υψηλή', URGENT: 'Επείγον' }
const PRIORITY_VARIANT: Record<string, any> = { LOW: 'secondary', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' }
const TYPE_LABELS: Record<string, string> = {
  TAKE_OVER: 'Ανάληψη Πελάτη', CONTACT_CLIENT: 'Επικοινωνία με Πελάτη',
  APPLICATION_SUPPORT: 'Υποστήριξη Αίτησης', OTHER: 'Άλλο',
}

export default function CasesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [cases, setCases] = useState<any[]>([])
  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])

  async function fetchCases() {
    const params = new URLSearchParams()
    if (statusFilter.length) params.set('statuses', statusFilter.join(','))
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    const res = await fetch(`/api/cases?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setCases(d.cases || [])
      setAccountants(d.accountants || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchCases() }, [statusFilter, accountantFilter])

  async function deleteCase(c: any) {
    if (!confirm(`Διαγραφή υπόθεσης #${c.caseNumber}; Η ενέργεια δεν αναιρείται.`)) return
    const res = await fetch(`/api/cases/${c.id}`, { method: 'DELETE' })
    if (res.ok) {
      setCases(prev => prev.filter(x => x.id !== c.id))
    } else {
      alert('Σφάλμα διαγραφής')
    }
  }

  const counts = cases.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Αναθέσεις Προγραμμάτων</h1>
          <p className="text-gray-500 mt-1">{cases.length} αναθέσεις</p>
        </div>
      </div>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #4338ca 55%, #6d28d9 100%)' }}>
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative p-6 sm:p-8 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            Αναθέσεις Προγραμμάτων
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Κάθε επιχορήγηση είναι μια ευκαιρία για τον πελάτη σας,<br className="hidden sm:block" />
            και εμείς αναλαμβάνουμε την υλοποίηση χωρίς άγχος και αβεβαιότητα.
          </h2>
          <p className="mt-3 text-indigo-100 text-sm sm:text-base">
            Η ομάδα της I-MENTOR έχει πολυετή εμπειρία στην υλοποίηση επιχορηγούμενων προγραμμάτων (ΕΣΠΑ, ΔΥΠΑ,
            μικροπιστώσεις και άλλα). Από την αίτηση έως την αποπληρωμή, ο πελάτης σας έχει πάντα ξεκάθαρη εικόνα
            για το πού βρίσκεται η υπόθεσή του, μέσα από το σύστημα διαχείρισης υποθέσεων (case management) που
            χρησιμοποιούμε.
          </p>

          <div className="mt-6">
            <Button onClick={() => setShowNew(true)} size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 shadow-md">
              <Plus size={18} className="mr-2" />
              Νέα Ανάθεση
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Case management / communication ─────────────────────────────── */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <MessageCircle size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-indigo-900">Ο πελάτης ξέρει πάντα πού βρίσκεται</h3>
            <p className="text-sm text-indigo-800/80 mt-1">
              Το σύστημα διαχείρισης υποθέσεων (case management) της I-MENTOR ενημερώνει αυτόματα τον πελάτη με
              Viber και email σε κάθε αλλαγή σταδίου της ανάθεσης, από την υποβολή έως την έγκριση και την
              αποπληρωμή. Καμία υπόθεση δεν χάνεται, και ο πελάτης δεν χρειάζεται να ρωτά πού βρίσκεται η αίτησή
              του, κάτι που μειώνει τον φόρτο και για το γραφείο σας.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Commission ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
            <Coins size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
              Κερδίζετε προμήθεια για κάθε υλοποίηση
              <Badge variant="success">Νέο εισόδημα</Badge>
            </h3>
            <p className="text-sm text-emerald-800/80 mt-1">
              Όταν ένας πελάτης σας προχωράει σε υλοποίηση επιχορηγούμενου προγράμματος μέσω της I-MENTOR, το
              γραφείο σας λαμβάνει προμήθεια. Η κατάσταση και το ύψος της αμοιβής σας εμφανίζονται στην ενότητα{' '}
              <Link href="/commissions" className="font-semibold underline hover:text-emerald-900">Προμήθειες</Link>.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Why it's reliable ────────────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck size={18} className="text-indigo-600" />
          Γιατί οι πελάτες σας είναι σε καλά χέρια
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-3">
              <ShieldCheck size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Έμπειρη ομάδα υλοποίησης</p>
            <p className="text-xs text-gray-500 mt-1">
              Πολυετή εμπειρία σε ΕΣΠΑ, ΔΥΠΑ και άλλα προγράμματα. Γνωρίζουμε τις απαιτήσεις, τις προθεσμίες και
              τις παγίδες κάθε πρόσκλησης.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center mb-3">
              <LayoutDashboard size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Προσωπικό ασφαλές portal</p>
            <p className="text-xs text-gray-500 mt-1">
              Ο πελάτης (και εσείς) έχετε πρόσβαση σε ασφαλές portal για την παρακολούθηση της υπόθεσης, χωρίς
              να χρειάζονται τηλέφωνα και emails για ενημέρωση.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <CalendarClock size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Παρακολούθηση προθεσμιών</p>
            <p className="text-xs text-gray-500 mt-1">
              Παρακολουθούμε συστηματικά τις προθεσμίες υποβολών και δικαιολογητικών κάθε προγράμματος, ώστε να
              μη χάνεται καμία ευκαιρία λόγω καθυστέρησης.
            </p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <Badge key={k} variant={STATUS_VARIANT[k]}>{label}: {counts[k] || 0}</Badge>
          ))}
        </div>
      )}

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
                <Th>Επιχείρηση</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Τύπος</Th>
                <Th>Τίτλος</Th>
                <Th>Προτεραιότητα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
                {isAdmin && <Th></Th>}
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 9 : 7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν υποθέσεις</Td>
                </TableRow>
              ) : (
                cases.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/cases/${c.id}`} className="font-medium text-blue-800 hover:underline">#{c.caseNumber}</Link>
                    </Td>
                    <Td className="text-sm">
                      <Link href={`/businesses/${c.business?.id}`} className="hover:underline">{c.business?.onomasia || c.business?.afm}</Link>
                    </Td>
                    {isAdmin && <Td className="text-sm text-gray-500">{c.accountant?.officeName}</Td>}
                    <Td className="text-sm text-gray-500">{c.caseType || TYPE_LABELS[c.requestType] || c.requestType}</Td>
                    <Td>
                      <Link href={`/cases/${c.id}`} className="text-sm font-medium text-gray-900 hover:underline">{c.title}</Link>
                    </Td>
                    <Td><Badge variant={PRIORITY_VARIANT[c.priority]}>{PRIORITY_LABELS[c.priority]}</Badge></Td>
                    <Td><Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(c.createdAt)}</Td>
                    {isAdmin && (
                      <Td>
                        <button onClick={() => deleteCase(c)} className="text-gray-400 hover:text-red-500" title="Διαγραφή">
                          <Trash2 size={15} />
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

      <NewCaseModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); fetchCases() }} />
    </div>
  )
}

