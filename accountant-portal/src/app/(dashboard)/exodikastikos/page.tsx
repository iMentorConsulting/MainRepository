'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, ExternalLink, Scale, Trash2, Sparkles, TrendingDown, CalendarClock, Wand2, LayoutDashboard, FileSearch, ShieldCheck, Handshake, Coins, PiggyBank, CheckCircle2 } from 'lucide-react'
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

  async function handleDelete(id: string, caseNumber: number) {
    if (!confirm(`Διαγραφή της αίτησης #${caseNumber}; Η ενέργεια δεν αναιρείται.`)) return
    const res = await fetch(`/api/exodikastikos/${id}`, { method: 'DELETE' })
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
          <h1 className="text-2xl font-bold text-gray-900">Αναθέσεις Εξωδικαστικού</h1>
          <p className="text-gray-500 mt-1">{cases.length} αιτήσεις δωρεάν εκτίμησης</p>
        </div>
        <Link href="/exodikastikos/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέα Αίτηση
          </Button>
        </Link>
      </div>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 55%, #be185d 100%)' }}>
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative p-6 sm:p-8 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            Εξωδικαστικός Μηχανισμός
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight max-w-2xl">
            Δώστε στους πελάτες σας μια δεύτερη ευκαιρία —<br className="hidden sm:block" />
            και κερδίστε προμήθεια σε κάθε ανάθεση.
          </h2>
          <p className="mt-3 text-indigo-100 max-w-2xl text-sm sm:text-base">
            Κάθε πελάτης σας με οφειλές προς Δημόσιο, ΕΦΚΑ ή τράπεζες είναι μια ευκαιρία: για εκείνον να αποκτήσει
            μια ρεαλιστική, τεκμηριωμένη πρόταση ρύθμισης, και για εσάς να αποκτήσετε ένα νέο κανάλι εσόδων χωρίς
            καμία επιπλέον δουλειά — όλη η διαδικασία αναλαμβάνεται από την ομάδα της I-MENTOR.
          </p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">420</div>
              <div className="text-[11px] text-indigo-100 mt-0.5">δόσεις σε τράπεζες &amp; funds</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">240</div>
              <div className="text-[11px] text-indigo-100 mt-0.5">δόσεις σε Δημόσιο &amp; ΕΦΚΑ</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">Πρόβλεψη</div>
              <div className="text-[11px] text-indigo-100 mt-0.5">αποτελέσματος πριν την υποβολή</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">~15</div>
              <div className="text-[11px] text-indigo-100 mt-0.5">ημέρες για δωρεάν εκτίμηση</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/exodikastikos/new">
              <Button className="bg-white text-indigo-700 hover:bg-indigo-50">
                <Plus size={16} className="mr-2" />
                Ξεκινήστε μια νέα ανάθεση
              </Button>
            </Link>
            <a href="https://i-mentor.gr/exodikastikos/" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
                Δείτε την υπηρεσία <ExternalLink size={14} className="ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* ─── Commission teaser ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
            <Coins size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
              Κερδίζετε προμήθεια σε κάθε ανάθεση
              <Badge variant="success">Νέο εισόδημα</Badge>
            </h3>
            <p className="text-sm text-emerald-800/80 mt-1 max-w-2xl">
              Κάθε υπόθεση πελάτη σας που προχωράει στον Εξωδικαστικό συνοδεύεται από αμοιβή για το γραφείο σας.
              Δεν χρειάζεται να αναλάβετε καμία διαδικασία — απλά συστήνετε τον πελάτη, η I-MENTOR κάνει τα
              υπόλοιπα, και η προμήθεια υπολογίζεται και πιστώνεται αυτόματα στην ενότητα{' '}
              <Link href="/commissions" className="font-semibold underline hover:text-emerald-900">Προμήθειες</Link>.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Why it's different ──────────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Wand2 size={18} className="text-violet-600" />
          Τι κάνει τη μεθοδολογία μας σοβαρή και τεκμηριωμένη
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center mb-3">
              <FileSearch size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Εργαλείο πρόβλεψης αποτελέσματος</p>
            <p className="text-xs text-gray-500 mt-1">
              Πριν την υποβολή, αναλύουμε τα δεδομένα της υπόθεσης και παράγουμε μια ρεαλιστική, τεκμηριωμένη
              πρόβλεψη του αποτελέσματος της ρύθμισης, ώστε ο πελάτης να γνωρίζει εξ αρχής τι να περιμένει.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-3">
              <LayoutDashboard size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Προσωπικό portal παρακολούθησης</p>
            <p className="text-xs text-gray-500 mt-1">
              Ο πελάτης (και εσείς) παρακολουθείτε live την πρόοδο της υπόθεσης — έγγραφα, στάδια, αποτελέσματα —
              χωρίς τηλέφωνα και emails για ενημέρωση.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
              <PiggyBank size={18} />
            </div>
            <p className="font-semibold text-sm text-gray-900">Σχέδιο αναδιάρθρωσης ως μέρος της πρότασης</p>
            <p className="text-xs text-gray-500 mt-1">
              Εκπονούμε σχέδιο αναδιάρθρωσης και το υποβάλλουμε στην πλατφόρμα μαζί με την αίτηση, ώστε να
              ενισχύσουμε την τεκμηρίωση και τη βιωσιμότητα της πρότασης ρύθμισης.
            </p>
          </div>
        </div>
      </div>

      {/* ─── How it works ────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Handshake size={18} className="text-indigo-600" />
          Το ταξίδι του πελάτη σας — εσείς απλά τον συστήνετε
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Handshake, title: '1. Σύσταση πελάτη', desc: 'Δημιουργείτε νέα ανάθεση με 2 κλικ από αυτή τη σελίδα. Τέλος.' },
            { icon: FileSearch, title: '2. Δωρεάν εκτίμηση', desc: 'Η I-MENTOR αντλεί τα στοιχεία οφειλών και ετοιμάζει εκτίμηση εντός ~15 ημερών.' },
            { icon: ShieldCheck, title: '3. Διαπραγμάτευση', desc: 'Υποβολή αίτησης, σχέδιο αναδιάρθρωσης και διαπραγμάτευση με πιστωτές (~2 μήνες).' },
            { icon: CheckCircle2, title: '4. Αποδοχή & Προμήθεια', desc: 'Ο πελάτης λαμβάνει την ρύθμιση και το γραφείο σας λαμβάνει την προμήθειά του.' },
          ].map((step, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 relative">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <step.icon size={18} />
              </div>
              <p className="font-semibold text-sm text-gray-900">{step.title}</p>
              <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Why it's a serious option ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center"><TrendingDown size={20} /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">Ρεαλιστική, τεκμηριωμένη πρόταση</p>
            <p className="text-xs text-gray-500">Κάθε ρύθμιση βασίζεται σε ανάλυση δεδομένων, όχι σε υποσχέσεις για μεγάλα κουρέματα.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><CalendarClock size={20} /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">Έως 420 / 240 δόσεις</p>
            <p className="text-xs text-gray-500">ευνοϊκή αποπληρωμή σε τράπεζες/funds και Δημόσιο/ΕΦΚΑ, ανάλογα με την υπόθεση.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><Scale size={20} /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">Μηδενικό ρίσκο για εσάς</p>
            <p className="text-xs text-gray-500">Καμία αμοιβή προς εσάς αν δεν προχωρήσει η υπόθεση — απλά κερδίζετε.</p>
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
