import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellAlertIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { getPendingPortalAssignments, acceptPortalAssignment, dismissPortalAssignment } from '../api'
import toast from 'react-hot-toast'

const POLL_MS = 30000

export default function PortalAssignmentAlert() {
  const [pending, setPending] = useState([])
  const [busyId, setBusyId] = useState(null)
  const navigate = useNavigate()
  const seenIds = useRef(new Set())

  const refresh = async () => {
    try {
      const rows = await getPendingPortalAssignments()
      setPending(rows)
      for (const a of rows) {
        if (!seenIds.current.has(a.id)) {
          seenIds.current.add(a.id)
        }
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [])

  const handleAccept = async (a) => {
    setBusyId(a.id)
    try {
      const res = await acceptPortalAssignment(a.id)
      toast.success(`Η υπόθεση #${a.case_number} δημιουργήθηκε`)
      setPending(p => p.filter(x => x.id !== a.id))
      if (res?.case_id) navigate(`/cases/${res.case_id}`)
    } catch {
      toast.error('Σφάλμα αποδοχής ανάθεσης')
    } finally {
      setBusyId(null)
    }
  }

  const handleDismiss = async (a) => {
    setBusyId(a.id)
    try {
      await dismissPortalAssignment(a.id)
      setPending(p => p.filter(x => x.id !== a.id))
    } catch {
      toast.error('Σφάλμα απόρριψης')
    } finally {
      setBusyId(null)
    }
  }

  if (pending.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-3 p-4 pointer-events-none">
      {pending.map(a => (
        <div
          key={a.id}
          className="pointer-events-auto w-full max-w-xl bg-amber-50 border-2 border-amber-400 rounded-xl shadow-2xl p-4 ring-4 ring-amber-300/60"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center">
              <BellAlertIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-900">
                Νέα Ανάθεση Υπόθεσης #{a.case_number} — απαιτεί αποδοχή
              </div>
              <div className="text-sm text-amber-800 mt-1 space-y-0.5">
                <div><span className="font-semibold">Επιχείρηση:</span> {a.onomasia || '—'} {a.afm ? `(ΑΦΜ ${a.afm})` : ''}</div>
                {a.accountant_office && <div><span className="font-semibold">Λογιστικό Γραφείο:</span> {a.accountant_office}</div>}
                {(a.program_title || a.case_type) && <div><span className="font-semibold">Πρόγραμμα/Τύπος:</span> {a.program_title || a.case_type}</div>}
                {a.description && <div className="italic text-amber-700">{a.description}</div>}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAccept(a)}
                  disabled={busyId === a.id}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Αποδοχή
                </button>
                <button
                  onClick={() => handleDismiss(a)}
                  disabled={busyId === a.id}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Απόρριψη
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
