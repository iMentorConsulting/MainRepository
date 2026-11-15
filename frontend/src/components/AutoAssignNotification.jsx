import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getMyAutoAssignNotifications } from '../api'

const POLL_MS = 60_000
const STORAGE_KEY = 'cm_auto_assign_last_check'

function getLastCheck() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

function setLastCheck(iso) {
  try {
    localStorage.setItem(STORAGE_KEY, iso)
  } catch {}
}

export default function AutoAssignNotification() {
  const navigate = useNavigate()
  const timerRef = useRef(null)

  const check = async () => {
    const since = getLastCheck()
    const now = new Date().toISOString()
    try {
      const leads = await getMyAutoAssignNotifications(since)
      if (leads && leads.length > 0) {
        setLastCheck(now)
        leads.forEach(lead => {
          const prog = lead.program_title || lead.program || ''
          toast(
            (t) => (
              <button
                className="text-left w-full"
                onClick={() => {
                  navigate('/leads')
                  toast.dismiss(t.id)
                }}
              >
                <div className="font-semibold text-sm">🔔 Νέο auto-lead ανατέθηκε σε εσάς</div>
                <div className="text-xs text-gray-600 mt-0.5">{lead.name}{prog ? ` — ${prog}` : ''}</div>
              </button>
            ),
            { duration: 8000, icon: null }
          )
        })
      } else {
        // No new leads — just advance the timestamp
        setLastCheck(now)
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    // Initial check after a short delay so the user is settled in
    const initial = setTimeout(check, 5000)
    timerRef.current = setInterval(check, POLL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timerRef.current)
    }
  }, [])

  return null
}
