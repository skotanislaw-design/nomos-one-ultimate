import { useEffect, useState } from 'react';
import { Plus, X, Download, CreditCard, TrendingUp, Clock, CheckCircle, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { paymentsApi, casesApi, exportApi, authApi } from '@/lib/api';
import { parseTs } from '@/lib/prefs';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type PayTab = 'all' | 'pending' | 'paid';

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Τραπεζική Μεταφορά',
  cash: 'Μετρητά',
  check: 'Επιταγή',
  card: 'Κάρτα',
};

const METHOD_COLORS: Record<string, string> = {
  bank_transfer: 'text-blue-400 bg-blue-500/10',
  cash: 'text-emerald-400 bg-emerald-500/10',
  check: 'text-amber-400 bg-amber-500/10',
  card: 'text-purple-400 bg-purple-500/10',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PayTab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    case_id: '', client_name: '', amount: '', payment_method: 'bank_transfer',
    payment_date: new Date().toISOString().slice(0, 10), notes: '', reference: '',
  });
  const perms = usePermissions();

  const load = () => {
    Promise.all([
      paymentsApi.list().catch(() => ({ data: [] })),
      casesApi.list().catch(() => ({ data: [] })),
    ]).then(([p, c]) => {
      setPayments(Array.isArray(p.data) ? p.data : []);
      setCases(Array.isArray(c.data) ? c.data : []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;

  const filtered = payments.filter(p => {
    if (activeTab === 'all') return true;
    return activeTab === 'paid' ? p.status === 'paid' : p.status !== 'paid';
  });

  const totalReceived = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const thisMonthPayments = payments.filter(p => {
    const d = p.payment_date ? parseTs(p.payment_date) : null;
    if (!d || isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const tabs = [
    { id: 'all' as PayTab, label: 'Όλες', count: payments.length },
    { id: 'pending' as PayTab, label: 'Εκκρεμείς', count: payments.filter(p => p.status !== 'paid').length },
    { id: 'paid' as PayTab, label: 'Εξοφλημένες', count: payments.filter(p => p.status === 'paid').length },
  ];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCase = cases.find(c => (c._id || c.id) === form.case_id);
      await paymentsApi.create({
        ...form,
        amount: Number(form.amount),
        payment_date: new Date(form.payment_date).toISOString(),
        client_name: form.client_name || selectedCase?.client_name || '',
        status: 'paid',
      });
      toast.success('Πληρωμή καταγράφηκε');
      setShowAdd(false);
      setForm({ case_id: '', client_name: '', amount: '', payment_method: 'bank_transfer', payment_date: new Date().toISOString().slice(0, 10), notes: '', reference: '' });
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await authApi.verifyPassword(adminPassword);
    } catch {
      toast.error('Λάθος κωδικός διαχειριστή');
      return;
    }
    try {
      await paymentsApi.delete(deleteTarget._id || deleteTarget.id);
      toast.success('Πληρωμή διαγράφηκε');
      setDeleteTarget(null); setAdminPassword('');
      load();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const handleExcelExport = async () => {
    setExporting(true);
    try {
      const res = await exportApi.invoicesExcel();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'invoices.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel εξήχθη!');
    } catch { toast.error('Σφάλμα εξαγωγής'); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Πληρωμές</h2><p className="page-subtitle">{payments.length} εγγραφές</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          <button onClick={handleExcelExport} disabled={exporting} className="btn-dark text-xs flex items-center gap-1.5">
            <FileSpreadsheet size={13} /> {exporting ? 'Εξαγωγή...' : 'Excel'}
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5">
            <Plus size={14} /> Νέα Πληρωμή
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-[3px] border-emerald-500/40">
          <CheckCircle size={18} className="text-emerald-400 mb-2" />
          <p className="text-2xl font-bold text-emerald-400">{fmt(totalReceived)}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Σύνολο Εισπράξεων</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-[#C6A75E]/40">
          <TrendingUp size={18} className="text-[#C6A75E] mb-2" />
          <p className="text-2xl font-bold text-[#C6A75E]">{fmt(thisMonthTotal)}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Τρέχων Μήνας</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-blue-500/40">
          <CreditCard size={18} className="text-blue-400 mb-2" />
          <p className="text-2xl font-bold text-white">{payments.length}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Συνολικές Πληρωμές</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-amber-500/40">
          <Clock size={18} className="text-amber-400 mb-2" />
          <p className="text-2xl font-bold text-amber-400">{thisMonthPayments.length}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Αυτόν τον Μήνα</p>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden table-scroll">
        <table className="w-full table-premium">
          <thead>
            <tr className="bg-[#0d2035]/40">
              <th>Ημερομηνία</th>
              <th>Υπόθεση / Πελάτης</th>
              <th className="hidden sm:table-cell">Τρόπος</th>
              <th className="hidden md:table-cell">Παραπομπή</th>
              <th>Ποσό</th>
              {perms.isAdmin && <th>Ενέργειες</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const method = p.payment_method || 'bank_transfer';
              return (
                <tr key={p._id || p.id}>
                  <td className="text-xs">
                    {p.payment_date ? (parseTs(p.payment_date)?.toLocaleDateString('el-GR') ?? '—') : '—'}
                  </td>
                  <td>
                    <p className="text-xs font-medium text-[#d4dce8]">{p.case_title || p.case_id || '—'}</p>
                    {p.client_name && <p className="text-[10px] text-[#5a7a9a]">{p.client_name}</p>}
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${METHOD_COLORS[method] || 'text-[#8aa0b8] bg-[#132B45]'}`}>
                      {METHOD_LABELS[method] || method}
                    </span>
                  </td>
                  <td className="hidden md:table-cell text-xs font-mono text-[#5a7a9a]">
                    {p.reference || '—'}
                  </td>
                  <td className="font-mono font-bold text-emerald-400">{fmt(Number(p.amount || 0))}</td>
                  {perms.isAdmin && (
                    <td>
                      <button onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#7a9ab8] hover:text-red-400 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-14 text-center">
            <CreditCard size={36} className="mx-auto text-[#2a4a6a] mb-3" />
            <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν πληρωμές.</p>
          </div>
        )}
      </div>

      {/* Add Payment Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c] my-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέα Πληρωμή</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="label">Υπόθεση</label>
                <select value={form.case_id} onChange={e => setForm({ ...form, case_id: e.target.value })} className="input-dark">
                  <option value="">Επιλέξτε υπόθεση...</option>
                  {cases.map(c => <option key={c._id || c.id} value={c._id || c.id}>{c.title} — {c.client_name || ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ποσό (€)</label>
                  <input type="number" step="0.01" min="0" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} className="input-dark" required />
                </div>
                <div>
                  <label className="label">Ημερομηνία</label>
                  <input type="date" value={form.payment_date}
                    onChange={e => setForm({ ...form, payment_date: e.target.value })} className="input-dark" required />
                </div>
              </div>
              <div>
                <label className="label">Τρόπος Πληρωμής</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(METHOD_LABELS).map(([key, label]) => (
                    <button key={key} type="button"
                      onClick={() => setForm({ ...form, payment_method: key })}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        form.payment_method === key
                          ? 'border-[#C6A75E] bg-[#C6A75E]/10 text-[#C6A75E]'
                          : 'border-[#1a3a5c]/40 bg-[#0d2035]/40 text-[#7a9ab8] hover:border-[#1a3a5c]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Αρ. Παραπομπής</label>
                  <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
                    placeholder="TRN-..." className="input-dark" />
                </div>
                <div>
                  <label className="label">Πελάτης (προαιρετικό)</label>
                  <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
                    placeholder="Αυτόματα από υπόθεση" className="input-dark" />
                </div>
              </div>
              <div>
                <label className="label">Σημειώσεις</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-dark h-16 resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Καταχώρηση</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}>
          <div className="glass-card w-full max-w-sm border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white">Διαγραφή Πληρωμής;</h3>
                <p className="text-sm text-[#7a9ab8] mt-1">{fmt(Number(deleteTarget.amount || 0))}</p>
                <p className="text-xs text-[#5a7a9a] mt-1">Απαιτείται κωδικός διαχειριστή</p>
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
