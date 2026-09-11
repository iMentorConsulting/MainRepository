import { useState } from 'react'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

export default function Login({ onLogin }) {
  const [employee, setEmployee] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const err = await onLogin(employee, password)
    if (err) setError(err)
    setLoading(false)
  }

  const isLocked = error.includes('Κλειδωμένο') || error.includes('Δοκιμάστε ξανά')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="i-Mentor" className="h-20 w-auto object-contain mx-auto mb-4"
            onError={e => { e.target.onerror=null; e.target.src='https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png' }} />
          <h1 className="text-2xl font-black text-blue-800">i-Mentor Consulting</h1>
          <p className="text-gray-500 text-sm mt-1">Διαχείριση Υποθέσεων Οφειλών</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Υπάλληλος</label>
            <select
              className="input"
              value={employee}
              onChange={(e) => { setEmployee(e.target.value); setError('') }}
              disabled={loading || isLocked}
              required
            >
              <option value="">-- Επιλέξτε --</option>
              {EMPLOYEES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Κωδικός</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="••••••••"
              disabled={loading || isLocked}
              required
            />
          </div>

          {error && (
            <div className={`border text-sm rounded-lg px-3 py-2 ${isLocked ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {isLocked ? '🔒 ' : '⚠ '}{error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isLocked}
            className="btn-primary w-full justify-center py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Σύνδεση…' : isLocked ? '🔒 Κλειδωμένο' : 'Είσοδος'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          i-Mentor Consulting • www.i-mentor.gr
        </p>
      </div>
    </div>
  )
}
