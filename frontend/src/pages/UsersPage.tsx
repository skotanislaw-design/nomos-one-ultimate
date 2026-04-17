import { useEffect, useState } from 'react';
import { Plus, X, Shield, Trash2, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { usersApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

interface PendingUser {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'lawyer' });
  const perms = usePermissions();

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, pendingRes] = await Promise.all([
        usersApi.list().catch(() => ({ data: [] })),
        usersApi.listPendingUsers?.().catch(() => ({ data: [] })) || Promise.resolve({ data: [] })
      ]);
      setUsers(usersRes.data || []);
      setPendingUsers(pendingRes.data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await usersApi.create(form);
      toast.success('Χρήστης δημιουργήθηκε');
      setShowAdd(false);
      setForm({ name: '', email: '', password: '', role: 'lawyer' });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    }
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await usersApi.approveUser?.(id);
      toast.success('Χρήστης εγκρίθηκε');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Απόρριψη και διαγραφή χρήστη;')) return;
    setRejectingId(id);
    try {
      await usersApi.rejectUser?.(id);
      toast.success('Χρήστης απορρίφθηκε');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally {
      setRejectingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Διαγραφή χρήστη;')) return;
    try {
      await usersApi.delete(id);
      toast.success('Διαγράφηκε');
      load();
    } catch {
      toast.error('Σφάλμα');
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Διαχειριστής',
    lawyer: 'Δικηγόρος',
    secretary: 'Γραμματεία',
    trainee: 'Ασκούμενος'
  };
  const roleBadge: Record<string, string> = {
    admin: 'bg-[#C6A75E]/15 text-[#C6A75E] border-[#C6A75E]/20',
    lawyer: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    secretary: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    trainee: 'bg-slate-500/15 text-slate-400 border-slate-500/20'
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Διαχείριση Χρηστών</h2>
          <p className="page-subtitle">{users.length} χρήστες {pendingUsers.length > 0 && `· ${pendingUsers.length} εκκρεμεί έγκρισης`}</p>
        </div>
        {perms.isAdmin && (
          <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5">
            <Plus size={14} /> Νέος Χρήστης
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PENDING USERS SECTION
      ═══════════════════════════════════════════════════════════════ */}
      {pendingUsers.length > 0 && (
        <div className="glass-card overflow-hidden border border-amber-500/20">
          <div className="p-5 border-b border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-400" />
              <h3 className="section-title">Εκκρεμείς Εγκρίσεις</h3>
              <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                {pendingUsers.length}
              </span>
            </div>
            <p className="text-xs text-[#8aa0b8] mt-1">Νέοι χρήστες που περιμένουν επιβεβαίωση</p>
          </div>
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Όνομα</th>
                <th>Email</th>
                <th className="hidden sm:table-cell">Ημ. Εγγραφής</th>
                <th>Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u: PendingUser) => (
                <tr key={u._id || u.id} className="bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                  <td className="font-medium text-[#d4dce8]">{u.name}</td>
                  <td className="text-xs text-[#8aa0b8]">{u.email}</td>
                  <td className="hidden sm:table-cell text-xs text-[#5a7a9a]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('el-GR') : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(u._id || u.id || '')}
                        disabled={approvingId === (u._id || u.id)}
                        className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
                        title="Έγκριση"
                      >
                        {approvingId === (u._id || u.id)
                          ? <Loader2 size={14} className="animate-spin" />
                          : <CheckCircle size={14} />}
                      </button>
                      <button
                        onClick={() => handleReject(u._id || u.id || '')}
                        disabled={rejectingId === (u._id || u.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                        title="Απόρριψη"
                      >
                        {rejectingId === (u._id || u.id)
                          ? <Loader2 size={14} className="animate-spin" />
                          : <XCircle size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          ACTIVE USERS
      ═══════════════════════════════════════════════════════════════ */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-[#1a3a5c]/40">
          <h3 className="section-title">Ενεργοί Χρήστες</h3>
        </div>
        <table className="w-full table-premium">
          <thead>
            <tr className="bg-[#0d2035]/40">
              <th>Όνομα</th>
              <th>Email</th>
              <th>Ρόλος</th>
              <th className="hidden sm:table-cell">Κατάσταση</th>
              {perms.isAdmin && <th>Ενέργειες</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u._id || u.id}>
                <td className="font-medium text-[#d4dce8]">{u.name}</td>
                <td className="text-xs text-[#8aa0b8]">{u.email}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 w-fit ${roleBadge[u.role] || roleBadge.lawyer}`}>
                    <Shield size={9} /> {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td className="hidden sm:table-cell">
                  <span className="status-active">Ενεργός</span>
                </td>
                {perms.isAdmin && (
                  <td>
                    <button
                      onClick={() => handleDelete(u._id || u.id)}
                      className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400 transition-colors"
                      title="Διαγραφή"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="p-8 text-center text-[#5a7a9a] text-sm">
            Δεν υπάρχουν ενεργοί χρήστες
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ADD USER MODAL
      ═══════════════════════════════════════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέος Χρήστης</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="label">Ονοματεπώνυμο</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="input-dark"
                  placeholder="Σταύρος Παπαδόπουλος"
                  required
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="input-dark"
                  placeholder="stavros@example.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Κωδικός</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="input-dark"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="label">Ρόλος</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="input-dark"
                  >
                    {Object.entries(roleLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Δημιουργία</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
