import { useEffect, useState } from 'react';
import { Plus, X, Clock } from 'lucide-react';
import { deadlinesApi, casesApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

export default function CalendarPage() {
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', case_id: '', type: 'hearing' });
  const perms = usePermissions();

  const load = () => { Promise.all([deadlinesApi.list().catch(() => ({data:[]})), casesApi.list().catch(() => ({data:[]}))]).then(([d, c]) => { setDeadlines(d.data); setCases(c.data); setLoading(false); }); };
  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await deadlinesApi.create(form); toast.success('Προθεσμία δημιουργήθηκε'); setShowAdd(false); load(); }
    catch { toast.error('Σφάλμα'); }
  };

  const sorted = [...deadlines].sort((a, b) => new Date(a.due_date || a.date || 0).getTime() - new Date(b.due_date || b.date || 0).getTime());
  const getDaysUntil = (d: string) => { const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); return diff < 0 ? 'Παρήλθε' : diff === 0 ? 'Σήμερα' : diff === 1 ? 'Αύριο' : `${diff} ημ.`; };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Ημερολόγιο & Προθεσμίες</h2><p className="page-subtitle">{deadlines.length} εγγραφές</p></div>
        {perms.canCreate('calendar' as any) && <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5"><Plus size={14} /> Νέα Προθεσμία</button>}
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full table-premium">
          <thead><tr className="bg-[#0d2035]/40"><th>Ημ/νία</th><th>Τίτλος</th><th className="hidden md:table-cell">Υπόθεση</th><th className="hidden sm:table-cell">Τύπος</th><th>Αντίστρ.</th></tr></thead>
          <tbody>{sorted.map((d: any, i) => {
            const dt = d.due_date || d.date || '';
            const du = dt ? getDaysUntil(dt) : '—';
            const urgent = du !== 'Παρήλθε' && parseInt(du) <= 7;
            return (
              <tr key={d._id || d.id || i}>
                <td className="font-mono text-xs text-[#C6A75E]">{dt ? new Date(dt).toLocaleDateString('el-GR') : '—'}</td>
                <td className="font-medium text-[#d4dce8]">{d.title || d.description}</td>
                <td className="hidden md:table-cell text-xs">{d.case_title || '—'}</td>
                <td className="hidden sm:table-cell"><span className="px-2 py-0.5 rounded text-[10px] bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">{d.type || '—'}</span></td>
                <td><span className={`text-xs font-medium ${urgent ? 'text-amber-400' : 'text-[#6a8aaa]'}`}>{du}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
        {sorted.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν προθεσμίες.</div>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between"><h3 className="text-lg font-bold text-white">Νέα Προθεσμία</h3><button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button></div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div><label className="label">Τίτλος</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-dark" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Ημ/νία</label><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input-dark" required /></div>
                <div><label className="label">Υπόθεση</label><select value={form.case_id} onChange={e => setForm({...form, case_id: e.target.value})} className="input-dark"><option value="">—</option>{cases.map(c => <option key={c._id||c.id} value={c._id||c.id}>{c.title}</option>)}</select></div>
              </div>
              <div className="flex gap-2 pt-2"><button type="submit" className="btn-gold flex-1">Αποθήκευση</button><button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
