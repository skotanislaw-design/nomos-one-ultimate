import { useEffect, useState } from 'react';
import { Search, Plus, X, Eye, Trash2, Download, AlertTriangle, ArrowUpDown, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { casesApi, clientsApi } from '@/lib/api';
import api from '@/lib/api';
import DocumentScanButton, { ExtractedData } from '@/components/DocumentScanButton';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';
import { parseTs } from '@/lib/prefs';

const STATUS_MAP: Record<string, string> = {
  open: 'status-active', in_progress: 'status-info', closed_won: 'status-active',
  closed_lost: 'status-closed', hearing: 'status-pending', appeal: 'status-urgent',
};
const STATUS_LABELS: Record<string, string> = {
  open: 'Ανοικτή', in_progress: 'Σε Εξέλιξη', hearing: 'Ακροατήριο',
  appeal: 'Έφεση', closed_won: 'Κερδήθηκε', closed_lost: 'Απώλεια',
  closed_settled: 'Συμβιβασμός', archived: 'Αρχείο',
};

type StatusTab = 'all' | 'open' | 'in_progress' | 'hearing' | 'appeal' | 'closed' | 'pending';
type SortKey = 'offense' | 'client_name' | 'legal_category' | 'law_articles' | 'status' | 'created_at';

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
  const [pendingIntakes, setPendingIntakes] = useState<any[]>([]);
  const [summaryCase, setSummaryCase] = useState<any>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadPending = () => {
    api.get('/api/pending-intakes').then(r => setPendingIntakes(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const r = await api.post(`/api/pending-intakes/${id}/approve`);
      toast.success(`Εγκρίθηκε! Υπόθεση ${r.data.case_number}`);
      loadPending(); load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
    finally { setApprovingId(null); }
  };

  const handleReject = async (id: string) => {
    try {
      await api.post(`/api/pending-intakes/${id}/reject`, { notes: '' });
      toast.success('Απορρίφθηκε');
      loadPending();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleScanExtract = (data: ExtractedData) => {
    if (data.case) {
      const cs = data.case;
      setForm(prev => ({
        ...prev,
        title: cs.title || prev.title,
        category: cs.category || prev.category,
        summary: [cs.summary, cs.court ? 'Δικαστήριο: ' + cs.court : null, cs.opposing_party ? 'Αντίδικος: ' + cs.opposing_party : null].filter(Boolean).join(' | ') || prev.summary,
        offense: prev.offense || cs.title || '',
      }));
    }
  };

  const [form, setForm] = useState({ title: '', client_id: '', category: '', summary: '', offense: '', law_articles: '' });
  const perms = usePermissions();

  const load = () => {
    Promise.all([casesApi.list(), clientsApi.list()])
      .then(([c, cl]) => { setCases(Array.isArray(c.data) ? c.data : []); setClients(Array.isArray(cl.data) ? cl.data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); loadPending(); }, []);

  const getSortVal = (c: any, key: SortKey): string => {
    if (key === 'offense') return c.offense || c.title || '';
    if (key === 'legal_category') return c.legal_category || '';
    return c[key] || '';
  };

  const filtered = cases
    .filter(c => {
      const q = search.toLowerCase();
      const ms = !q || [c.title, c.case_number, c.client_name, c.offense, c.law_articles, c.legal_category]
        .some(v => (v || '').toLowerCase().includes(q));
      const mst = activeTab === 'all' ? true
        : activeTab === 'closed' ? c.status?.startsWith('closed')
        : c.status === activeTab;
      return ms && mst;
    })
    .sort((a, b) => {
      const av = getSortVal(a, sortKey);
      const bv = getSortVal(b, sortKey);
      const cmp = sortKey === 'created_at'
        ? new Date(av).getTime() - new Date(bv).getTime()
        : String(av).localeCompare(String(bv), 'el');
      return sortAsc ? cmp : -cmp;
    });

  const count = (tab: StatusTab) => cases.filter(c =>
    tab === 'all' ? true : tab === 'closed' ? c.status?.startsWith('closed') : c.status === tab
  ).length;

  const tabs = (([
    { id: 'all', label: 'Όλες' }, { id: 'open', label: 'Ανοικτές' },
    { id: 'in_progress', label: 'Σε Εξέλιξη' }, { id: 'hearing', label: 'Ακροατήριο' },
    { id: 'appeal', label: 'Έφεση' }, { id: 'closed', label: 'Κλειστές' },
    { id: 'pending', label: `Εκκρεμείς${pendingIntakes.length > 0 ? ` (${pendingIntakes.length})` : ''}` },
  ] as Array<{ id: StatusTab; label: string }>)).map(t => ({ ...t, count: t.id === 'pending' ? pendingIntakes.length : count(t.id) }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category) { toast.error('Η κατηγορία υπόθεσης είναι υποχρεωτική'); return; }
    try { await casesApi.create({ ...form, title: form.title || form.offense }); toast.success('Υπόθεση δημιουργήθηκε'); setShowAdd(false); load(); }
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
    const headers = ['Κωδικός', 'Αδίκημα', 'Εντολέας', 'Κατηγορία', 'Άρθρα ΠΚ', 'Κατάσταση'];
    const rows = filtered.map(c => [c.case_number || '', c.offense || c.title || '', (c.client_names || [c.client_name]).join(', '), c.legal_category || '', c.law_articles || '', STATUS_LABELS[c.status] || c.status || '']);
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

      {/* Pending intakes tab */}
      {activeTab === 'pending' ? (
        <div className="space-y-3">
          {pendingIntakes.length === 0 && (
            <div className="glass-card py-14 text-center text-[#5a7a9a] text-sm">
              <Clock size={32} className="mx-auto mb-3 opacity-30" />
              Δεν υπάρχουν εκκρεμείς αιτήσεις.
            </div>
          )}
          {pendingIntakes.map(pi => {
            const ext = pi.extracted || {};
            const cs = ext.case || {};
            const conf = ext.confidence || 'low';
            const confColor = conf === 'high' ? 'text-green-400' : conf === 'medium' ? 'text-yellow-400' : 'text-red-400';
            const isPending = pi.status === 'pending';
            return (
              <div key={pi.id || pi._id} className="glass-card p-4 border border-[#1a3a5c]/60">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isPending ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' : 'border-red-500/40 text-red-400 bg-red-500/10'}`}>
                        {isPending ? 'ΕΚΚΡΕΜΕΙ' : 'ΑΠΟΡΡΙΦΘΗΚΕ'}
                      </span>
                      <span className={`text-[10px] font-mono ${confColor}`}>AI: {conf}</span>
                      <span className="text-[10px] text-[#5a7a9a]">{pi.source?.toUpperCase()} · {pi.submitted_by}</span>
                    </div>
                    {pi.client_names && pi.client_names.length > 1 ? (
                      <div className="flex flex-wrap gap-1 mb-0.5">
                        {pi.client_names.map((n: string, i: number) => (
                          <span key={i} className="text-xs font-semibold text-[#d4dce8] bg-[#0d2035] border border-[#1a3a5c]/50 rounded px-1.5 py-0.5">👤 {n}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="font-semibold text-[#d4dce8] truncate">👤 {pi.client_name}</p>
                    )}
                    <p className="text-xs text-[#8aa0b8] truncate mt-0.5">📁 {cs.title || '—'}</p>
                    {ext.summary && <p className="text-xs text-[#5a7a9a] mt-1 line-clamp-2">{ext.summary}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(pi.filenames || []).map((f: string) => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d2035] text-[#5a7a9a] border border-[#1a3a5c]/40 font-mono truncate max-w-[150px]">{f}</span>
                      ))}
                    </div>
                    {(ext.key_facts || []).length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {ext.key_facts.slice(0, 3).map((f: string, i: number) => (
                          <li key={i} className="text-[10px] text-[#6a8aaa] flex gap-1"><span className="text-[#C6A75E]">·</span>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {isPending && (
                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button onClick={() => handleApprove(pi.id || pi._id)} disabled={approvingId === pi.id || pi._id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-all disabled:opacity-40">
                        <CheckCircle size={13} />{approvingId === pi.id || pi._id ? '...' : 'Έγκριση'}
                      </button>
                      <button onClick={() => handleReject(pi.id || pi._id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-all">
                        <XCircle size={13} />Απόρριψη
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="glass-card overflow-hidden table-scroll">
        <table className="w-full table-premium">
          <thead>
            <tr className="bg-[#0d2035]/40">
              <th><SortBtn col="offense" label="Αδίκημα" /></th>
              <th><SortBtn col="client_name" label="Εντολέας" /></th>
              <th className="hidden sm:table-cell"><SortBtn col="legal_category" label="Κατηγορία" /></th>
              <th className="hidden lg:table-cell"><SortBtn col="law_articles" label="Άρθρα ΠΚ" /></th>
              <th><SortBtn col="status" label="Κατάσταση" /></th>
              <th><SortBtn col="created_at" label="Ημ/νία" /></th>
              <th>Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const displayClients = c.client_names && c.client_names.length > 1
                ? c.client_names
                : [c.client_name || '—'];
              return (
              <tr key={c._id || c.id}>
                <td>
                  <div>
                    <p className="font-medium text-[#d4dce8] truncate max-w-[220px]" title={c.offense || c.title}>
                      {c.offense || c.title || '—'}
                    </p>
                    <p className="text-[10px] font-mono text-[#C6A75E]">{c.case_number || '—'}</p>
                  </div>
                </td>
                <td>
                  <div className="space-y-0.5">
                    {displayClients.map((n: string, i: number) => (
                      <p key={i} className="text-xs text-[#b0c4d8] truncate max-w-[160px]" title={n}>{n}</p>
                    ))}
                  </div>
                </td>
                <td className="hidden sm:table-cell">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40 whitespace-nowrap">{c.legal_category || '—'}</span>
                </td>
                <td className="hidden lg:table-cell">
                  {c.law_articles
                    ? <span className="text-[10px] font-mono text-[#C6A75E] bg-[#0d2035] border border-[#C6A75E]/20 px-1.5 py-0.5 rounded">{c.law_articles}</span>
                    : <span className="text-[10px] text-[#3a5a7a]">—</span>
                  }
                </td>
                <td><span className={STATUS_MAP[c.status] || 'status-pending'}>{STATUS_LABELS[c.status] || c.status}</span></td>
                <td className="text-[10px] text-[#5a7a9a] whitespace-nowrap">
                  {c.created_at ? (parseTs(c.created_at)?.toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'2-digit' }) ?? '—') : '—'}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSummaryCase(c)} title="Σύνοψη"
                      className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                      <FileText size={14} />
                    </button>
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
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν βρέθηκαν υποθέσεις.</div>}
      </div>
      )}

      {/* Case Summary Modal */}
      {summaryCase && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSummaryCase(null)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[#1a3a5c]/40 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-[#C6A75E] mb-1">{summaryCase.case_number || '—'}</p>
                <h3 className="text-base font-bold text-white leading-tight">{summaryCase.offense || summaryCase.title}</h3>
                {summaryCase.offense && summaryCase.title !== summaryCase.offense && (
                  <p className="text-[10px] text-[#5a7a9a] italic mt-0.5">{summaryCase.title}</p>
                )}
                {summaryCase.law_articles && (
                  <p className="text-[10px] font-mono text-[#C6A75E]/80 mt-0.5">{summaryCase.law_articles}</p>
                )}
                {(() => {
                  const names = (summaryCase.client_names?.length > 1 ? summaryCase.client_names : [summaryCase.client_name]).filter(Boolean);
                  return names.length ? <p className="text-xs text-[#7a9ab8] mt-1">{names.join(' · ')}</p> : null;
                })()}
              </div>
              <button onClick={() => setSummaryCase(null)} className="p-1.5 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] shrink-0"><X size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {summaryCase.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#5a7a9a] font-semibold mb-1.5">Περιγραφή</p>
                  <p className="text-sm text-[#b0c4d8] leading-relaxed">{summaryCase.description}</p>
                </div>
              )}
              {(summaryCase.ai_key_facts || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#5a7a9a] font-semibold mb-1.5">Βασικά Γεγονότα (AI)</p>
                  <ul className="space-y-1.5">
                    {summaryCase.ai_key_facts.map((f: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-[#8aa0b8]">
                        <span className="text-[#C6A75E] shrink-0 mt-0.5">·</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {summaryCase.court && <div><p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Δικαστήριο</p><p className="text-xs text-[#b0c4d8] mt-0.5">{summaryCase.court}</p></div>}
                {summaryCase.opposing_party && <div><p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Αντίδικος</p><p className="text-xs text-[#b0c4d8] mt-0.5">{summaryCase.opposing_party}</p></div>}
                {summaryCase.legal_category && <div><p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Κατηγορία</p><p className="text-xs text-[#b0c4d8] mt-0.5">{summaryCase.legal_category}</p></div>}
                {summaryCase.law_articles && <div><p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Άρθρα ΠΚ/Νόμου</p><p className="text-xs font-mono text-[#C6A75E] mt-0.5">{summaryCase.law_articles}</p></div>}
                {summaryCase.ai_confidence && <div><p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Αξιοπιστία AI</p><p className={`text-xs mt-0.5 font-semibold ${summaryCase.ai_confidence==='high'?'text-green-400':summaryCase.ai_confidence==='medium'?'text-yellow-400':'text-red-400'}`}>{summaryCase.ai_confidence}</p></div>}
              </div>
            </div>
            <div className="p-4 border-t border-[#1a3a5c]/40 shrink-0">
              <button onClick={() => { setSummaryCase(null); nav(`/cases/${summaryCase._id || summaryCase.id}`); }}
                className="btn-gold w-full text-xs">Άνοιγμα Υπόθεσης</button>
            </div>
          </div>
        </div>
      )}

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
              <div><label className="label">Αδίκημα / Σύντομος Τίτλος <span className="text-[#C6A75E]">*</span></label><input value={form.offense} onChange={e => setForm({...form, offense: e.target.value})} className="input-dark" placeholder="π.χ. Κλοπή, Σωματικές Βλάβες, Τροχαίο με τραυματισμό" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Πλήρης Τίτλος</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-dark" placeholder="Πλήρης τίτλος υπόθεσης" /></div>
                <div><label className="label">Άρθρα ΠΚ/Νόμου</label><input value={form.law_articles} onChange={e => setForm({...form, law_articles: e.target.value})} className="input-dark" placeholder="π.χ. ΠΚ 372, ΠΚ 386§1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Εντολέας</label><select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-dark" required><option value="">Επιλέξτε...</option>{clients.map(cl => <option key={cl._id || cl.id} value={cl._id || cl.id}>{cl.full_name}</option>)}</select></div>
                <div><label className="label">Κατηγορία <span className="text-[#C6A75E]">*</span></label><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input-dark" required><option value="">Επιλέξτε κατηγορία...</option>{['ποινικό','αστικό','διοικητικό','εμπορικό','εργατικό','οικογενειακό','ακίνητα','φορολογικό'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
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
