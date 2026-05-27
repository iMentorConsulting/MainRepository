import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { portalLookup, recordPortalVisit } from '../api'

const PROGRAM_LABELS = {
  'ΕΣΠΑ': { label: 'ΕΣΠΑ', icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  'ΔΥΠΑ': { label: 'ΔΥΠΑ / ΟΑΕΔ', icon: '🎓', color: 'bg-green-50 border-green-200 text-green-700' },
  'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ': { label: 'Μικροπιστώσεις', icon: '💶', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  'ΑΝΑΚΑΙΝΙΖΩ': { label: 'Ανακαινίζω', icon: '🏠', color: 'bg-orange-50 border-orange-200 text-orange-700' },
}

export default function PortalLoginPage() {
  const navigate = useNavigate()
  const [credential, setCredential] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cases, setCases] = useState(null)
  const [selecting, setSelecting] = useState(false)

  const isPhone = credential.replace(/\D/g, '').length >= 10 && credential.replace(/\D/g, '').length <= 11
  const isAfm = credential.length === 9 && /^\d+$/.test(credential)
  const isReady = isPhone || isAfm

  const handleLookup = async (e) => {
    e.preventDefault()
    if (!isReady) return
    setLoading(true)
    setError('')
    try {
      const results = await portalLookup(credential.trim())
      if (results.length === 1) {
        // Auto-navigate, store credential for auto-verify
        sessionStorage.setItem('portal_lookup_cred', credential.trim())
        navigate(`/portal/${results[0].token}`)
      } else {
        setCases(results)
        setSelecting(true)
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) {
        setError('Δεν βρέθηκαν ενεργές υποθέσεις με αυτά τα στοιχεία. Επικοινωνήστε με τον σύμβουλό σας.')
      } else {
        setError('Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCase = (token) => {
    sessionStorage.setItem('portal_lookup_cred', credential.trim())
    navigate(`/portal/${token}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#1e3a5f] text-white px-4 py-4 flex items-center justify-center">
        <img src="/logo-white.png" alt="iMentor" className="h-24 w-auto object-contain" />
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        {!selecting ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1e3a5f]/10 flex items-center justify-center mx-auto mb-5 text-3xl">🏛️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Portal Πελάτη</h2>
            <p className="text-sm text-gray-500 mb-6">
              Εισάγετε το ΑΦΜ ή τον αριθμό κινητού σας για να δείτε τις υποθέσεις σας.
            </p>
            <form onSubmit={handleLookup} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                value={credential}
                onChange={e => { setCredential(e.target.value.replace(/\D/g, '')); setError('') }}
                placeholder="ΑΦΜ ή Κινητό"
                maxLength={12}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                autoFocus
              />
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <button
                type="submit"
                disabled={loading || !isReady}
                className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
              >
                {loading ? 'Αναζήτηση...' : 'Είσοδος'}
              </button>
            </form>
            <p className="mt-5 text-xs text-gray-400">
              Έχετε απευθείας σύνδεσμο για την υπόθεσή σας; Χρησιμοποιήστε τον αντ' αυτού.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 w-full max-w-md">
            <div className="text-center mb-6">
              <div className="text-3xl mb-2">👋</div>
              <h2 className="text-xl font-bold text-gray-900">Καλωσήρθατε</h2>
              <p className="text-sm text-gray-500 mt-1">
                Βρέθηκαν <strong>{cases.length}</strong> ενεργές υποθέσεις. Επιλέξτε:
              </p>
            </div>
            <div className="space-y-3">
              {cases.map((c) => {
                const prog = PROGRAM_LABELS[c.program_category] || { label: c.program_category, icon: '📁', color: 'bg-gray-50 border-gray-200 text-gray-700' }
                return (
                  <button
                    key={c.token}
                    onClick={() => handleSelectCase(c.token)}
                    className="w-full text-left rounded-xl border border-gray-200 p-4 hover:border-[#1e3a5f] hover:bg-blue-50/30 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prog.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm group-hover:text-[#1e3a5f]">{c.client_name}</div>
                        {c.service_type && <div className="text-xs text-gray-500 truncate">{c.service_type}</div>}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${prog.color}`}>
                        {prog.label}
                      </span>
                    </div>
                    {c.status && (
                      <div className="mt-2 ml-11 text-xs text-gray-400">
                        Κατάσταση: <span className="font-medium text-gray-600">{c.status}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => { setSelecting(false); setCases(null) }}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2"
            >
              ← Επιστροφή
            </button>
          </div>
        )}
      </div>
      <footer className="text-center text-xs text-gray-400 py-4">
        iMentor Consulting © {new Date().getFullYear()}
      </footer>
    </div>
  )
}
