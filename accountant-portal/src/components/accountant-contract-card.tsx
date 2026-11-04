'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSignature, CheckCircle2 } from 'lucide-react'

// Shown to accountants on /commissions — prompts them to sign the
// collaboration/commission contract once, or shows a "signed" badge with a
// link to view/print it afterwards.
export function AccountantContractCard() {
  const [contract, setContract] = useState<{ uniqueCode: string } | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/accountant-contract')
      .then(r => r.json())
      .then(d => setContract(d.contract || null))
      .catch(() => setContract(null))
  }, [])

  if (contract === undefined) return null

  return (
    <Link href="/commissions/contract" className="block">
      <div className={`rounded-2xl p-4 border flex items-center gap-3 transition-colors ${contract ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'}`}>
        {contract ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" /> : <FileSignature size={20} className="text-indigo-600 shrink-0" />}
        <div>
          <p className={`text-sm font-semibold ${contract ? 'text-emerald-800' : 'text-indigo-800'}`}>
            {contract ? 'Υπογεγραμμένη Σύμβαση Συνεργασίας' : 'Υπογραφή Σύμβασης Συνεργασίας'}
          </p>
          <p className={`text-xs ${contract ? 'text-emerald-700/80' : 'text-indigo-700/80'}`}>
            {contract ? `Κωδικός ${contract.uniqueCode} — δείτε ή κατεβάστε την` : 'Απαιτείται για τη συνεργασία με την I-MENTOR'}
          </p>
        </div>
      </div>
    </Link>
  )
}
