import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getPendingNotifications } from '../api'

const POLL_MS = 20_000

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.5)
  } catch {}
}

export default function NotificationListener({ enabled }) {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await getPendingNotifications()
        if (cancelled) return
        for (const n of res.data) {
          playDing()
          toast.custom(
            t => (
              <div
                className={`bg-white shadow-lg rounded-lg border border-gray-200 px-4 py-3 max-w-sm cursor-pointer transition-opacity ${t.visible ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => {
                  toast.dismiss(t.id)
                  if (n.link) navigateRef.current(n.link)
                }}
              >
                <p className="font-semibold text-sm text-gray-800">🔔 {n.title}</p>
                <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
              </div>
            ),
            { position: 'bottom-right', duration: 7000 }
          )
        }
      } catch {}
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return null
}
