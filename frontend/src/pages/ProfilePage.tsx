import { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Save, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, changePassword } = useAuth();
  const perms = usePermissions();
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { toast.error('Ο νέος κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες.'); return; }
    if (newPw !== confirmPw) { toast.error('Οι κωδικοί δεν ταιριάζουν.'); return; }
    setChanging(true);
    const result = await changePassword(curPw, newPw);
    if (result.error) toast.error(result.error); else { toast.success('Ο κωδικός άλλαξε επιτυχώς.'); setCurPw(''); setNewPw(''); setConfirmPw(''); }
    setChanging(false);
  };

  const strength = (p: string) => { if (!p) return { l: '', c: '', w: 0 }; let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s <= 2 ? { l: 'Αδύναμος', c: 'bg-red-500', w: 33 } : s <= 3 ? { l: 'Μέτριος', c: 'bg-amber-500', w: 60 } : { l: 'Ισχυρός', c: 'bg-emerald-500', w: 100 }; };
  const pw = strength(newPw);
  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const roleBadge: Record<string,string> = { admin: 'bg-[#C6A75E]/20 text-[#C6A75E] border-[#C6A75E]/30', lawyer: 'bg-blue-500/15 text-blue-400 border-blue-500/20', secretary: 'bg-purple-500/15 text-purple-400 border-purple-500/20', trainee: 'bg-slate-500/15 text-slate-400 border-slate-500/20' };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div><h2 className="page-title">Το Προφίλ μου</h2><p className="page-subtitle">Ρυθμίσεις λογαριασμού</p></div>

      {/* Profile Card */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0"><span className="text-2xl font-bold text-[#071220]">{initials}</span></div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-xl font-bold text-white">{user?.name}</h3>
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${roleBadge[user?.role||'lawyer']}`}><Shield size={11} className="inline mr-1" />{perms.roleLabel}</span>
            </div>
            <p className="text-sm text-[#7a9ab8]">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Password Change */}
      <div className="glass-card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2"><Lock size={16} className="text-[#C6A75E]" /> Αλλαγή Κωδικού</h3>
        <form onSubmit={handleChangePw} className="space-y-4">
          <div><label className="label">Τρέχων Κωδικός</label><div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} className="input-dark pl-9 pr-10" required /><button type="button" onClick={() => setShowCur(!showCur)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a7a9a] hover:text-[#C6A75E]">{showCur ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></div>
          <div><label className="label">Νέος Κωδικός</label><div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} className="input-dark pl-9 pr-10" required minLength={8} /><button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a7a9a] hover:text-[#C6A75E]">{showNew ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
            {newPw && <div className="mt-2"><div className="flex justify-between mb-1"><span className="text-[10px] text-[#5a7a9a]">Ισχύς</span><span className={`text-[10px] ${pw.w===100?'text-emerald-400':pw.w>=60?'text-amber-400':'text-red-400'}`}>{pw.l}</span></div><div className="w-full h-1.5 rounded-full bg-[#0d2035]"><div className={`h-full rounded-full ${pw.c} transition-all`} style={{width:`${pw.w}%`}} /></div></div>}
          </div>
          <div><label className="label">Επιβεβαίωση</label><div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-dark pl-9 pr-10" required />{confirmPw && <div className="absolute right-3 top-1/2 -translate-y-1/2">{newPw === confirmPw ? <CheckCircle size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-red-400" />}</div>}</div>{confirmPw && newPw !== confirmPw && <p className="text-[10px] text-red-400 mt-1">Οι κωδικοί δεν ταιριάζουν</p>}</div>
          <button type="submit" disabled={changing || newPw !== confirmPw || newPw.length < 8} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50"><Lock size={14} />{changing ? 'Αλλαγή...' : 'Αλλαγή Κωδικού'}</button>
        </form>
      </div>

      {/* Account Info */}
      <div className="glass-card p-6">
        <h3 className="section-title mb-4">Πληροφορίες Λογαριασμού</h3>
        <div className="space-y-2">
          <div className="flex justify-between p-2.5 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20"><span className="text-xs text-[#5a7a9a]">ID</span><span className="text-xs font-mono text-[#7a9ab8]">{user?.id?.slice(0, 16)}...</span></div>
          <div className="flex justify-between p-2.5 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20"><span className="text-xs text-[#5a7a9a]">Ρόλος</span><span className="text-xs text-[#C6A75E]">{perms.roleLabel}</span></div>
        </div>
      </div>
    </div>
  );
}
