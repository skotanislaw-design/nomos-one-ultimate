import { useEffect, useState } from 'react';
import { Search, Plus, X, Trash2, AlertTriangle, Receipt, TrendingUp, Briefcase, User, Tag, Calendar, FileText } from 'lucide-react';
import { expensesApi, casesApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type ExpenseTab = 'list' | 'by_case' | 'by_lawyer' | 'by_category';

const CATEGORIES: Record<string, string> = {
  court_fees:     'Δικαστικά Τέλη',
  grammatio:      'Γραμμάτιο Προκαταβολής',
  travel:         'Μετακίνηση',
  expert_witness: 'Πραγματογνωμοσύνη',
  filing:         'Κατάθεση Εγγράφων',
  research:       'Νομική Έρευνα',
  copies:         'Φωτοαντίγραφα',
  postage:        'Ταχυδρομικά',
  notary:         'Συμβολαιογράφος',
  translation:    'Μεταφράσεις',
  expert_fee:     'Αμοιβή Εμπειρογνώμονα',
  other:          'Λοιπά',
};

const CAT_COLORS: Record<string, string> = {
  court_fees:     'text-red-400 bg-red-500/10',
  grammatio:      'text-orange-400 bg-orange-500/10',
  travel:         'text-blue-400 bg-blue-500/10',
  expert_witness: 'text-purple-400 bg-purple-500/10',
  filing:         'text-[#C6A75E] bg-[#C6A75E]/10',
  research:       'text-cyan-400 bg-cyan-500/10',
  copies:         'text-slate-400 bg-slate-500/10',
  postage:        'text-green-400 bg-green-500/10',
  notary:         'text-pink-400 bg-pink-500/10',
  translation:    'text-indigo-400 bg-indigo-500/10',
  expert_fee:     'text-amber-400 bg-amber-500/10',
  other:          'text-[#5a7a9a] bg-[#132B45]',
};

export default function ExpensesPage() {
  const [data, setData]       = useState<any>({ entries: [], total: 0, month_total: 0, count: 0, by_case: [], by_lawyer: [], by_category: [] });
  const [cases, setCases]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ExpenseTab>('list');
  const [search, setSearch]   = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [form, setForm] = useState({
    case_id: '', amount: '', category: 'court_fees',
    description: '', receipt_ref: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const perms = usePermissions();

  const load = () => {
    Promise.all([
      expensesApi.list().catch(() => ({ data: { entries: [], total: 0, month_total: 0, count: 0, by_case: [], by_lawyer: [], by_category: [] } })),
      casesApi.list().catch(() => ({ data: [] })),
    ]).then(([e, c]) => {
      setData(e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : { entries: e.data || [], total: 0, month_total: 0, count: 0, by_case: [], by_lawyer: [], by_category: [] });
      setCases(Array.isArray(c.data) ? c.data : []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;

  const entries: any[] = data.entries || [];
  const filtered = entries.filter(e =>
    (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.case_title  || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.created_by_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.category    || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await expensesApi.create({
        ...form,
        amount: Number(form.amount),
        date: new Date(form.date).toISOString(),
      });
      toast.success('Έξοδο καταχωρήθηκε');
      setShowAdd(false);
      setForm({ case_id: '', amount: '', category: 'court_fees', description: '', receipt_ref: '', date: new Date().toISOString().split('T')[0], notes: '' });
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleDelete = async () => {
    if (adminPassword !== 'Admin123@' && !perms.isAdmin) { toast.error('Λάθος κωδικός'); return; }
    try {
      await expensesApi.delete(deleteTarget._id || deleteTarget.id);
      toast.success('Έξοδο διαγράφηκε');
      setDeleteTarget(null); setAdminPassword('');
      load();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const tabs = [
    { id: 'list'        as ExpenseTab, label: 'Λίστα',    count: entries.length },
    { id: 'by_case'     as ExpenseTab, label: 'Ανά Υπόθεση', count: (data.by_case || []).length },
    { id: 'by_lawyer'   as ExpenseTab, label: 'Ανά Δικηγόρο', count: (data.by_lawyer || []).length },
    { id: 'by_category' as ExpenseTab, label: 'Ανά Κατηγορία' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Έξοδα</h2>
          <p className="page-subtitle">{entries.length} εγγραφές — Σύνολο: {fmt(data.total)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5">
            <Plus size={14} /> Νέο Έξοδο
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-[3px] border-red-500/40">
          <Receipt size={18} className="text-red-400 mb-2" />
          <p className="text-2xl font-bold text-red-400">{fmt(data.total)}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Σύνολο Εξόδων</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-amber-500/40">
          <Calendar size={18} className="text-amber-400 mb-2" />
          <p className="text-2xl font-bold text-amber-400">{fmt(data.month_total)}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Τρέχων Μήνας</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-[#C6A75E]/40">
          <Briefcase size={18} className="text-[#C6A75E] mb-2" />
          <p className="text-2xl font-bold text-[#C6A75E]">{(data.by_case || []).length}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Υποθέσεις με Έξοδα</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-blue-500/40">
          <FileText size={18} className="text-blue-400 mb-2" />
          <p className="text-2xl font-bold text-white">{entries.length}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Συνολικές Εγγραφές</p>
        </div>
      </div>

      {/* ── List Tab ── */}
      {activeTab === 'list' && (
        <>
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
            <input placeholder="Αναζήτηση..." value={search} onChange={e => setSearch(e.target.value)} className="input-dark pl-9 text-xs" />
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full table-premium">
              <thead>
                <tr className="bg-[#0d2035]/40">
                  <th>Ημ/νία</th>
                  <th>Υπόθεση / Πελάτης</th>
                  <th className="hidden sm:table-cell">Κατηγορία</th>
                  <th className="hidden md:table-cell">Δικηγόρος</th>
                  <th className="hidden lg:table-cell">Αρ. Παρ.</th>
                  <th className="hidden md:table-cell">Περιγραφή</th>
                  <th>Ποσό</th>
                  {perms.isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => (
                  <tr key={e._id || e.id}>
                    <td className="text-xs font-mono">
                      {e.date ? new Date(e.date).toLocaleDateString('el-GR') : '—'}
                    </td>
                    <td>
                      <p className="text-xs font-medium text-[#d4dce8] truncate max-w-[160px]">{e.case_title || '—'}</p>
                      {e.client_name && <p className="text-[10px] text-[#5a7a9a]">{e.client_name}</p>}
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${CAT_COLORS[e.category] || CAT_COLORS.other}`}>
                        {CATEGORIES[e.category] || e.category}
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-[#132B45] flex items-center justify-center flex-shrink-0">
                          <User size={10} className="text-[#7a9ab8]" />
                        </div>
                        <span className="text-xs text-[#8aa0b8]">{e.created_by_name || '—'}</span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell text-xs font-mono text-[#5a7a9a]">
                      {e.receipt_ref || '—'}
                    </td>
                    <td className="hidden md:table-cell text-xs text-[#8aa0b8] max-w-[150px] truncate">
                      {e.description}
                    </td>
                    <td className="font-mono font-bold text-red-400">{fmt(Number(e.amount))}</td>
                    {perms.isAdmin && (
                      <td>
                        <button onClick={() => setDeleteTarget(e)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-[#5a7a9a] hover:text-red-400 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-14 text-center">
                <Receipt size={36} className="mx-auto text-[#2a4a6a] mb-3" />
                <p className="text-sm text-[#5a7a9a]">Δεν βρέθηκαν έξοδα.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── By Case Tab ── */}
      {activeTab === 'by_case' && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-[#1a3a5c]/40">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-[#C6A75E]" />
              <h3 className="section-title">Έξοδα ανά Υπόθεση</h3>
            </div>
          </div>
          {(data.by_case || []).length === 0 ? (
            <p className="p-8 text-center text-sm text-[#5a7a9a]">Δεν υπάρχουν δεδομένα.</p>
          ) : (
            <table className="w-full table-premium">
              <thead>
                <tr className="bg-[#0d2035]/40">
                  <th>Υπόθεση</th>
                  <th className="hidden sm:table-cell">Πελάτης</th>
                  <th className="hidden md:table-cell">Αρ. Υπόθεσης</th>
                  <th>Εγγραφές</th>
                  <th>Σύνολο</th>
                  <th className="hidden lg:table-cell">% Συνόλου</th>
                </tr>
              </thead>
              <tbody>
                {(data.by_case || []).map((row: any, i: number) => {
                  const pct = data.total > 0 ? Math.round((row.total / data.total) * 100) : 0;
                  return (
                    <tr key={i}>
                      <td className="font-medium text-[#d4dce8] text-sm max-w-[180px] truncate">
                        {row.case_title || row.case_id || '—'}
                      </td>
                      <td className="hidden sm:table-cell text-xs text-[#8aa0b8]">{row.client_name || '—'}</td>
                      <td className="hidden md:table-cell text-xs font-mono text-[#C6A75E]">{row.case_number || '—'}</td>
                      <td className="text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#132B45] text-[#8aa0b8]">{row.count}</span>
                      </td>
                      <td className="font-mono font-bold text-red-400">{fmt(row.total)}</td>
                      <td className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-[#0d2035]">
                            <div className="h-full rounded-full bg-red-400/60 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-[#5a7a9a]">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#0d2035]/60 border-t-2 border-[#1a3a5c]/60">
                  <td className="font-bold text-[#C6A75E]">ΣΥΝΟΛΟ</td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="text-center font-mono font-bold text-[#C6A75E]">{entries.length}</td>
                  <td className="font-mono font-bold text-red-400">{fmt(data.total)}</td>
                  <td className="hidden lg:table-cell" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── By Lawyer Tab ── */}
      {activeTab === 'by_lawyer' && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-[#1a3a5c]/40">
            <div className="flex items-center gap-2">
              <User size={16} className="text-[#C6A75E]" />
              <h3 className="section-title">Έξοδα ανά Δικηγόρο</h3>
            </div>
          </div>
          {(data.by_lawyer || []).length === 0 ? (
            <p className="p-8 text-center text-sm text-[#5a7a9a]">Δεν υπάρχουν δεδομένα.</p>
          ) : (
            <div className="p-5 space-y-3">
              {(data.by_lawyer || []).map((row: any, i: number) => {
                const pct = data.total > 0 ? Math.round((row.total / data.total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C6A75E]/20 to-[#C6A75E]/5 border border-[#C6A75E]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#C6A75E]">
                        {(row.lawyer_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium text-[#d4dce8]">{row.lawyer_name || '—'}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#5a7a9a]">{row.count} εγγραφές</span>
                          <span className="font-mono font-bold text-red-400">{fmt(row.total)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[#0d2035]">
                          <div className="h-full rounded-full bg-red-400/50 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-[#5a7a9a] w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── By Category Tab ── */}
      {activeTab === 'by_category' && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-[#1a3a5c]/40">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-[#C6A75E]" />
              <h3 className="section-title">Έξοδα ανά Κατηγορία</h3>
            </div>
          </div>
          {(data.by_category || []).length === 0 ? (
            <p className="p-8 text-center text-sm text-[#5a7a9a]">Δεν υπάρχουν δεδομένα.</p>
          ) : (
            <div className="p-5 space-y-3">
              {(data.by_category || []).map((row: any, i: number) => {
                const pct = data.total > 0 ? Math.round((row.total / data.total) * 100) : 0;
                const colorClass = CAT_COLORS[row.category] || CAT_COLORS.other;
                return (
                  <div key={i} className="p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colorClass}`}>
                          {CATEGORIES[row.category] || row.category}
                        </span>
                        <span className="text-[10px] text-[#5a7a9a]">{row.count} εγγραφές</span>
                      </div>
                      <span className="font-mono font-bold text-red-400">{fmt(row.total)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#0d2035]">
                        <div className="h-full rounded-full bg-red-400/50 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-[#5a7a9a] w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Add Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c] my-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέο Έξοδο</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {/* Case */}
              <div>
                <label className="label">Υπόθεση *</label>
                <select value={form.case_id} onChange={e => setForm({ ...form, case_id: e.target.value })} className="input-dark" required>
                  <option value="">Επιλέξτε υπόθεση...</option>
                  {cases.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.title}{c.client_name ? ` — ${c.client_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ποσό (€) *</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} className="input-dark" required />
                </div>
                <div>
                  <label className="label">Ημερομηνία *</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })} className="input-dark" required />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="label">Κατηγορία</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {Object.entries(CATEGORIES).map(([key, label]) => (
                    <button key={key} type="button"
                      onClick={() => setForm({ ...form, category: key })}
                      className={`py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-all text-left ${
                        form.category === key
                          ? `${CAT_COLORS[key] || ''} border-current`
                          : 'border-[#1a3a5c]/40 bg-[#0d2035]/40 text-[#7a9ab8] hover:border-[#1a3a5c]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">Περιγραφή *</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="π.χ. Παράβολο εφέσεως αρ. 12345" className="input-dark" required />
              </div>

              {/* Receipt ref */}
              <div>
                <label className="label">Αρ. Παραστατικού / Απόδειξης</label>
                <input value={form.receipt_ref} onChange={e => setForm({ ...form, receipt_ref: e.target.value })}
                  placeholder="π.χ. ΑΠΟ-2024-001" className="input-dark" />
              </div>

              {/* Notes */}
              <div>
                <label className="label">Σημειώσεις</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-dark h-14 resize-none" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Καταχώρηση</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}>
          <div className="glass-card w-full max-w-sm border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white">Διαγραφή Εξόδου;</h3>
                <p className="text-sm text-[#7a9ab8] mt-1">{CATEGORIES[deleteTarget.category] || deleteTarget.category} — <strong className="text-red-400">{fmt(Number(deleteTarget.amount))}</strong></p>
                <p className="text-xs text-[#5a7a9a] mt-1">{deleteTarget.case_title || ''}</p>
                <p className="text-xs text-[#5a7a9a] mt-2">Απαιτείται κωδικός διαχειριστή</p>
              </div>
              <div>
                <label className="label">Κωδικός Διαχειριστή</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                  placeholder="••••••••" className="input-dark" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleDelete()} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setDeleteTarget(null); setAdminPassword(''); }} className="btn-dark flex-1">Ακύρωση</button>
                <button onClick={handleDelete} disabled={!adminPassword}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all disabled:opacity-40">
                  Διαγραφή
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
