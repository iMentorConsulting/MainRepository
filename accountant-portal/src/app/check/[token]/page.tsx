'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Script from 'next/script'

declare global {
  interface Window {
    grecaptcha: any
  }
}

const RECAPTCHA_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '6LdqX5stAAAAAKHh4l7Fe89p255lJf9pMPP2gDCW'

type Program = {
  programId: string
  title: string
  category: string
  description: string | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  subsidyNote: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  monthlyAmount: number | null
  subsidyMonths: number | null
  totalBenefit: number | null
  ermisUrl?: string | null
}

type CheckResult = {
  business?: { name: string }
  programs?: Program[]
  inactive?: boolean
  notFound?: boolean
}

export default function CheckPage() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession] = useState<{ afm: string; clientName: string | null; email: string | null; phone: string | null } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [checkError, setCheckError] = useState('')
  const recaptchaLoaded = useRef(false)

  useEffect(() => {
    fetch(`/api/public/widget-session/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setLoadError(data.error || 'Σφάλμα'); return }
        setSession(data)
        if (data.email) setEmail(data.email)
        if (data.phone) setPhone(data.phone)
      })
      .catch(() => setLoadError('Σφάλμα φόρτωσης'))
  }, [token])

  async function handleCheck() {
    if (!session) return
    setCheckError('')
    setChecking(true)
    try {
      let recaptchaToken = ''
      if (typeof window !== 'undefined' && window.grecaptcha) {
        recaptchaToken = await new Promise<string>((resolve, reject) => {
          window.grecaptcha.ready(() => {
            window.grecaptcha.execute(RECAPTCHA_KEY, { action: 'eligibility_check' })
              .then(resolve)
              .catch(reject)
          })
        })
      }

      const res = await fetch('/api/public/eligibility-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          afm: session.afm,
          email,
          phone,
          recaptchaToken,
          widgetToken: token,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCheckError(data.error || 'Σφάλμα ελέγχου')
      } else {
        setResult(data)
      }
    } catch {
      setCheckError('Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setChecking(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Ο σύνδεσμος δεν είναι έγκυρος</h1>
          <p className="text-gray-500 text-sm">
            {loadError === 'Link expired'
              ? 'Αυτός ο σύνδεσμος έχει λήξει. Επικοινωνήστε με την I-MENTOR για νέο σύνδεσμο.'
              : 'Αυτός ο σύνδεσμος δεν υπάρχει ή έχει ακυρωθεί.'}
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Φόρτωση...</div>
      </div>
    )
  }

  return (
    <>
      <Script
        src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_KEY}`}
        onLoad={() => { recaptchaLoaded.current = true }}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4 py-10">
        <div className="max-w-lg w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-3xl mb-3">🔍</div>
            <h1 className="text-2xl font-bold text-gray-900">Δωρεάν Έλεγχος Επιλεξιμότητας</h1>
            <p className="text-gray-500 mt-1 text-sm">Ελέγξτε αν η επιχείρησή σας είναι επιλέξιμη για χρηματοδοτικά προγράμματα.</p>
          </div>

          {!result ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              {session.clientName && (
                <p className="text-sm text-gray-600">
                  Καλωσήρθατε, <span className="font-semibold text-gray-900">{session.clientName}</span>!
                </p>
              )}

              {/* AFM — locked */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ΑΦΜ Επιχείρησης</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <span className="text-sm font-mono text-gray-800 flex-1">{session.afm}</span>
                  <span className="text-xs text-gray-400">🔒</span>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.gr"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Τηλέφωνο *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="6912345678"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {checkError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{checkError}</p>
              )}

              <button
                onClick={handleCheck}
                disabled={checking || !email || !phone}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition-colors"
              >
                {checking ? 'Γίνεται έλεγχος...' : 'Έλεγχος Επιλεξιμότητας'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Προστατευόμενο από reCAPTCHA. Τα στοιχεία σας χρησιμοποιούνται αποκλειστικά για τον έλεγχο επιλεξιμότητας.
              </p>
            </div>
          ) : (
            <ResultView result={result} />
          )}

          <p className="text-center text-xs text-gray-400 mt-6">Powered by <span className="font-semibold">i-Mentor Consulting</span></p>
        </div>
      </div>
    </>
  )
}

function fmt(n: number | null) {
  if (n == null) return ''
  return n.toLocaleString('el-GR')
}

