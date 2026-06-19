'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Rocket, ShieldCheck } from 'lucide-react'
import { DypaForm, DypaFormValue } from '@/components/dypa/dypa-form'

export default function PublicDypaPage() {
  const { token } = useParams<{ token: string }>()
  const [value, setValue] = useState<DypaFormValue | null>(null)
  const [business, setBusiness] = useState<{ onomasia: string | null; afm: string } | null>(null)
  const [program, setProgram] = useState<{ title: string } | null>(null)
  const [pricing, setPricing] = useState<any>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch(`/api/public/dypa/${token}`)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Σφάλμα')
      return
    }
    setValue(data.assignment)
    setBusiness(data.business)
    setProgram(data.program)
    setPricing(data.pricing)
  }

  useEffect(() => { load() }, [token])

  async function patch(p: Record<string, any>) {
    setValue(v => v ? { ...v, ...p } : v)
    await fetch(`/api/public/dypa/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
  }

  async function submitTaxisnet(taxisnetUsername: string, taxisnetPassword: string) {
    await fetch(`/api/public/dypa/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taxisnetUsername, taxisnetPassword }) })
    load()
  }

  async function acceptTerms() {
    await fetch(`/api/public/dypa/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms: true }) })
    load()
  }

  async function finalAccept(businessClaimsPaid: boolean) {
    setSaving(true)
    await fetch(`/api/public/dypa/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalAccept: true, businessClaimsPaid }) })
    setSaving(false)
    load()
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (!value) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Φόρτωση...</div>
  }

  const businessName = business?.onomasia || business?.afm || ''

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Rocket size={16} className="text-white" />
          </div>
          <span className="font-bold text-slate-900 text-lg">I-MENTOR Portal</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Rocket size={26} className="text-indigo-600" /> Πρόσληψη Ανέργου με Επιδότηση ΔΥΠΑ
          </h1>
          <p className="text-slate-500 text-sm">
            {businessName && <>Φόρμα ανάθεσης για την επιχείρηση <strong>{businessName}</strong>{program?.title ? <> — {program.title}</> : null}</>}
          </p>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900 flex items-start gap-2">
          <ShieldCheck size={18} className="mt-0.5 flex-shrink-0" />
          Συμπληρώστε όλα τα παρακάτω βήματα για να αναθέσετε στην I-MENTOR την υποβολή της αίτησής σας στη ΔΥΠΑ. Όλα τα στοιχεία αποθηκεύονται με ασφάλεια.
        </div>

        <DypaForm
          value={value}
          onPatch={patch}
          onSubmitTaxisnet={submitTaxisnet}
          onAcceptTerms={acceptTerms}
          onFinalAccept={finalAccept}
          onSetHireStartDate={() => {}}
          pricing={pricing}
          canSetHireDate={false}
          canConfirmPayment={false}
          showTaxisnet
          saving={saving}
        />
      </main>
    </div>
  )
}
