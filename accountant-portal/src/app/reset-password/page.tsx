'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  )
}

function ResetPasswordPageInner() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Οι κωδικοί δεν ταιριάζουν')
      return
    }
    if (!token) {
      setError('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος. Ζητήστε νέο.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/login?reset=success')
      } else {
        setError(data.error || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.')
      }
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Lock size={20} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ορισμός νέου κωδικού</h1>
          <p className="text-sm text-slate-500">Εισαγάγετε τον νέο κωδικό πρόσβασής σας.</p>
        </div>

        {!token && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
            Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος. <a href="/forgot-password" className="underline font-medium">Ζητήστε νέο σύνδεσμο</a>.
          </div>
        )}

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Νέος κωδικός πρόσβασης</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Τουλάχιστον 8 χαρακτήρες</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Επιβεβαίωση κωδικού</label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: loading ? '#818cf8' : 'linear-gradient(135deg, #4f46e5, #4338ca)' }}
          >
            {loading ? 'Αποθήκευση...' : 'Αποθήκευση νέου κωδικού'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/login" className="text-sm text-indigo-600 hover:underline font-medium">Επιστροφή στη σύνδεση</a>
        </div>
      </div>
    </div>
  )
}
