import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listPendingExternalCases, acceptExternalCase } from '../api'

const POLL_MS = 30000

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

export default function ExternalReferralBanner({ employee }) {
  const [pending, setPending] = useState([])
  const [accepting, setAccepting] = useState(null)
  const navigate = useNavigate()
  const seenIds = useRef(new Set())
  const firstLoad = useRef(true)

  const load = async () => {
    try {
      const res = await listPendingExternalCases()
      const cases = res.data || []
      const newOnes = cases.filter(c => !seenIds.current.has(c.id))
      if (!firstLoad.current && newOnes.length > 0) {
        beep()
      }
      cases.forEach(c => seenIds.current.add(c.id))
      firstLoad.current = false
      setPending(cases)
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  if (pending.length === 0) return null

  const handleAccept = async (c) => {
    setAccepting(c.id)
    try {
      await acceptExternalCase(c.id, employee)
      setPending(prev => prev.filter(x => x.id !== c.id))
      navigate(`/cases/${c.id}/edit`)
    } catch (e) {
      alert('Σφάλμα αποδοχής: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setAccepting(null)
    }
  }

  return (
    <div className="bg-red-600 text-white px-4 py-2 space-y-1.5">
      {pending.map(c => {
        const ext = c.external_data || {}
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-black">🔔 Νέα Ανάθεση Εξωδικαστικού{ext.caseNumber ? ` #${ext.caseNumber}` : ''} — απαιτεί αποδοχή</span>
            <span className="opacity-90">{c.client_name}{ext.accountantOffice ? ` · ${ext.accountantOffice}` : ''}</span>
            <button
              onClick={() => handleAccept(c)}
              disabled={accepting === c.id}
              className="ml-auto bg-white text-red-700 font-bold text-xs px-3 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {accepting === c.id ? '...' : '✓ Αποδοχή'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
