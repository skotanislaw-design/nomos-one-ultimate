import { useEffect, useState } from 'react';
import { Plus, X, Shield, Edit2, Trash2 } from 'lucide-react';
import { usersApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'lawyer' });
  const perms = usePermissions();

  const load = () => { usersApi.list().then(r => { setUsers(r.data || []); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await usersApi.create(form); toast.success('Χρήστης δημιουργήθηκε'); setShowAdd(false); setForm({ name: '', email: '', password: '', role: 'lawyer' }); load(); }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleDelete = async (id: string) => { if (!confirm('Διαγραφή χρήστη;')) return; try { await usersApi.delete(id); toast.success('Διαγράφηκε'); load(); } catch { toast.error('Σφάλμα'); } };

  const roleLabels: Record<string,string> = { admin: 'Διαχειριστής', lawyer: 'Δικηγόρος', secretary: 'Γραμματεία', trainee: 'Ασκούμενος' };
  const roleBadge: Record<string,string> = { admin: 'bg-[#C6A75E]/15 text-[#C6A75E] border-[#C6A75E]/20', lawyer: 'bg-blue-500/15 text-blue-400 border-blue-500/20', secretary: 'bg-purple-500/15 text-purple-400 border-purple-500/20', trainee: 'bg-slate-500/15 text-slate-400 border-slate-500/20' };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Διαχείριση Χρηστών</h2><p className="page-subtitle">{users.length} χρήστες</p></div>
        {perms.isAdmin && <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5"><Plus size={14} /> Νέος Χρήστης</button>}
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full table-premium">
          <thead><tr className="bg-[#0d2035]/40"><th>Όνομα</th><th>Email</th><th>Ρόλος</th><th className="hidden sm:table-cell">Κατάσταση</th>{perms.isAdmin && <th>Ενέργειες</th>}</tr></thead>
          <tbody>{users.map((u: any) => (
            <tr key={u._id||u.id}>
              <td className="font-medium text-[#d4dce8]">{u.name}</td>
              <td className="text-xs">{u.email}</td>
              <td><span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${roleBadge[u.role]||roleBadge.lawyer}`}><Shield size={9} className="inline mr-1" />{roleLabels[u.role]||u.role}</span></td>
              <td className="hidden sm:table-cell"><span className={u.approved === false ? 'status-pending' : 'status-active'}>{u.approved === false ? 'Εκκρεμεί' : 'Ενεργός'}</span></td>
              {perms.isAdmin && <td><button onClick={() => handleDelete(u._id||u.id)} className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400"><Trash2 size={14} /></button></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between"><h3 className="text-lg font-bold text-white">Νέος Χρήστης</h3><button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button></div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div><label className="label">Ονοματεπώνυμο</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-dark" required /></div>
              <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-dark" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Κωδικός</label><input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="input-dark" required minLength={8} /></div>
                <div><label className="label">Ρόλος</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input-dark">{Object.entries(roleLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div className="flex gap-2 pt-2"><button type="submit" className="btn-gold flex-1">Δημιουργία</button><button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
