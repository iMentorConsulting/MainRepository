import { useState } from 'react'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

export default function Login({ onLogin }) {
  const [employee, setEmployee] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const err = onLogin(employee, password)
    if (err) setError(err)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⚖️</div>
          <h1 className="text-2xl font-black text-blue-800">i-Mentor Consulting</h1>
          <p className="text-gray-500 text-sm mt-1">Διαχείριση Υποθέσεων Οφειλών</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Υπάλληλος</label>
            <select
              className="input"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full justify-center py-3">
            Είσοδος
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          i-Mentor Consulting • www.i-mentor.gr
        </p>
      </div>
    </div>
  )
}
