import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const BASE = ''

export default function GuestRegister() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    axios.get(`${BASE}/api/guest/${token}/register-info`)
      .then(r => {
        setInfo(r.data)
        setForm({
          first_name: r.data.first_name || '',
          last_name: r.data.last_name || '',
          email: r.data.email || '',
          phone: r.data.phone || '',
        })
      })
      .catch(() => setError('Invalid or expired link.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name) return
    setSubmitting(true)
    try {
      await axios.post(`${BASE}/api/guest/${token}/register`, form)
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center text-gray-500">{error}</div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-3">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-gray-800">Thank you!</h2>
        <p className="text-sm text-gray-500">Your details have been saved. We look forward to welcoming you.</p>
      </div>
    </div>
  )

  const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🏠</div>
          <h1 className="text-lg font-bold text-gray-800">{info.unit_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(info.check_in)} → {formatDate(info.check_out)}
          </p>
        </div>

        <p className="text-sm text-gray-600 text-center">
          Please share your contact details so we can prepare for your arrival.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="your@email.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone / WhatsApp</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+30 69..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}
