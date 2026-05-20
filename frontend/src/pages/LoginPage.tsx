import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/'); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const result = await login(email, password);
    if (result.error) setError(result.error); else navigate('/');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#040e1a 0%,#071220 40%,#040e1a 100%)' }}>

      {/* Ambient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #1E3A8A 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #C6A75E 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #1a3a5c 0%, transparent 60%)' }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(198,167,94,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(198,167,94,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #C6A75E 0%, #A8893D 100%)', boxShadow: '0 0 40px rgba(198,167,94,0.25), 0 8px 32px rgba(0,0,0,0.4)' }}>
              <Scale size={32} className="text-[#071220]" />
            </div>
            <div className="absolute w-24 h-24 rounded-2xl border border-[#C6A75E]/15" />
          </div>
          <div className="flex items-center gap-3 justify-center mb-2">
            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(198,167,94,0.6))' }} />
            <h1 className="text-2xl font-semibold tracking-[0.12em] text-[#C6A75E]"
              style={{ fontFamily: 'EB Garamond, Georgia, serif' }}>NOMOS ONE</h1>
            <div className="h-px w-10" style={{ background: 'linear-gradient(90deg, rgba(198,167,94,0.6), transparent)' }} />
          </div>
          <p className="text-[11px] text-[#4a6a8a] tracking-[0.1em] uppercase">Σκοτάνης & Συνεργάτες · Legal Operations</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#1a3a5c]/60 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(19,43,69,0.85), rgba(7,18,32,0.95))', backdropFilter: 'blur(20px)', boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(198,167,94,0.08)' }}>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(198,167,94,0.5) 50%, transparent 100%)' }} />
          <div className="p-8">
            <h2 className="text-base font-medium text-[#c0d0e0] mb-6" style={{ fontFamily: 'EB Garamond, serif', fontSize: '1.1rem' }}>
              Σύνδεση στο σύστημα
            </h2>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />{error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6a8a]" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input-dark pl-9 h-11" placeholder="you@skotanislaw.com" required />
                </div>
              </div>
              <div>
                <label className="label">Κωδικός</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6a8a]" />
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="input-dark pl-9 pr-10 h-11" required />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a6a8a] hover:text-[#C6A75E] transition-colors cursor-pointer">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="btn-gold w-full flex items-center justify-center gap-2 h-11 mt-1 font-semibold">
                {loading
                  ? <><div className="w-4 h-4 rounded-full border-2 border-[#071220]/30 border-t-[#071220] animate-spin" /> Σύνδεση...</>
                  : <><LogIn size={16} /> Είσοδος</>}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#2a4a6a] mt-5 tracking-[0.1em] uppercase">
          Ασφαλής σύνδεση · v2.0
        </p>
      </div>
    </div>
  );
}
