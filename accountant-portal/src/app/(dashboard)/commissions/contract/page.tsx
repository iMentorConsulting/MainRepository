'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileSignature, Printer, CheckCircle2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { IMENTOR_PARTY } from '@/lib/accountant-contract-template'

interface Clause { title: string; body: string }
interface ContractData {
  id: string
  officeOnomasia: string | null
  officeAfm: string | null
  officeAddress: string | null
  officeLegalStatus: string | null
  officeDoy: string | null
  signerName: string
  uniqueCode: string
  signedAt: string
}
interface Prefill {
  officeOnomasia: string | null
  officeAfm: string | null
  officeAddress: string | null
  officeLegalStatus: string | null
  officeDoy: string | null
  signerName: string
}

export default function AccountantContractPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const isAdmin = session?.user?.role === 'ADMIN'
  const adminAccountantId = searchParams.get('accountantId')

  const [contract, setContract] = useState<ContractData | null>(null)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [clauses, setClauses] = useState<Clause[]>([])
  const [loading, setLoading] = useState(true)
  const [signerName, setSignerName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    const qs = isAdmin && adminAccountantId ? `?accountantId=${adminAccountantId}` : ''
    fetch(`/api/accountant-contract${qs}`)
      .then(r => r.json())
      .then(d => {
        setContract(d.contract || null)
        setPrefill(d.prefill || null)
        setClauses(d.clauses || [])
        if (d.prefill?.signerName) setSignerName(d.prefill.signerName)
      })
      .finally(() => setLoading(false))
  }, [isAdmin, adminAccountantId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSign() {
    if (!accepted || !signerName.trim()) return
    setSigning(true)
    setError('')
    try {
      const res = await fetch('/api/accountant-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim(), accepted: true }),
      })
      if (res.ok) {
        fetchData()
      } else {
        const data = await res.json()
        setError(data.error || 'Σφάλμα υπογραφής')
      }
    } catch {
      setError('Σφάλμα δικτύου')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" /></div>
  }

  const office = contract || prefill
  const canSign = !isAdmin && !contract

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/commissions" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Πίσω στις Προμήθειες
        </Link>
        {contract && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} className="mr-2" /> Εκτύπωση / Λήψη PDF
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8 print:shadow-none print:border-none">
        <div className="flex items-center gap-2 mb-1">
          <FileSignature size={18} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Σύμβαση Συνεργασίας</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">μεταξύ {IMENTOR_PARTY.name} και λογιστικού γραφείου</p>

        {contract && (
          <div className="mb-6 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <div className="text-sm text-emerald-800">
              <p className="font-semibold">Υπογεγραμμένη σύμβαση</p>
              <p>Κωδικός: <span className="font-mono">{contract.uniqueCode}</span> · Ημερομηνία: {formatDateTime(contract.signedAt)} · Υπογράφων: {contract.signerName}</p>
            </div>
          </div>
        )}

        {office && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="font-semibold text-gray-700 mb-1">I-MENTOR</p>
              <p className="text-gray-600">{IMENTOR_PARTY.name}</p>
              <p className="text-gray-500">ΑΦΜ: {IMENTOR_PARTY.afm}</p>
              <p className="text-gray-500">{IMENTOR_PARTY.address}</p>
              <p className="text-gray-500">Εκπρόσωπος: {IMENTOR_PARTY.representative}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="font-semibold text-gray-700 mb-1">Λογιστικό Γραφείο</p>
              <p className="text-gray-600">{office.officeOnomasia || '—'}</p>
              <p className="text-gray-500">ΑΦΜ: {office.officeAfm || '—'}{office.officeLegalStatus ? ` (${office.officeLegalStatus})` : ''}</p>
              <p className="text-gray-500">{office.officeAddress || '—'}</p>
              {office.officeDoy && <p className="text-gray-500">ΔΟΥ: {office.officeDoy}</p>}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {clauses.map((c, i) => (
            <div key={i}>
              <p className="font-semibold text-gray-800 text-sm mb-1">{c.title}</p>
              <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>

        {canSign && (
          <div className="mt-8 pt-6 border-t border-gray-100 print:hidden">
            <label className="text-xs font-medium text-gray-500 block mb-1">Ονοματεπώνυμο υπογράφοντος</label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
            />
            <label className="flex items-start gap-2 text-sm text-gray-700 mb-4">
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-0.5" />
              Διάβασα και αποδέχομαι τους όρους της παρούσας σύμβασης.
            </label>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <Button onClick={handleSign} disabled={!accepted || !signerName.trim() || signing}>
              <FileSignature size={16} className="mr-2" />
              {signing ? 'Υπογραφή...' : 'Υπογραφή Σύμβασης'}
            </Button>
          </div>
        )}

        {isAdmin && !contract && (
          <p className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-400 print:hidden">Το γραφείο δεν έχει υπογράψει ακόμη τη σύμβαση.</p>
        )}
      </div>
    </div>
  )
}
