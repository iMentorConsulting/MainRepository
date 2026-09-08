import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getOnboardInfo, submitOnboardAfm } from '../api'

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
    </div>
  )
}

export default function Onboard() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [afm, setAfm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [fieldError, setFieldError] = useState('')

  useEffect(() => {
    getOnboardInfo(token)
      .then(res => {
        // Lead already has AFM → redirect to LOGISTIS widget immediately
        if (res.logistis_url) {
          window.location.href = res.logistis_url
          return
        }
        setInfo(res)
      })
      .catch(() => setError('Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = afm.replace(/\s/g, '')
    if (!/^[0-9]{8,9}$/.test(clean)) {
      setFieldError('Παρακαλούμε εισάγετε έγκυρο ΑΦΜ (8 ή 9 ψηφία)')
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const res = await submitOnboardAfm(token, clean)
      if (res.logistis_url) {
        // Redirect straight to LOGISTIS eligibility widget
        window.location.href = res.logistis_url
        return
      }
      setResult(res)
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Σφάλμα κατά την υποβολή. Παρακαλούμε δοκιμάστε ξανά.'
      setFieldError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start py-10 px-4">
      {/* Header */}
      <div className="w-full max-w-lg bg-[#1e3a5f] rounded-t-2xl px-8 py-6 flex flex-col items-center gap-3">
        <img
          src="https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png"
          alt="i-Mentor Consulting"
          className="h-12 object-contain"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
        <p className="text-blue-200 text-sm font-medium tracking-wide mt-1">Ψηφιακός Σύμβουλος</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-white rounded-b-2xl shadow-xl px-8 py-8 border border-gray-200 border-t-0">
        {loading && <Spinner />}

        {error && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-gray-700 font-medium">{error}</p>
            <p className="text-gray-500 text-sm mt-2">Επικοινωνήστε μαζί μας στο <a href="tel:2810363007" className="text-blue-700 underline">2810 363007</a></p>
          </div>
        )}

        {!loading && !error && info && !result && (
          <>
            {info.program && (
              <div className="mb-5 inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 font-medium">
                📋 {info.program}
              </div>
            )}

            <h1 className="text-xl font-bold text-gray-800 mb-2">
              {info.name ? `Αγαπητέ/ή ${info.name},` : 'Αγαπητέ/ή συνεργάτη,'}
            </h1>

            {info.ermis_started && info.ermis_chat_url ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-gray-700 font-medium mb-4">Ο Ψηφιακός Σύμβουλός σας είναι ήδη ενεργός!</p>
                <a
                  href={info.ermis_chat_url}
                  className="inline-block bg-[#1e3a5f] text-white font-bold px-6 py-3 rounded-xl text-base hover:bg-blue-900 transition-colors"
                >
                  🤖 Συνέχεια με τον Ψηφιακό Σύμβουλο →
                </a>
              </div>
            ) : info.has_afm && info.ermis_started ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">⏳</div>
                <p className="text-gray-700">Τα στοιχεία σας έχουν ήδη καταχωρηθεί. Ο Ψηφιακός Σύμβουλός μας θα επικοινωνήσει μαζί σας σύντομα.</p>
              </div>
            ) : (
              <>
                <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                  Για να ελέγξουμε την επιλεξιμότητά σας
                  {info.program ? ` για το πρόγραμμα <b>${info.program}</b>` : ''}
                  {' '}και να σας συνδέσουμε με τον <strong>Ψηφιακό Σύμβουλό</strong> μας, παρακαλούμε καταχωρήστε το ΑΦΜ της επιχείρησής σας.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      ΑΦΜ Επιχείρησης
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={9}
                      value={afm}
                      onChange={e => { setAfm(e.target.value.replace(/\D/g, '')); setFieldError('') }}
                      placeholder="π.χ. 123456789"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                    {fieldError && <p className="text-red-600 text-sm mt-1.5">{fieldError}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={busy || afm.length < 8}
                    className="w-full bg-[#1e3a5f] hover:bg-blue-900 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-base transition-colors"
                  >
                    {busy ? 'Επεξεργασία…' : '✅ Υποβολή ΑΦΜ'}
                  </button>
                </form>

                <p className="text-center text-xs text-gray-400 mt-6">
                  Τα στοιχεία σας χρησιμοποιούνται αποκλειστικά για τον έλεγχο επιλεξιμότητας
                  και προστατεύονται σύμφωνα με τον GDPR.
                </p>
              </>
            )}
          </>
        )}

        {result && (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Ευχαριστούμε{result.name ? `, ${result.name}` : ''}!</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Τα στοιχεία σας καταχωρήθηκαν επιτυχώς. Ο Ψηφιακός Σύμβουλός μας θα ελέγξει την επιλεξιμότητά σας και θα επικοινωνήσει μαζί σας σύντομα.
            </p>

            {result.ermis_chat_url && (
              <a
                href={result.ermis_chat_url}
                className="inline-block bg-[#1e3a5f] text-white font-bold px-8 py-3 rounded-xl text-base hover:bg-blue-900 transition-colors mb-4"
              >
                🤖 Ξεκινήστε τη συνομιλία με τον Ψηφιακό Σύμβουλο →
              </a>
            )}

            <div className="mt-8 border-t border-gray-100 pt-6 text-sm text-gray-500">
              <p className="font-semibold text-gray-700">i-Mentor Consulting</p>
              <p>📞 <a href="tel:2810363007" className="hover:underline">2810 363007</a></p>
              <p>🌐 <a href="https://www.i-mentor.gr" className="hover:underline">www.i-mentor.gr</a></p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        © {new Date().getFullYear()} i-Mentor Consulting · Ηράκλειο Κρήτης
      </p>
    </div>
  )
}
