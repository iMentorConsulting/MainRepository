import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {
  const [step, setStep] = useState('password'); // 'password' | '2fa'
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const codeRef = useRef(null);

  useEffect(() => {
    if (step === '2fa') codeRef.current?.focus();
  }, [step]);

  const handlePassword = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(password);
      if (result?.requires_2fa) {
        setTempToken(result.temp_token);
        setStep('2fa');
      } else {
        navigate('/');
      }
    } catch {
      toast.error('Λάθος κωδικός πρόσβασης');
    } finally {
      setLoading(false);
    }
  };

  const handle2fa = async e => {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      await verify2fa(tempToken, code);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Λάθος κωδικός authenticator');
      setCode('');
      codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a2e 100%)' }}>

      <div className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl -top-20 -left-20"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
      <div className="absolute w-96 h-96 rounded-full opacity-10 blur-3xl -bottom-20 -right-20"
        style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }} />

      <div className="relative w-full max-w-sm mx-4 animate-scale-in">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}>

          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
              <span className="text-white font-black text-xl">iM</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">i-Mentor Finance</h1>
            <p className="text-slate-400 text-sm mt-1">
              {step === 'password' ? 'Διαχείριση Εσόδων & Εξόδων' : 'Επαλήθευση ταυτότητας'}
            </p>
          </div>

          {step === 'password' ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Κωδικός Πρόσβασης
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  style={inputStyle}
                  placeholder="••••••••"
                  autoFocus
                  required
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                {loading ? 'Σύνδεση...' : 'Είσοδος'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2fa} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6 text-indigo-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 4.5h1.5" />
                  </svg>
                </div>
                <p className="text-slate-300 text-sm">Ανοίξτε το <span className="text-white font-semibold">Google Authenticator</span> και εισάγετε τον 6ψήφιο κωδικό.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Κωδικός Authenticator
                </label>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(v);
                  }}
                  className="w-full px-4 py-3 rounded-xl text-white text-2xl font-mono text-center tracking-[0.4em] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  style={inputStyle}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                {loading ? 'Επαλήθευση...' : 'Επαλήθευση'}
              </button>
              <button type="button" onClick={() => { setStep('password'); setCode(''); }}
                className="w-full py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors">
                ← Πίσω στον κωδικό
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
