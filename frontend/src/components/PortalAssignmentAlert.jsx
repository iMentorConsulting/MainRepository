import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellAlertIcon, CheckCircleIcon, XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'
import { getPendingPortalAssignments, acceptPortalAssignment, dismissPortalAssignment, getUsers } from '../api'
import toast from 'react-hot-toast'

const POLL_MS = 30000
const SNOOZE_MS = 15 * 60 * 1000
const SNOOZE_KEY = 'cm_portal_assignment_snoozes'

function loadSnoozes() {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}')
    const now = Date.now()
    const cleaned = {}
    for (const [id, until] of Object.entries(raw)) {
      if (until > now) cleaned[id] = until
    }
    return cleaned
  } catch {
    return {}
  }
}

function saveSnoozes(snoozes) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes))
}

export default function PortalAssignmentAlert() {
  const [pending, setPending] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [snoozes, setSnoozes] = useState(loadSnoozes)
  const [users, setUsers] = useState([])
  // Per-card selected consultant: { [assignmentId]: userId }
  const [selectedConsultant, setSelectedConsultant] = useState({})
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
    getUsers().then(u => setUsers(Array.isArray(u) ? u : (u.items || []))).catch(() => {})
    const t = setInterval(refresh, POLL_MS)
    const snoozeTick = setInterval(() => setSnoozes(loadSnoozes), POLL_MS)
    return () => { clearInterval(t); clearInterval(snoozeTick) }
  }, [])

  const handleAccept = async (a) => {
    setBusyId(a.id)
    try {
      const assignedToId = selectedConsultant[a.id] ? parseInt(selectedConsultant[a.id]) : null
      const res = await acceptPortalAssignment(a.id, assignedToId)
      const assignedName = assignedToId
        ? (users.find(u => u.id === assignedToId)?.full_name || 'σύμβουλο')
        : 'εσάς'
      toast.success(`Δημιουργήθηκε νέο lead από την ανάθεση #${a.case_number} → ${assignedName}`)
      setPending(p => p.filter(x => x.id !== a.id))
      if (res?.lead_id) navigate('/leads')
      else if (res?.case_id) navigate(`/cases/${res.case_id}`)
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

  const handleSnooze = (a) => {
    setSnoozes(prev => {
      const next = { ...prev, [a.id]: Date.now() + SNOOZE_MS }
      saveSnoozes(next)
      return next
    })
    toast.success(`Η ειδοποίηση για την υπόθεση #${a.case_number} θα επανεμφανιστεί σε 15'`)
  }

  const visible = pending.filter(a => !(snoozes[a.id] && snoozes[a.id] > Date.now()))

  if (visible.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-3 p-4 pointer-events-none">
      {visible.map(a => (
        <div
          key={a.id}
          className="pointer-events-auto w-full max-w-xl max-h-[85vh] flex flex-col bg-amber-50 border-2 border-amber-400 rounded-xl shadow-2xl p-4 ring-4 ring-amber-300/60"
        >
          <div className="flex items-start gap-3 min-h-0">
            <div className="shrink-0 w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center">
              <BellAlertIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="font-bold text-amber-900">
                Νέα Ανάθεση #{a.case_number} — αποδοχή δημιουργεί lead
              </div>
              <div className="text-sm text-amber-800 mt-1 space-y-0.5 overflow-y-auto min-h-0">
                <div><span className="font-semibold">Επιχείρηση:</span> {a.onomasia || '—'} {a.afm ? `(ΑΦΜ ${a.afm})` : ''}</div>
                {a.accountant_office && <div><span className="font-semibold">Λογιστικό Γραφείο:</span> {a.accountant_office}</div>}
                {(a.program_title || a.case_type) && <div><span className="font-semibold">Πρόγραμμα/Τύπος:</span> {a.program_title || a.case_type}</div>}
                {a.description && <div className="italic text-amber-700 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{a.description}</div>}
              </div>

              {/* Consultant picker */}
              {users.length > 0 && (
                <div className="mt-2">
                  <label className="text-xs font-semibold text-amber-800">Ανάθεση σε σύμβουλο:</label>
                  <select
                    value={selectedConsultant[a.id] || ''}
                    onChange={e => setSelectedConsultant(prev => ({ ...prev, [a.id]: e.target.value }))}
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Εμένα (προεπιλογή) —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 mt-3 shrink-0">
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
                <button
                  onClick={() => handleSnooze(a)}
                  disabled={busyId === a.id}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <ClockIcon className="w-4 h-4" />
                  Αναβολή 15'
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
