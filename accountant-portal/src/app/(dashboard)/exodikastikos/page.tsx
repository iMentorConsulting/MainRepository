'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, ExternalLink, Scale, Trash2, Sparkles, TrendingDown, CalendarClock, Wand2, LayoutDashboard, FileSearch, ShieldCheck, Handshake, Coins, PiggyBank, CheckCircle2, PlayCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

// Σύντομα ενημερωτικά βίντεο (YouTube) για την υπηρεσία και τη μεθοδολογία εκτίμησης.
// Συμπληρώστε το videoId (το κομμάτι μετά το v= ή youtu.be/) για να εμφανιστεί το βίντεο.
const ONBOARDING_VIDEOS: { title: string; videoId: string }[] = [
  { title: 'Εμπειρία & σύστημα στον εξωδικαστικό', videoId: 'XozxChuyE8I' },
  { title: 'Δωρεάν προσομοίωση αποτελέσματος', videoId: 'jrqwOKUOT_c' },
  { title: 'Πότε γίνονται διαγραφές', videoId: 'AqcJGo3Cmys' },
  { title: 'Προσομοίωση πριν την υποβολή', videoId: '0xBy6JiTV9A' },
]

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
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Δώστε στους πελάτες σας μια δεύτερη ευκαιρία<br className="hidden sm:block" />
            και κερδίστε προμήθεια σε κάθε ανάθεση.
          </h2>
          <p className="mt-3 text-indigo-100 text-sm sm:text-base">
            Κάθε πελάτης σας με οφειλές προς Δημόσιο, ΕΦΚΑ ή τράπεζες είναι μια ευκαιρία: για εκείνον να αποκτήσει
            μια ρεαλιστική, τεκμηριωμένη πρόταση ρύθμισης, και για εσάς να αποκτήσετε ένα νέο κανάλι εσόδων χωρίς
            καμία επιπλέον δουλειά. Όλη η διαδικασία αναλαμβάνεται από την ομάδα της I-MENTOR.
          </p>

          <div className="mt-6 grid grid-cols-4 gap-3">
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
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10">
                Δείτε την υπηρεσία <ExternalLink size={14} className="ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* ─── Info row: commission + methodology + steps ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Commission */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0"><Coins size={14} /></div>
            <p className="text-sm font-bold text-emerald-900">Κερδίζετε προμήθεια <Badge variant="success" className="ml-1">Νέο</Badge></p>
          </div>
          <p className="text-xs text-emerald-800/80">
            Κάθε ανάθεση που προχωράει συνοδεύεται από αμοιβή για το γραφείο σας — καταβάλλεται με την πληρωμή της αρχικής αμοιβής από τον πελάτη.{' '}
            <Link href="/commissions" className="font-semibold underline hover:text-emerald-900">Προμήθειες →</Link>
          </p>
          <div className="mt-auto pt-2 border-t border-emerald-200 grid grid-cols-3 gap-2 text-center">
            {[['420', 'δόσεις τράπεζες'], ['240', 'δόσεις Δημόσιο'], ['~15', 'ημέρες εκτίμηση']].map(([n, l]) => (
              <div key={n}>
                <p className="text-base font-bold text-emerald-800">{n}</p>
                <p className="text-[10px] text-emerald-600">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 size={14} className="text-violet-500" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Γιατί είμαστε διαφορετικοί</p>
          </div>
          <div className="space-y-2.5">
            {[
              { icon: FileSearch, color: 'text-violet-600 bg-violet-50', title: 'Πρόβλεψη αποτελέσματος', desc: 'Ρεαλιστική εκτίμηση πριν την υποβολή.' },
              { icon: LayoutDashboard, color: 'text-indigo-600 bg-indigo-50', title: 'Portal παρακολούθησης', desc: 'Live παρακολούθηση — χωρίς τηλέφωνα.' },
              { icon: PiggyBank, color: 'text-rose-600 bg-rose-50', title: 'Σχέδιο αναδιάρθρωσης', desc: 'Εκπονείται και υποβάλλεται μαζί με την αίτηση.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 ${item.color}`}><item.icon size={12} /></div>
                <div>
                  <p className="text-xs font-semibold text-gray-800">{item.title}</p>
                  <p className="text-[11px] text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Handshake size={14} className="text-indigo-500" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Εσείς απλά συστήνετε</p>
          </div>
          <div className="space-y-2.5">
            {[
              { n: '1', color: 'bg-teal-100 text-teal-700', title: 'Σύσταση πελάτη', desc: '2 κλικ από αυτή τη σελίδα. Τέλος.' },
              { n: '2', color: 'bg-blue-100 text-blue-700', title: 'Δωρεάν εκτίμηση', desc: 'Η I-MENTOR ετοιμάζει εντός ~15 ημερών.' },
              { n: '3', color: 'bg-amber-100 text-amber-700', title: 'Διαπραγμάτευση', desc: 'Υποβολή & διαπραγμάτευση (~2 μήνες).' },
              { n: '4', color: 'bg-emerald-100 text-emerald-700', title: 'Αμοιβή & Προμήθεια', desc: 'Πελάτης πληρώνει → προμήθεια στο γραφείο σας.' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${s.color}`}>{s.n}</div>
                <div>
                  <p className="text-xs font-semibold text-gray-800">{s.title}</p>
                  <p className="text-[11px] text-gray-400">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Onboarding videos + key facts ──────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <PlayCircle size={15} className="text-indigo-500" />
            Σύντομα βίντεο ενημέρωσης
          </h3>
          <div className="flex flex-wrap gap-3">
            {ONBOARDING_VIDEOS.map((v, i) => (
              <div key={i} className="w-36 shrink-0">
                <div className="aspect-[9/16] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                  {v.videoId ? (
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${v.videoId}`}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <PlayCircle size={24} className="text-gray-300" />
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1 text-center leading-tight">{v.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Key facts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 lg:w-72 shrink-0">
          {[
            { icon: TrendingDown, color: 'text-rose-600 bg-rose-50', title: 'Ρεαλιστική πρόταση', desc: 'Βάσει ανάλυσης δεδομένων, όχι υποσχέσεων.' },
            { icon: CalendarClock, color: 'text-amber-600 bg-amber-50', title: 'Έως 420 / 240 δόσεις', desc: 'Τράπεζες/funds & Δημόσιο/ΕΦΚΑ.' },
            { icon: Scale, color: 'text-indigo-600 bg-indigo-50', title: 'Προμήθεια εντός ~15 ημερών', desc: 'Με την καταβολή αρχικής αμοιβής.' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}><item.icon size={16} /></div>
              <div>
                <p className="text-xs font-bold text-gray-800">{item.title}</p>
                <p className="text-[11px] text-gray-400">{item.desc}</p>
              </div>
            </div>
          ))}
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