function ResultView({ result }: { result: CheckResult }) {
  if (result.notFound) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 text-center">
        <div className="text-3xl mb-3">🔍</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Δεν βρέθηκαν στοιχεία</h2>
        <p className="text-sm text-gray-500">Το ΑΦΜ δεν βρέθηκε στη βάση δεδομένων της ΑΑΔΕ. Επικοινωνήστε με την I-MENTOR για βοήθεια.</p>
      </div>
    )
  }

  if (result.inactive) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-orange-200 p-6 text-center">
        <div className="text-3xl mb-3">🚫</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Η επιχείρηση είναι ανενεργή</h2>
        <p className="text-sm text-gray-500">Δεν μπορούν να υποβληθούν αιτήσεις για ανενεργές επιχειρήσεις.</p>
      </div>
    )
  }

  if (!result.programs || result.programs.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
        <div className="text-3xl mb-3">😔</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Δεν βρέθηκαν προγράμματα</h2>
        <p className="text-sm text-gray-500">
          {result.business?.name && <span className="font-medium">{result.business.name}</span>}
          {result.business?.name ? ' — δεν ' : 'Δεν '}
          εντοπίστηκαν ενεργά χρηματοδοτικά προγράμματα αυτή τη στιγμή. Επικοινωνήστε με την I-MENTOR για πλήρη αξιολόγηση.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
        <div className="text-2xl mb-1">🎉</div>
        <p className="font-bold text-green-800">
          Βρέθηκαν {result.programs.length} {result.programs.length === 1 ? 'πρόγραμμα' : 'προγράμματα'}
          {result.business?.name ? ` για ${result.business.name}` : ''}!
        </p>
        <p className="text-xs text-green-600 mt-1">Επικοινωνήστε με την I-MENTOR για να ξεκινήσετε τη διαδικασία.</p>
      </div>

      {result.programs.map(p => (
        <div key={p.programId} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-gray-900 text-base leading-snug">{p.title}</h3>
            <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 whitespace-nowrap font-medium">{p.category}</span>
          </div>
          {p.description && <p className="text-sm text-gray-600 mb-3 leading-relaxed">{p.description}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
            {(p.minSubsidyPct != null || p.maxSubsidyPct != null) && (
              <span>💶 Επιδότηση: {p.minSubsidyPct != null && p.maxSubsidyPct != null ? `${p.minSubsidyPct}%–${p.maxSubsidyPct}%` : `${p.minSubsidyPct ?? p.maxSubsidyPct}%`}</span>
            )}
            {(p.minInvestment != null || p.maxInvestment != null) && (
              <span>📊 Προϋπολογισμός: {p.minInvestment != null ? `€${fmt(p.minInvestment)}` : ''}{p.minInvestment != null && p.maxInvestment != null ? '–' : ''}{p.maxInvestment != null ? `€${fmt(p.maxInvestment)}` : ''}</span>
            )}
            {p.monthlyAmount != null && <span>💰 €{fmt(p.monthlyAmount)}/μήνα × {p.subsidyMonths ?? '?'} μήνες</span>}
            {p.totalBenefit != null && <span>✅ Συνολικό όφελος: €{fmt(p.totalBenefit)}</span>}
          </div>

          {/* MICROCREDITS: prompt to send E3 */}
          {p.category === 'MICROCREDITS' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-3">
              <p className="text-sm font-bold text-amber-900 mb-1">📄 Στείλτε το Ε3 σας — δωρεάν αξιολόγηση σε 24ώρες</p>
              <p className="text-xs text-amber-800 mb-3 leading-relaxed">
                Για να ελέγξουμε το ακριβές ποσό δανείου που δικαιούστε, στείλτε μας το τελευταίο έντυπο Ε3 σας (αρκεί η εικόνα από το κινητό).
              </p>
              <a
                href="mailto:info@i-mentor.gr?subject=Ε3%20για%20Ταμείο%20Μικροπιστώσεων&body=Σας%20στέλνω%20το%20Ε3%20μου%20για%20αξιολόγηση%20στο%20Ταμείο%20Μικροπιστώσεων."
                className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                ✉️ Αποστολή Ε3 στο info@i-mentor.gr
              </a>
            </div>
          )}

          {/* Ερμής CTA — for all programs that have a link */}
          {p.ermisUrl && (
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4">
              <p className="text-sm font-bold text-indigo-900 mb-1">💬 Μίλα με τον Ερμή — σε δευτερόλεπτα</p>
              <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
                Ο Ερμής, ο ψηφιακός σύμβουλος της I-MENTOR, θα σε ρωτήσει 2–3 ερωτήσεις και θα σου πει αν πληροίς τις προϋποθέσεις για αυτό το πρόγραμμα — χωρίς αναμονή, χωρίς γραφειοκρατία.
              </p>
              <a
                href={p.ermisUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
              >
                Ξεκινήστε τώρα →
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
