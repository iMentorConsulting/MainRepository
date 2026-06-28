'use client'
import { useState, useEffect, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Lock, Eye, EyeOff } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Πολλές αποτυχημένες προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε 15 λεπτά.',
  email_not_verified: 'Παρακαλούμε επιβεβαιώστε το email σας πριν συνδεθείτε. Ελέγξτε τα εισερχόμενά σας.',
  accountant_not_approved: 'Ο λογαριασμός του γραφείου σας αναμένει έγκριση από την ομάδα της I-MENTOR. Θα λάβετε email ενεργοποίησης μόλις εγκριθεί. Για οποιαδήποτε ερώτηση επικοινωνήστε μαζί μας στο 2810 363007 ή στο info@i-mentor.gr.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifyStatus = searchParams.get('verify')

  useEffect(() => {
    fetch('/api/settings/logo')
      .then(r => r.json())
      .then(data => setLogoUrl(data.imentorLogoUrl || null))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res && (res as any).error) {
        const code = (res as any).code || (res as any).error
        setError(ERROR_MESSAGES[code] || 'Λάθος email ή κωδικός πρόσβασης, ή ο λογαριασμός σας δεν έχει επιβεβαιωθεί ακόμη (ελέγξτε το email σας).')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Λάθος email ή κωδικός πρόσβασης.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)' }}>
        {/* Subtle geometric texture */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

        <div className="relative z-10 flex justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="I-MENTOR" className="h-40 w-auto object-contain drop-shadow-2xl" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight">I-MENTOR</span>
            </div>
          )}
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight mb-4">
              Η πλατφόρμα επιχειρηματικής<br />ευκαιρίας για λογιστικά γραφεία
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed max-w-sm">
              Διαχειριστείτε τους πελάτες σας, εντοπίστε επιδοτήσεις που τους αφορούν και επικοινωνήστε μαζί τους αποτελεσματικά, όλα σε ένα περιβάλλον.
            </p>
          </div>

          {/* Value props for prospective offices */}
          <div className="space-y-2.5">
            {[
              'Νέες ευκαιρίες χρηματοδότησης για τους πελάτες σας, εντοπισμένες αυτόματα',
              'Προμήθειες από κάθε επιτυχημένη υπόθεση που θα διεκπεραιωθεί',
              'Δωρεάν πλατφόρμα — καμία χρέωση συμμετοχής για το γραφείο σας',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-indigo-100">{text}</p>
              </div>
            ))}
          </div>

          <a href="/register"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white text-indigo-700 text-sm font-bold shadow-lg hover:bg-indigo-50 transition-colors">
            Νέο Λογιστικό Γραφείο; Εγγραφή Τώρα
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>

          {/* Trust signals */}
          <div className="space-y-3">
            {[
              { icon: Shield, text: 'Κρυπτογράφηση TLS 1.3: τα δεδομένα σας μεταφέρονται πάντα κρυπτογραφημένα' },
              { icon: Lock, text: 'Τα δεδομένα επιχειρήσεων ανήκουν αποκλειστικά στο λογιστικό σας γραφείο' },
              { icon: Shield, text: 'Πλήρης συμμόρφωση με τον ΓΚΠΔ (GDPR)' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(99,102,241,0.3)' }}>
                  <Icon size={13} className="text-indigo-300" />
                </div>
                <p className="text-xs text-indigo-200 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-indigo-400">
            I-MENTOR Consulting © {new Date().getFullYear()} &nbsp;·&nbsp;
            <a href="https://www.i-mentor.gr" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">www.i-mentor.gr</a>
            &nbsp;·&nbsp; 2810 363007
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 bg-white">
        <div className="w-full max-w-sm mx-auto">

          {/* Mobile logo */}
          <div className="lg:hidden mb-10 flex justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="I-MENTOR" className="h-14 w-auto object-contain" />
            ) : (
              <span className="text-2xl font-bold text-slate-900">I-MENTOR</span>
            )}
          </div>

          {/* Prominent registration CTA for new accounting offices */}
          <a href="/register"
            className="mb-6 flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-colors group">
            <div>
              <p className="text-sm font-bold text-indigo-700">Νέο λογιστικό γραφείο;</p>
              <p className="text-xs text-indigo-500">Εγγραφείτε δωρεάν και αποκτήστε πρόσβαση σε νέες επιδοτήσεις για τους πελάτες σας</p>
            </div>
            <span className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold group-hover:bg-indigo-700 transition-colors">
              Εγγραφή
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </a>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Σύνδεση στο Portal</h1>
            <p className="text-sm text-slate-500">Έχετε ήδη λογαριασμό; Εισαγάγετε τα στοιχεία πρόσβασής σας για να συνεχίσετε.</p>
          </div>

          {verifyStatus === 'success' && !error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">
              Το email σας επιβεβαιώθηκε επιτυχώς. Μπορείτε τώρα να συνδεθείτε.
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Κωδικός πρόσβασης</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: loading ? '#818cf8' : 'linear-gradient(135deg, #4f46e5, #4338ca)' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Σύνδεση...
                </>
              ) : 'Σύνδεση'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/register" className="text-sm text-indigo-600 hover:underline font-medium">
              Δεν έχετε λογαριασμό; Κάντε αίτηση εγγραφής →
            </a>
          </div>

          {/* Mobile trust */}
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Lock size={11} /> TLS 1.3</span>
            <span className="flex items-center gap-1"><Shield size={11} /> GDPR</span>
            <a href="https://www.i-mentor.gr" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600">www.i-mentor.gr</a>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
            <a href="/security" className="hover:text-slate-600">Ασφάλεια</a>
            <span>·</span>
            <a href="/privacy" className="hover:text-slate-600">Απόρρητο</a>
            <span>·</span>
            <a href="/terms" className="hover:text-slate-600">Όροι</a>
          </div>
        </div>
      </div>
    </div>
  )
}
