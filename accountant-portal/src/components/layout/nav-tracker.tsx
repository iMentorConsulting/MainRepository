'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Logs every in-app page navigation to the audit log (admin "Καταγραφή
// Ενεργειών" page). Fire-and-forget; never blocks navigation.
export function NavTracker() {
  const pathname = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === last.current) return
    last.current = pathname
    fetch('/api/track-nav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname])

  return null
}
