import { useState, useEffect } from 'react'
import { getTenants, login as apiLogin } from '../api'

export default function Login({ onLogin }) {
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getTenants().then((r) => setTenants(r.data)).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await apiLogin({ tenant_id: tenantId, password })
      localStorage.setItem('auth', JSON.stringify(r.data))
      onLogin(r.data)
    } catch {
      setError('Λάθος επιχείρηση ή κωδικός. Δοκιμάστε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏨</div>
          <h1 className="text-2xl font-bold text-gray-800">Διαχείριση Κρατήσεων</h1>
          <p className="text-sm text-gray-500 mt-1">Επιλέξτε επιχείρηση και εισάγετε κωδικό</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Επιχείρηση</label>
            <select
              className="input"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
            >
              <option value="">-- Επιλέξτε --</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Κωδικός</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>
        </form>
      </div>
    </div>
  )
}
