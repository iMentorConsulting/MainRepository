import { useState } from 'react'
import { login } from '../api'
import toast from 'react-hot-toast'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await login(form.username, form.password)
      onLogin(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Λάθος στοιχεία σύνδεσης')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#2d5986] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-white.png" alt="iMentor Consulting" className="h-44 w-auto object-contain mx-auto mb-3" />
          <p className="text-blue-200 mt-1">Σύστημα Διαχείρισης Υποθέσεων</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Όνομα Χρήστη</label>
              <input
                type="text"
                className="input"
                placeholder="username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Κωδικός</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] hover:bg-[#2d5986] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? 'Σύνδεση...' : 'Σύνδεση'}
            </button>
          </form>
        </div>
        <p className="text-center text-blue-200/60 text-xs mt-6">
          © {new Date().getFullYear()} iMentor Consulting
        </p>
      </div>
    </div>
  )
}
