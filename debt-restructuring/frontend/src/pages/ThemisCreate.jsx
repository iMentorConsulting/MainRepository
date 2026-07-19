import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { normalizeEmail } from '../utils/emailNormalization'

/**
 * Direct redirect flow for ΛΟΓΙΣΤΗΣ portal integration.
 *
 * Accepts query parameters: name, phone, email, total_debt, referrer, application_number, service_type
 * Creates a lead via the backend API and redirects directly to Themis chat.
 *
 * Auto-corrects common email domain typos (e.g., .fr → .gr for Greek emails)
 *
 * Example URL:
 * https://portal.i-mentor.gr/themis/create?name=ΑΒΓΔ+ΑΕ&phone=%2B30210123456&total_debt=50000&referrer=LOGISTIS
 */
export default function ThemisCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const createLeadAndRedirect = async () => {
      try {
        // Extract query parameters
        const name = searchParams.get('name') || ''
        const phone = searchParams.get('phone') || ''
        let email = searchParams.get('email') || ''
        const total_debt = searchParams.get('total_debt') || ''
        const referrer = searchParams.get('referrer') || 'LOGISTIS'
        const application_number = searchParams.get('application_number') || ''
        const service_type = searchParams.get('service_type') || ''
        const sheet_comments = searchParams.get('sheet_comments') || ''

        if (!name) {
          throw new Error('Απαιτείται το πεδίο "name" (όνομα πελάτη)')
        }

        // Normalize email — auto-correct common typos (.fr → .gr, etc.)
        if (email) {
          email = normalizeEmail(email)
        }

        // Call the backend API to create lead
        const response = await api.createLeadExternal({
          name,
          phone,
          email,
          total_debt,
          referrer,
          application_number,
          service_type,
          sheet_comments,
          send_themis: false, // Skip Viber/Email since user is already here
        })

        const { themis_token, themis_url } = response.data

        if (!themis_token) {
          throw new Error('Το API δεν επέστρεψε themis_token')
        }

        // Redirect directly to Themis chat
        // Use themis_url from API if available, otherwise construct it
        const redirectUrl = themis_url || `/themis/${themis_token}`
        window.location.href = redirectUrl
      } catch (err) {
        console.error('Error creating lead:', err)
        setError(err.response?.data?.detail || err.message || 'Σφάλμα δημιουργίας lead')
        setLoading(false)
      }
    }

    createLeadAndRedirect()
  }, [searchParams, navigate])

  if (loading && !error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 to-blue-50">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
          <p className="text-gray-700 font-semibold">Δημιουργία session Θέμιδας...</p>
          <p className="text-sm text-gray-500 mt-2">Θα ανακατευθυνθείτε σε λίγα δευτερόλεπτα</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-100 to-orange-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-lg max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-red-800 mb-2">Σφάλμα</h1>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Επιστροφή
          </button>
        </div>
      </div>
    )
  }

  return null
}
