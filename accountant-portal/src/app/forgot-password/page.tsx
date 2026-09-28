'use client'
import { useState } from 'react'
import { Mail, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setResult({ ok: res.ok, msg: data.message || data.error || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' })
    } catch {
      setResult({ ok: false, msg: 'Σφάλμα σύνδεσης. Δοκιμάστε ξανά.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Mail size={20} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ξεχάσατε τον κωδικό σας;</h1>
          <p className="text-sm text-slate-500">Εισαγάγετε το email του λογαριασμού σας και θα σας στείλουμε σύνδεσμο επαναφοράς κωδικού.</p>
        </div>

        {result ? (
          <div className={`px-4 py-3 rounded-lg text-sm ${result.ok ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-700'}`}>
            {result.msg}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="info@yourfirm.gr"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: loading ? '#818cf8' : 'linear-gradient(135deg, #4f46e5, #4338ca)' }}
            >
              {loading ? 'Αποστολή...' : 'Αποστολή συνδέσμου επαναφοράς'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <a href="/login" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline font-medium">
            <ArrowLeft size={14} /> Επιστροφή στη σύνδεση
          </a>
        </div>
      </div>
    </div>
  )
}
