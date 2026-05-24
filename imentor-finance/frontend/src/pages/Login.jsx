import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(password);
      navigate('/');
    } catch {
      toast.error('Λάθος κωδικός πρόσβασης');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a2e 100%)' }}>

      {/* Ambient glows */}
      <div className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl -top-20 -left-20"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
      <div className="absolute w-96 h-96 rounded-full opacity-10 blur-3xl -bottom-20 -right-20"
        style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }} />

      {/* Card */}
      <div className="relative w-full max-w-sm mx-4 animate-scale-in">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}>

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
              <span className="text-white font-black text-xl">iM</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">i-Mentor Finance</h1>
            <p className="text-slate-400 text-sm mt-1">Διαχείριση Εσόδων & Εξόδων</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Κωδικός Πρόσβασης
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                placeholder="••••••••"
                autoFocus
                required
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all duration-150
                         hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              {loading ? 'Σύνδεση...' : 'Είσοδος'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
