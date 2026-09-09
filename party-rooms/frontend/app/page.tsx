'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      router.replace('/rooms')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setError('')
    setLoading(true)
    try {
      const data = await login(username.trim())
      if (data.error) { setError(data.error); return }
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      router.push('/rooms')
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-purple-700/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-3xl font-bold text-white">Party Rooms</h1>
          <p className="text-purple-300 mt-2 text-sm">Δες και άκουσε μαζί με φίλους</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Είσοδος / Εγγραφή</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-purple-300 mb-1.5">Username</label>
              <input
                type="text"
                className="input"
                placeholder="πχ. alex_gr"
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={20}
                autoFocus
              />
              <p className="text-xs text-purple-400/70 mt-1">2-20 χαρακτήρες, χωρίς password</p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading || !username.trim()}>
              {loading ? 'Φόρτωση...' : 'Είσοδος'}
            </button>
          </form>
        </div>

        <p className="text-center text-purple-400/60 text-xs mt-4">
          Αν το username δεν υπάρχει, δημιουργείται αυτόματα
        </p>
      </div>
    </main>
  )
}
