import { useEffect, useState } from 'react';
import { Search, Plus, X, Eye, Trash2, Download, Building2, User as UserIcon, AlertTriangle, Phone, Mail, MapPin, Hash, Edit2, Briefcase, ChevronRight } from 'lucide-react';
import { clientsApi, casesApi, authApi } from '@/lib/api';
import DocumentScanButton, { ExtractedData } from '@/components/DocumentScanButton';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type ClientTab = 'all' | 'active' | 'inactive';
type ClientType = 'individual' | 'professional' | 'company' | 'public';

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  individual: 'Ιδιώτης',
  professional: 'Επιτηδευματίας',
  company: 'Εταιρεία',
  public: 'Δημόσιο',
};

const CLIENT_TYPE_COLORS: Record<ClientType, string> = {
  individual: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  professional: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  company: 'text-[#C6A75E] bg-[#C6A75E]/10 border-[#C6A75E]/20',
  public: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ClientTab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '', afm: '', phone: '', email: '', address: '',
    client_type: 'individual' as ClientType,
  });
  const handleScanExtract = (data: ExtractedData) => {
    if (data.client) {
      const cl = data.client;
      setForm(prev => ({
        ...prev,
        full_name: cl.full_name || prev.full_name,
        afm: cl.afm || prev.afm,
        phone: cl.phone || prev.phone,
        email: cl.email || prev.email,
        address: cl.address || prev.address,
        client_type: (cl.client_type as any) || prev.client_type,
      }));
    }
  };

  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientCases, setClientCases] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const perms = usePermissions();

  const load = () => {
    clientsApi.list().then(r => { setClients(Array.isArray(r.data) ? r.data : []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  // Load cases when a client is selected — uses bidirectional endpoint
  useEffect(() => {
    if (!selectedClient) { setClientCases([]); return; }
    const cid = selectedClient._id || selectedClient.id;
    setLoadingDetail(true);
    clientsApi.getCases(cid)
      .then(r => setClientCases(Array.isArray(r.data) ? r.data : []))
      .catch(() => setClientCases([]))
      .finally(() => setLoadingDetail(false));
  }, [selectedClient]);

  const openDetail = (client: any) => {
    setSelectedClient(client);
    setEditMode(false);
    setEditForm({ ...client });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await clientsApi.update(selectedClient._id || selectedClient.id, editForm);
      toast.success('Πελάτης ενημερώθηκε');
      setEditMode(false);
      setSelectedClient({ ...selectedClient, ...editForm });
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  const filtered = clients.filter(c => {
    const ms = (c.full_name || '').toLowerCase().includes(search.toLowerCase()) || (c.afm || '').includes(search);
    const mt = activeTab === 'all' ? true : activeTab === 'active' ? c.is_active !== false : c.is_active === false;
    return ms && mt;
  });

  const tabs = [
    { id: 'all' as ClientTab, label: 'Όλοι', count: clients.length },
    { id: 'active' as ClientTab, label: 'Ενεργοί', count: clients.filter(c => c.is_active !== false).length },
    { id: 'inactive' as ClientTab, label: 'Ανενεργοί', count: clients.filter(c => c.is_active === false).length },
  ];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await clientsApi.create(form);
      toast.success('Πελάτης δημιουργήθηκε');
      setShowAdd(false);
      setForm({ full_name: '', afm: '', phone: '', email: '', address: '', client_type: 'individual' });
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await authApi.verifyPassword(adminPassword);
    } catch {
      toast.error('Λάθος κωδικός');
      setDeleteLoading(false);
      return;
    }
    try {
      await clientsApi.update(deleteTarget._id || deleteTarget.id, { is_active: false });
      toast.success('Πελάτης απενεργοποιήθηκε');
      setDeleteTarget(null);
      setAdminPassword('');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα διαγραφής');
    } finally { setDeleteLoading(false); }
  };

  const exportCSV = () => {
    const headers = ['Ονοματεπώνυμο', 'ΑΦΜ', 'Τηλέφωνο', 'Email', 'Διεύθυνση', 'Τύπος', 'Κατάσταση'];
    const rows = filtered.map(c => [
      c.full_name || '', c.afm || '', c.phone || '', c.email || '',
      c.address || '', CLIENT_TYPE_LABELS[c.client_type as ClientType] || c.client_type || '',
      c.is_active !== false ? 'Ενεργός' : 'Ανενεργός',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pelatoloio.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Εξαγωγή CSV ολοκληρώθηκε');
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Πελατολόγιο</h2><p className="page-subtitle">{clients.length} εγγραφές</p></div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} title="Εξαγωγή CSV" className="btn-dark text-xs flex items-center gap-1.5">
            <Download size={13} /> CSV
          </button>
          {perms.canCreate('clients') && (
            <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5">
              <Plus size={14} /> Νέος Πελάτης
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
          <input type="text" placeholder="Αναζήτηση ονόματος ή ΑΦΜ..." value={search}
            onChange={e => setSearch(e.target.value)} className="input-dark pl-9 text-xs" />
        </div>
      </div>

      <div className="glass-card overflow-hidden table-scroll">
        <table className="w-full table-premium">
          <thead>
            <tr className="bg-[#0d2035]/40">
              <th>Ονοματεπώνυμο</th>
              <th className="hidden sm:table-cell">ΑΦΜ</th>
              <th className="hidden md:table-cell">Τηλέφωνο</th>
              <th className="hidden lg:table-cell">Email</th>
              <th className="hidden xl:table-cell">Τύπος</th>
              <th>Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const clientType = (c.client_type || 'individual') as ClientType;
              const typeColors = CLIENT_TYPE_COLORS[clientType] || CLIENT_TYPE_COLORS.individual;
              return (
                <tr key={c._id || c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#132B45] flex items-center justify-center flex-shrink-0">
                        {clientType === 'company' || clientType === 'public'
                          ? <Building2 size={12} className="text-[#C6A75E]" />
                          : <UserIcon size={12} className="text-[#7a9ab8]" />}
                      </div>
                      <div>
                        <button onClick={() => nav(`/clients/${c._id || c.id}`)}
                          className="font-medium text-[#d4dce8] hover:text-[#C6A75E] transition-colors text-left cursor-pointer">
                          {c.full_name}
                        </button>
                        {c.cases_count > 0 && (
                          <span className="ml-2 text-[10px] font-mono text-[#C6A75E] bg-[#C6A75E]/10 border border-[#C6A75E]/20 px-1.5 py-0.5 rounded">
                            {c.cases_count} υπόθ.
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-xs font-mono">{c.afm || '—'}</td>
                  <td className="hidden md:table-cell text-xs">{c.phone || '—'}</td>
                  <td className="hidden lg:table-cell text-xs">{c.email || '—'}</td>
                  <td className="hidden xl:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeColors}`}>
                      {CLIENT_TYPE_LABELS[clientType] || clientType}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => nav(`/clients/${c._id || c.id}`)} title="360° Προβολή"
                        className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                        <Eye size={14} />
                      </button>
                      {perms.isAdmin && (
                        <button onClick={() => setDeleteTarget(c)} title="Διαγραφή"
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
        {filtered.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν βρέθηκαν πελάτες.</div>}
      </div>

      {/* ── Add Client Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέος Πελάτης</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <DocumentScanButton onExtracted={handleScanExtract} className="w-full mb-2" />
              <div><label className="label">Ονοματεπώνυμο / Επωνυμία</label><input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="input-dark" required /></div>

              {/* Client Type */}
              <div>
                <label className="label">Τύπος Πελάτη</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(CLIENT_TYPE_LABELS) as [ClientType, string][]).map(([type, label]) => (
                    <button key={type} type="button"
                      onClick={() => setForm({...form, client_type: type})}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        form.client_type === type
                          ? `${CLIENT_TYPE_COLORS[type]} border-current`
                          : 'bg-[#0d2035]/40 border-[#1a3a5c]/40 text-[#7a9ab8] hover:border-[#1a3a5c]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.client_type === 'professional' && (
                  <p className="text-[10px] text-purple-400 mt-1.5">* Επιτηδευματίας: θα εφαρμόζεται παρακράτηση 20% στα τιμολόγια</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">ΑΦΜ</label><input value={form.afm} onChange={e => setForm({...form, afm: e.target.value})} className="input-dark" /></div>
                <div><label className="label">Τηλέφωνο</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-dark" /></div>
              </div>
              <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-dark" /></div>
              <div><label className="label">Διεύθυνση</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-dark" /></div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Δημιουργία</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Client Detail Slide-over Panel ── */}
      {selectedClient && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedClient(null)} />
          {/* panel */}
          <div className="fixed right-0 top-0 h-full w-full max-w-[420px] z-50 flex flex-col overflow-hidden"
            style={{ background: 'linear-gradient(180deg,#071220,#0a1929 50%,#071220)', borderLeft: '1px solid rgba(26,58,92,0.6)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3a5c]/40 flex-shrink-0">
              <h3 className="text-base font-bold text-white">Στοιχεία Πελάτη</h3>
              <div className="flex items-center gap-2">
                {perms.isAdmin && !editMode && (
                  <button onClick={() => setEditMode(true)}
                    className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all" title="Επεξεργασία">
                    <Edit2 size={16} />
                  </button>
                )}
                <button onClick={() => setSelectedClient(null)}
                  className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!editMode ? (
                /* ── VIEW MODE ── */
                <div className="p-6 space-y-6">
                  {/* Avatar + name */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C6A75E]/30 to-[#C6A75E]/10 border border-[#C6A75E]/20 flex items-center justify-center flex-shrink-0">
                      {(selectedClient.client_type === 'company' || selectedClient.client_type === 'public')
                        ? <Building2 size={28} className="text-[#C6A75E]" />
                        : <UserIcon size={28} className="text-[#C6A75E]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-white truncate">{selectedClient.full_name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${CLIENT_TYPE_COLORS[(selectedClient.client_type as ClientType) || 'individual']}`}>
                          {CLIENT_TYPE_LABELS[(selectedClient.client_type as ClientType) || 'individual']}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${selectedClient.is_active !== false ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#5a7a9a] bg-[#132B45]'}`}>
                          {selectedClient.is_active !== false ? '● Ενεργός' : '● Ανενεργός'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info fields */}
                  <div className="space-y-2">
                    {[
                      { icon: Hash, label: 'ΑΦΜ', value: selectedClient.afm },
                      { icon: Phone, label: 'Τηλέφωνο', value: selectedClient.phone },
                      { icon: Mail, label: 'Email', value: selectedClient.email },
                      { icon: MapPin, label: 'Διεύθυνση', value: selectedClient.address },
                    ].map(({ icon: Icon, label, value }) => (
                      value ? (
                        <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20">
                          <Icon size={15} className="text-[#5a7a9a] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-[#4a6a8a] uppercase tracking-wider">{label}</p>
                            <p className="text-sm text-[#d4dce8] mt-0.5 break-words">{value}</p>
                          </div>
                        </div>
                      ) : null
                    ))}
                  </div>

                  {/* Cases section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Briefcase size={14} className="text-[#C6A75E]" />
                        <p className="text-xs font-semibold text-[#C6A75E] uppercase tracking-wider">Υποθέσεις</p>
                      </div>
                      <span className="text-xs text-[#5a7a9a]">{clientCases.length} σύνολο</span>
                    </div>
                    {loadingDetail ? (
                      <div className="flex justify-center py-4"><div className="w-5 h-5 rounded-full border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>
                    ) : clientCases.length === 0 ? (
                      <p className="text-sm text-[#4a6a8a] text-center py-4">Δεν βρέθηκαν υποθέσεις</p>
                    ) : (
                      <div className="space-y-1.5">
                        {clientCases.map((c: any) => (
                          <button key={c._id || c.id} onClick={() => { setSelectedClient(null); nav(`/cases/${c._id || c.id}`); }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/20 hover:border-[#C6A75E]/30 hover:bg-[#132B45]/60 transition-all text-left group">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-[#d4dce8] truncate group-hover:text-[#C6A75E] transition-colors">
                                {c.offense || c.title || '—'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {c.legal_category && <span className="text-[9px] text-[#5a7a9a] bg-[#0d2035] border border-[#1a3a5c]/30 px-1 py-0.5 rounded">{c.legal_category}</span>}
                                {c.law_articles && <span className="text-[9px] font-mono text-[#C6A75E]/70">{c.law_articles}</span>}
                                {c.case_number && <span className="text-[9px] font-mono text-[#5a7a9a]">{c.case_number}</span>}
                              </div>
                            </div>
                            <ChevronRight size={13} className="text-[#3a5a7a] group-hover:text-[#C6A75E] transition-colors flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ── EDIT MODE ── */
                <form onSubmit={handleEditSave} className="p-6 space-y-4">
                  <p className="text-xs text-[#5a7a9a] mb-2">Επεξεργασία στοιχείων πελάτη</p>
                  <div><label className="label">Ονοματεπώνυμο / Επωνυμία</label>
                    <input value={editForm.full_name || ''} onChange={e => setEditForm({...editForm, full_name: e.target.value})} className="input-dark" required /></div>
                  <div>
                    <label className="label">Τύπος Πελάτη</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(CLIENT_TYPE_LABELS) as [ClientType, string][]).map(([type, label]) => (
                        <button key={type} type="button"
                          onClick={() => setEditForm({...editForm, client_type: type})}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                            editForm.client_type === type
                              ? `${CLIENT_TYPE_COLORS[type]} border-current`
                              : 'bg-[#0d2035]/40 border-[#1a3a5c]/40 text-[#7a9ab8]'
                          }`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">ΑΦΜ</label><input value={editForm.afm || ''} onChange={e => setEditForm({...editForm, afm: e.target.value})} className="input-dark" /></div>
                    <div><label className="label">Τηλέφωνο</label><input value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="input-dark" /></div>
                  </div>
                  <div><label className="label">Email</label><input type="email" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} className="input-dark" /></div>
                  <div><label className="label">Διεύθυνση</label><input value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} className="input-dark" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="btn-gold flex-1">Αποθήκευση</button>
                    <button type="button" onClick={() => setEditMode(false)} className="btn-dark flex-1">Ακύρωση</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirmation Modal (Admin Approval) ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}>
          <div className="glass-card w-full max-w-sm border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white">Απαιτείται Έγκριση Διαχειριστή</h3>
                <p className="text-sm text-[#7a9ab8] mt-1">Διαγραφή: <strong className="text-[#d4dce8]">{deleteTarget.full_name}</strong></p>
                <p className="text-xs text-[#5a7a9a] mt-2">Εισάγετε τον κωδικό διαχειριστή για επιβεβαίωση</p>
              </div>
              <div>
                <label className="label">Κωδικός Διαχειριστή</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark"
                  onKeyDown={e => e.key === 'Enter' && handleDeleteConfirm()}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setDeleteTarget(null); setAdminPassword(''); }} className="btn-dark flex-1">Ακύρωση</button>
                <button onClick={handleDeleteConfirm} disabled={!adminPassword || deleteLoading}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all disabled:opacity-40">
                  {deleteLoading ? 'Διαγραφή...' : 'Επιβεβαίωση Διαγραφής'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
