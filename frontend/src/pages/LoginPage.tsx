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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#C6A75E]/20"><Scale size={28} className="text-[#071220]" /></div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>NOMOS ONE</h1>
          <p className="text-sm text-[#6a8aaa]">Σκοτάνης & Συνεργάτες — Legal Operations</p>
        </div>
        <div className="glass-card p-8 border border-[#1a3a5c]">
          <h2 className="text-lg font-semibold text-white mb-6">Σύνδεση</h2>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">Email</label><div className="relative"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-dark pl-9" placeholder="you@skotanislaw.com" required /></div></div>
            <div><label className="label">Κωδικός</label><div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-dark pl-9 pr-10" required /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a7a9a] hover:text-[#C6A75E]">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></div>
            <button type="submit" disabled={loading} className="btn-gold w-full flex items-center justify-center gap-2 py-3"><LogIn size={16} /> {loading ? 'Σύνδεση...' : 'Είσοδος'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
