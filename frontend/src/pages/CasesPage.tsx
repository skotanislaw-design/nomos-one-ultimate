import { useEffect, useState } from 'react';
import { Search, Plus, X, Eye, Trash2, Download, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { casesApi, clientsApi } from '@/lib/api';
import DocumentScanButton, { ExtractedData } from '@/components/DocumentScanButton';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, string> = {
  open: 'status-active', in_progress: 'status-info', closed_won: 'status-active',
  closed_lost: 'status-closed', hearing: 'status-pending', appeal: 'status-urgent',
};
const STATUS_LABELS: Record<string, string> = {
  open: 'Ανοικτή', in_progress: 'Σε Εξέλιξη', hearing: 'Ακροαματήριο',
  appeal: 'Έφεση', closed_won: 'Κερδήθηκε', closed_lost: 'Απώλεια',
  closed_settled: 'Συμβιβασμός', archived: 'Αρχείο',
};

type StatusTab = 'all' | 'open' | 'in_progress' | 'hearing' | 'appeal' | 'closed';
type SortKey = 'title' | 'client_name' | 'category' | 'status' | 'created_at';

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const handleScanExtract = (data: ExtractedData) => {
    if (data.case) {
      const cs = data.case;
      setForm(prev => ({
        ...prev,
        title: cs.title || prev.title,
        category: cs.category || prev.category,
        summary: [cs.summary, cs.court ? 'Δικαστήριο: ' + cs.court : null, cs.opposing_party ? 'Αντίδικος: ' + cs.opposing_party : null].filter(Boolean).join(' | ') || prev.summary,
      }));
    }
  };

  const [form, setForm] = useState({ title: '', client_id: '', category: 'ποινικό', summary: '' });
  const perms = usePermissions();

  const load = () => {
    Promise.all([casesApi.list(), clientsApi.list()])
      .then(([c, cl]) => { setCases(Array.isArray(c.data) ? c.data : []); setClients(Array.isArray(cl.data) ? cl.data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = cases
    .filter(c => {
      const ms = (c.title || '').toLowerCase().includes(search.toLowerCase()) || (c.case_number || '').toLowerCase().includes(search.toLowerCase());
      const mst = activeTab === 'all' ? true
        : activeTab === 'closed' ? c.status?.startsWith('closed')
        : c.status === activeTab;
      return ms && mst;
    })
    .sort((a, b) => {
      const av = a[sortKey] || '';
      const bv = b[sortKey] || '';
      const cmp = String(av).localeCompare(String(bv), 'el');
      return sortAsc ? cmp : -cmp;
    });

  const count = (tab: StatusTab) => cases.filter(c =>
    tab === 'all' ? true : tab === 'closed' ? c.status?.startsWith('closed') : c.status === tab
  ).length;

  const tabs: { id: StatusTab; label: string }[] = [
    { id: 'all', label: 'Όλες' }, { id: 'open', label: 'Ανοικτές' },
    { id: 'in_progress', label: 'Σε Εξέλιξη' }, { id: 'hearing', label: 'Ακροαματήριο' },
    { id: 'appeal', label: 'Έφεση' }, { id: 'closed', label: 'Κλειστές' },
  ].map(t => ({ ...t, count: count(t.id) }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await casesApi.create(form); toast.success('Υπόθεση δημιουργήθηκε'); setShowAdd(false); load(); }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (adminPassword !== 'Admin123@' && !perms.isAdmin) {
      toast.error('Λάθος κωδικός διαχειριστή'); return;
    }
    setDeleteLoading(true);
    try {
      await casesApi.updateStatus(deleteTarget._id || deleteTarget.id, { status: 'archived' });
      toast.success('Υπόθεση αρχειοθετήθηκε');
      setDeleteTarget(null); setAdminPassword('');
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
    finally { setDeleteLoading(false); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-[#C6A75E] transition-colors group">
      {label}
      <ArrowUpDown size={11} className={`transition-colors ${sortKey === col ? 'text-[#C6A75E]' : 'text-[#3a5a7a] group-hover:text-[#C6A75E]'}`} />
    </button>
  );

  const exportCSV = () => {
    const headers = ['Κωδικός', 'Τίτλος', 'Πελάτης', 'Κατηγορία', 'Κατάσταση'];
    const rows = filtered.map(c => [c.case_number || '', c.title || '', c.client_name || '', c.category || '', STATUS_LABELS[c.status] || c.status || '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ypotheseis.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Εξαγωγή CSV ολοκληρώθηκε');
  };

  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Υποθέσεις</h2>
          <p className="page-subtitle">{cases.length} συνολικά — {cases.filter(c => !c.status?.startsWith('closed')).length} ενεργές</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-dark text-xs flex items-center gap-1.5">
            <Download size={13} /> CSV
          </button>
          {perms.canCreate('cases') && (
            <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5">
              <Plus size={14} /> Νέα Υπόθεση
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
          <input placeholder="Αναζήτηση..." value={search} onChange={e => setSearch(e.target.value)} className="input-dark pl-9 text-xs" />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full table-premium">
          <thead>
            <tr className="bg-[#0d2035]/40">
              <th><SortBtn col="title" label="Τίτλος" /></th>
              <th className="hidden md:table-cell"><SortBtn col="client_name" label="Πελάτης" /></th>
              <th className="hidden sm:table-cell"><SortBtn col="category" label="Κατηγορία" /></th>
              <th><SortBtn col="status" label="Κατάσταση" /></th>
              <th>Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c._id || c.id}>
                <td>
                  <div>
                    <p className="font-medium text-[#d4dce8] truncate max-w-[200px]">{c.title}</p>
                    <p className="text-[10px] font-mono text-[#C6A75E]">{c.case_number || '—'}</p>
                  </div>
                </td>
                <td className="hidden md:table-cell text-xs">{c.client_name || '—'}</td>
                <td className="hidden sm:table-cell">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">{c.category || '—'}</span>
                </td>
                <td><span className={STATUS_MAP[c.status] || 'status-pending'}>{STATUS_LABELS[c.status] || c.status}</span></td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => nav(`/cases/${c._id || c.id}`)} title="Προβολή"
                      className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                      <Eye size={14} />
                    </button>
                    {perms.isAdmin && (
                      <button onClick={() => setDeleteTarget(c)} title="Αρχειοθέτηση"
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#7a9ab8] hover:text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν βρέθηκαν υποθέσεις.</div>}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέα Υπόθεση</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <DocumentScanButton onExtracted={handleScanExtract} className="w-full mb-2" />
              <div><label className="label">Τίτλος</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-dark" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Πελάτης</label><select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-dark"><option value="">Επιλέξτε...</option>{clients.map(cl => <option key={cl._id || cl.id} value={cl._id || cl.id}>{cl.full_name}</option>)}</select></div>
                <div><label className="label">Κατηγορία</label><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input-dark">{['ποινικό','αστικό','διοικητικό','εμπορικό','εργατικό','οικογενειακό','ακίνητα','φορολογικό'].map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div><label className="label">Περιγραφή</label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} className="input-dark h-20 resize-none" /></div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Δημιουργία</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Archive confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}>
          <div className="glass-card w-full max-w-sm border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white">Αρχειοθέτηση Υπόθεσης;</h3>
                <p className="text-sm text-[#7a9ab8] mt-1"><strong className="text-[#d4dce8]">{deleteTarget.title}</strong></p>
                <p className="text-xs text-[#5a7a9a] mt-2">Απαιτείται κωδικός διαχειριστή</p>
              </div>
              <div>
                <label className="label">Κωδικός Διαχειριστή</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                  placeholder="••••••••" className="input-dark" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleDeleteConfirm()} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setDeleteTarget(null); setAdminPassword(''); }} className="btn-dark flex-1">Ακύρωση</button>
                <button onClick={handleDeleteConfirm} disabled={!adminPassword || deleteLoading}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all disabled:opacity-40">
                  {deleteLoading ? 'Αρχειοθέτηση...' : 'Επιβεβαίωση'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
