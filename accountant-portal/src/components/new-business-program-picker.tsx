'use client'
import { useEffect, useState } from 'react'
import { X, Mail, Lightbulb } from 'lucide-react'

interface PickerProgram {
  id: string
  title: string
  category: string
  zipStatus: 'eligible' | 'not-eligible' | 'no-restriction' | 'unknown'
  regionRules: string[]
}

// Fetches the programs that accept υπό ίδρυση businesses for this business and
// exposes them to a small trigger button + picker modal.
export function useNewBusinessPrograms(businessId: string, enabled: boolean) {
  const [data, setData] = useState<{ zip: string | null; programs: PickerProgram[] } | null>(null)
  useEffect(() => {
    if (!enabled) return
    fetch(`/api/businesses/${businessId}/new-business-programs`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d))
      .catch(() => {})
  }, [businessId, enabled])
  return data
}

function ZipBadge({ status, zip }: { status: PickerProgram['zipStatus']; zip: string | null }) {
  if (status === 'eligible') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✅ ΤΚ {zip} επιλέξιμος</span>
  if (status === 'not-eligible') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠️ ΤΚ {zip} μη επιλέξιμος</span>
  if (status === 'no-restriction') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">Χωρίς γεωγραφικό περιορισμό</span>
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">ΤΚ άγνωστος</span>
}

export function NewBusinessProgramPicker({ zip, programs, onClose, onProgramEmail, onAdvice }: {
  zip: string | null
  programs: PickerProgram[]
  onClose: () => void
  onProgramEmail: (p: { id: string; title: string; category?: string }) => void
  onAdvice: (p: { id: string; title: string }) => void
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Email για πρόγραμμα υπό ίδρυση επιχειρήσεων</h2>
            <p className="text-xs text-gray-500 mt-0.5">Προγράμματα που δέχονται και νέες επιχειρήσεις, από όλες τις περιοχές. Η ένδειξη ΤΚ αφορά την έδρα της επιχείρησης και δεν εμποδίζει την αποστολή.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {programs.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Δεν υπάρχουν προγράμματα υπό ίδρυση.</p>}
          {programs.map(p => (
            <div key={p.id} className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">{p.title}</p>
              <div className="mt-1 mb-2"><ZipBadge status={p.zipStatus} zip={zip} /></div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { onClose(); onProgramEmail({ id: p.id, title: p.title, category: p.category }) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50"
                >
                  <Mail size={12} /> Προεπισκόπηση &amp; Αποστολή Email
                </button>
                <button
                  onClick={() => { onClose(); onAdvice({ id: p.id, title: p.title }) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50"
                >
                  <Lightbulb size={12} /> Ενημέρωση &amp; Επόμενα Βήματα
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
