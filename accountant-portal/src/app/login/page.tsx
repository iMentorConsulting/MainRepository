'use client'
import { useState, useEffect, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Lock, Eye, EyeOff } from 'lucide-react'

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
        const err = (res as any).error
        setError(err && err !== 'CredentialsSignin' ? err : 'Λάθος email ή κωδικός πρόσβασης, ή ο λογαριασμός σας δεν έχει επιβεβαιωθεί ακόμη (ελέγξτε το email σας).')
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
      <style jsx global>{`
        /* ===== Cinematic intro splash ===== */
        @keyframes splashFadeOut {
          0%, 88% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        @keyframes splashLogoReveal {
          0% { opacity: 0; transform: scale(1.35); filter: blur(18px) brightness(3); }
          35% { opacity: 1; transform: scale(1.08); filter: blur(2px) brightness(1.6); }
          60% { opacity: 1; transform: scale(1); filter: blur(0) brightness(1); }
          100% { opacity: 1; transform: scale(0.98); filter: blur(0) brightness(1); }
        }
        @keyframes splashBeam {
          0% { transform: translateX(-150%) skewX(-20deg); opacity: 0; }
          25% { opacity: 0; }
          45% { opacity: 1; }
          70% { transform: translateX(250%) skewX(-20deg); opacity: 0; }
          100% { transform: translateX(250%) skewX(-20deg); opacity: 0; }
        }
        @keyframes splashRays {
          0% { opacity: 0; transform: scale(0.6) rotate(-8deg); }
          40% { opacity: 0.55; }
          70% { opacity: 0.25; transform: scale(1.15) rotate(0deg); }
          100% { opacity: 0; transform: scale(1.3) rotate(4deg); }
        }
        @keyframes splashLine {
          0%, 40% { transform: scaleX(0); opacity: 0; }
          60% { opacity: 1; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes splashTagline {
          0%, 55% { opacity: 0; letter-spacing: 0.6em; }
          100% { opacity: 1; letter-spacing: 0.28em; }
        }
        @keyframes splashVignette {
          0% { opacity: 1; }
          50% { opacity: 0.55; }
          100% { opacity: 0.35; }
        }
        .splash {
          animation: splashFadeOut 3.4s cubic-bezier(0.4, 0, 0.2, 1) both;
          pointer-events: none;
        }
        .splash-logo { animation: splashLogoReveal 2.6s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both; }
        .splash-beam { animation: splashBeam 2.4s cubic-bezier(0.45, 0, 0.2, 1) 0.45s both; }
        .splash-rays { animation: splashRays 2.8s ease-out 0.35s both; }
        .splash-line { animation: splashLine 1.2s cubic-bezier(0.16, 1, 0.3, 1) 1.5s both; transform-origin: center; }
        .splash-tagline { animation: splashTagline 1.6s ease-out 1.55s both; }
        .splash-vignette { animation: splashVignette 3s ease-out both; }

        /* ===== Ambient page (after intro) ===== */
        @keyframes auroraDrift {
          0%, 100% { transform: translate(-8%, -4%) rotate(0deg) scale(1); }
          33% { transform: translate(6%, 4%) rotate(6deg) scale(1.1); }
          66% { transform: translate(-3%, 7%) rotate(-4deg) scale(1.05); }
        }
        @keyframes logoSheen {
          0%, 72% { transform: translateX(-160%) skewX(-22deg); }
          88% { transform: translateX(240%) skewX(-22deg); }
          100% { transform: translateX(240%) skewX(-22deg); }
        }
        @keyframes logoBreath {
          0%, 100% { filter: drop-shadow(0 0 18px rgba(129, 140, 248, 0.25)); transform: translateY(0); }
          50% { filter: drop-shadow(0 0 34px rgba(129, 140, 248, 0.55)); transform: translateY(-4px); }
        }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lineGrow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes particleUp {
          0% { transform: translateY(0); opacity: 0; }
          12% { opacity: var(--p-op, 0.5); }
          88% { opacity: var(--p-op, 0.5); }
          100% { transform: translateY(-105vh); opacity: 0; }
        }
        .aurora { animation: auroraDrift 24s ease-in-out infinite; will-change: transform; }
        .logo-stage { animation: logoBreath 7s ease-in-out infinite; }
        .logo-sheen { animation: logoSheen 7s ease-in-out 2.8s infinite; }
        .rise { animation: riseIn 1s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .gold-line { animation: lineGrow 1.4s cubic-bezier(0.16, 1, 0.3, 1) 3.2s both; transform-origin: left; }
        .particle { animation: particleUp var(--p-dur, 16s) linear var(--p-delay, 0s) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .splash { display: none; }
          .splash-logo, .splash-beam, .splash-rays, .splash-line, .splash-tagline, .splash-vignette,
          .aurora, .logo-stage, .logo-sheen, .rise, .gold-line, .particle { animation: none !important; opacity: 1; }
        }
      `}</style>

      {/* ===== Cinematic intro overlay (plays once on load) ===== */}
      <div className="splash fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black">
        {/* light rays bursting behind the logo */}
        <div className="splash-rays absolute w-[140vmax] h-[140vmax]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.18) 12deg, transparent 28deg, transparent 80deg, rgba(199,178,120,0.14) 95deg, transparent 115deg, transparent 170deg, rgba(99,102,241,0.16) 188deg, transparent 205deg, transparent 260deg, rgba(199,178,120,0.12) 278deg, transparent 300deg)' }} />
        {/* deep vignette */}
        <div className="splash-vignette absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.92) 78%)' }} />

        <div className="relative flex flex-col items-center px-6">
          <div className="relative overflow-hidden">
            <div className="splash-logo">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="I-MENTOR" className="h-32 md:h-44 w-auto object-contain" />
              ) : (
                <span className="text-4xl md:text-6xl font-bold text-white tracking-tight">I-MENTOR</span>
              )}
            </div>
            {/* sweeping light beam across the logo */}
            <div className="splash-beam absolute inset-y-0 w-1/3"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)' }} />
          </div>

          {/* gold rule + tagline */}
          <div className="splash-line mt-7 h-px w-56 md:w-80"
            style={{ background: 'linear-gradient(90deg, transparent, #c7b278, transparent)' }} />
          <p className="splash-tagline mt-4 text-[10px] md:text-xs font-medium uppercase text-center"
            style={{ color: '#c7b278', letterSpacing: '0.28em' }}>
            Consulting &nbsp;·&nbsp; Accountant Portal
          </p>
        </div>
      </div>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at 20% 0%, #1e1b4b 0%, #0b1023 55%, #060913 100%)' }}>
        {/* drifting aurora light fields */}
        <div className="aurora absolute -top-1/4 -left-1/4 w-[120%] h-[120%]"
          style={{ background: 'radial-gradient(ellipse 40% 30% at 30% 30%, rgba(79,70,229,0.28), transparent 70%), radial-gradient(ellipse 35% 28% at 75% 65%, rgba(124,58,237,0.22), transparent 70%), radial-gradient(ellipse 30% 22% at 55% 20%, rgba(199,178,120,0.08), transparent 70%)' }} />
        {/* fine grid texture */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        {/* rising particles */}
        {[8, 22, 37, 52, 66, 79, 91].map((left, i) => (
          <span key={i} className="particle absolute bottom-0 rounded-full"
            style={{
              left: `${left}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              background: i % 2 === 0 ? 'rgba(165,180,252,0.8)' : 'rgba(199,178,120,0.7)',
              ['--p-dur' as any]: `${13 + i * 2.3}s`,
              ['--p-delay' as any]: `${i * 1.7}s`,
              ['--p-op' as any]: i % 3 === 0 ? 0.55 : 0.35,
            }} />
        ))}
        {/* vignette for depth */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(3,5,12,0.55) 100%)' }} />

        <div className="relative z-10 flex justify-center rise" style={{ animationDelay: '2.9s' }}>
          <div className="logo-stage relative overflow-hidden px-6 py-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="I-MENTOR" className="h-40 w-auto object-contain" />
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
            {/* recurring light sheen across the logo */}
            <div className="logo-sheen absolute inset-y-0 w-1/3 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }} />
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="rise" style={{ animationDelay: '3.1s' }}>
            <div className="gold-line h-px w-24 mb-6"
              style={{ background: 'linear-gradient(90deg, #c7b278, transparent)' }} />
            <h2 className="text-3xl font-bold leading-tight mb-4">
              Η πλατφόρμα επιχειρηματικής<br />ευκαιρίας για λογιστικά γραφεία
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed max-w-sm">
              Διαχειριστείτε τους πελάτες σας, εντοπίστε επιδοτήσεις που τους αφορούν και επικοινωνήστε μαζί τους αποτελεσματικά — όλα σε ένα περιβάλλον.
            </p>
          </div>

          {/* Trust signals */}
          <div className="space-y-3">
            {[
              { icon: Shield, text: 'Κρυπτογράφηση TLS 1.3 — τα δεδομένα σας μεταφέρονται πάντα κρυπτογραφημένα' },
              { icon: Lock, text: 'Τα δεδομένα επιχειρήσεων ανήκουν αποκλειστικά στο λογιστικό σας γραφείο' },
              { icon: Shield, text: 'Πλήρης συμμόρφωση με τον ΓΚΠΔ (GDPR) — EU-hosted υποδομή' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 rise" style={{ animationDelay: `${3.3 + i * 0.15}s` }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(99,102,241,0.3)', boxShadow: 'inset 0 0 0 1px rgba(165,180,252,0.25)' }}>
                  <Icon size={13} className="text-indigo-300" />
                </div>
                <p className="text-xs text-indigo-200 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 rise" style={{ animationDelay: '3.7s' }}>
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
          <div className="lg:hidden mb-10 flex justify-center rise" style={{ animationDelay: '2.9s' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="I-MENTOR" className="h-14 w-auto object-contain" />
            ) : (
              <span className="text-2xl font-bold text-slate-900">I-MENTOR</span>
            )}
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Σύνδεση στο Portal</h1>
            <p className="text-sm text-slate-500">Εισαγάγετε τα στοιχεία πρόσβασής σας για να συνεχίσετε.</p>
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

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500 mb-3">Δεν έχετε λογαριασμό συνεργάτη;</p>
            <a href="/register"
              className="block w-full text-center py-2.5 rounded-lg text-indigo-600 text-sm font-semibold border border-indigo-200 hover:bg-indigo-50 transition-colors">
              Αίτηση Εγγραφής Λογιστικού Γραφείου
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
