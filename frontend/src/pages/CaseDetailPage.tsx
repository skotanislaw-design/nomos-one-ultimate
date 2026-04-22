import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, FileText, Upload, Calendar, DollarSign, Users, Clock,
  CheckSquare, MessageSquare, Scale, Gavel, CreditCard, Plus, X,
  Download, Trash2, Mail, Eye, AlertTriangle, FileSpreadsheet, TrendingUp,
} from 'lucide-react';
import { casesApi, hearingsApi, paymentsApi, invoicingApi, exportApi, emailApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { usePermissions } from '@/hooks/usePermissions';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { toast } from 'sonner';

type DetailTab = 'overview' | 'hearings' | 'payments' | 'documents' | 'notes';

const HEARING_STATUS_COLORS: Record<string, string> = {
  scheduled: 'status-pending',
  completed: 'status-active',
  postponed: 'status-info',
  cancelled: 'status-closed',
};
const HEARING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Προγραμματισμένο',
  completed: 'Ολοκληρώθηκε',
  postponed: 'Αναβλήθηκε',
  cancelled: 'Ακυρώθηκε',
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const perms = usePermissions();
  const ws = useWebSocketContext(); // WebSocket context για real-time updates

  const [c, setCase] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [hearings, setHearings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [newNote, setNewNote] = useState('');
  const [isSynced, setIsSynced] = useState(false); // Δείχνει αν τα δεδομένα είναι συγχρονισμένα

  // Hearing form
  const [showHearingForm, setShowHearingForm] = useState(false);
  const [hearingForm, setHearingForm] = useState({
    court: '', hearing_date: '', judge: '', notes: '', status: 'scheduled',
  });

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '', payment_method: 'bank_transfer',
    payment_date: new Date().toISOString().slice(0, 10),
    reference: '', notes: '',
  });

  const load = () => {
    if (!id) return;
    Promise.all([
      casesApi.get(id),
      casesApi.getNotes(id).catch(() => ({ data: [] })),
      casesApi.getDocuments(id).catch(() => ({ data: [] })),
      casesApi.getFinancials(id).catch(() => ({ data: [] })),
      casesApi.getParties(id).catch(() => ({ data: [] })),
      casesApi.getChecklist(id).catch(() => ({ data: [] })),
      hearingsApi.forCase(id).catch(() => ({ data: [] })),
      paymentsApi.forCase(id).catch(() => ({ data: [] })),
      casesApi.getInvoices(id).catch(() => ({ data: [] })),
    ]).then(([cs, n, d, f, p, ch, hr, pay, inv]) => {
      setCase(cs.data);
      setNotes(Array.isArray(n.data) ? n.data : []);
      setDocs(Array.isArray(d.data) ? d.data : []);
      setFinancials(Array.isArray(f.data) ? f.data : (f.data?.entries ?? []));
      setParties(Array.isArray(p.data) ? p.data : []);
      setChecklist(Array.isArray(ch.data) ? ch.data : ch.data?.items || []);
      setHearings(Array.isArray(hr.data) ? hr.data : []);
      setPayments(Array.isArray(pay.data) ? pay.data : []);
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // ========== WebSocket Real-time Updates ==========
  useEffect(() => {
    if (!id || !ws.isConnected) return;

    // Κάνε join στο room για αυτή την υπόθεση
    ws.joinRoom(id);

    // Ακούγε για ενημερώσεις της υπόθεσης
    const unsubCase = ws.on('case.updated', (event) => {
      if (event.case_id === id) {
        setCase(prev => ({ ...prev, ...event.data }));
        setIsSynced(true);
        setTimeout(() => setIsSynced(false), 2000); // Δείχνει ένδειξη 2 δευτ.
      }
    });

    // Ακούγε για νέες σημειώσεις
    const unsubNote = ws.on('note.created', (event) => {
      if (event.case_id === id) {
        setNotes(prev => [event.data, ...prev]);
      }
    });

    // Ακούγε για νέα έγγραφα
    const unsubDoc = ws.on('document.uploaded', (event) => {
      if (event.case_id === id) {
        setDocs(prev => [event.data, ...prev]);
      }
    });

    // Ακούγε για νέα ακροαματήρια
    const unsubHearing = ws.on('hearing.created', (event) => {
      if (event.case_id === id) {
        setHearings(prev => [event.data, ...prev]);
      }
    });

    return () => {
      // Αποσύνδεση όταν φεύγουμε από τη σελίδα
      ws.leaveRoom(id);
      unsubCase();
      unsubNote();
      unsubDoc();
      unsubHearing();
    };
  }, [id, ws.isConnected, ws]);

  const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;

  const addNote = async () => {
    if (!newNote.trim() || !id) return;
    try {
      await casesApi.addNote(id, { content: newNote });
      setNewNote('');
      const r = await casesApi.getNotes(id);
      setNotes(r.data);
      toast.success('Σημείωση προστέθηκε');
    } catch { toast.error('Σφάλμα'); }
  };

  const toggleCheck = async (idx: number, done: boolean) => {
    if (!id) return;
    try {
      await casesApi.checkItem(id, idx, !done);
      const r = await casesApi.getChecklist(id);
      setChecklist(Array.isArray(r.data) ? r.data : r.data?.items || []);
    } catch { toast.error('Σφάλμα'); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await casesApi.uploadDocument(id, file);
      toast.success('Έγγραφο ανέβηκε');
      const r = await casesApi.getDocuments(id);
      setDocs(r.data);
    } catch { toast.error('Σφάλμα upload'); }
  };

  const addHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await hearingsApi.create({
        ...hearingForm,
        case_id: id,
        hearing_date: new Date(hearingForm.hearing_date).toISOString(),
      });
      toast.success('Ακροαματήριο προστέθηκε');
      setShowHearingForm(false);
      setHearingForm({ court: '', hearing_date: '', judge: '', notes: '', status: 'scheduled' });
      const r = await hearingsApi.forCase(id);
      setHearings(Array.isArray(r.data) ? r.data : []);
    } catch { toast.error('Σφάλμα'); }
  };

  const deleteHearing = async (hearingId: string) => {
    try {
      await hearingsApi.delete(hearingId);
      toast.success('Διαγράφηκε');
      const r = await hearingsApi.forCase(id!);
      setHearings(Array.isArray(r.data) ? r.data : []);
    } catch { toast.error('Σφάλμα'); }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await paymentsApi.create({
        ...paymentForm,
        case_id: id,
        client_name: c?.client_name || '',
        amount: Number(paymentForm.amount),
        payment_date: new Date(paymentForm.payment_date).toISOString(),
        status: 'paid',
      });
      toast.success('Πληρωμή καταγράφηκε');
      setShowPaymentForm(false);
      setPaymentForm({ amount: '', payment_method: 'bank_transfer', payment_date: new Date().toISOString().slice(0, 10), reference: '', notes: '' });
      const r = await paymentsApi.forCase(id);
      setPayments(Array.isArray(r.data) ? r.data : []);
    } catch { toast.error('Σφάλμα'); }
  };

  const downloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const res = await exportApi.invoicePdf(invoiceId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `invoice_${invoiceNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF ληφθηκε');
    } catch { toast.error('Σφάλμα δημιουργίας PDF'); }
  };

  const sendInvoiceEmail = async (invoice: any) => {
    const clientEmail = c?.email;
    if (!clientEmail) { toast.error('Δεν υπάρχει email πελάτη'); return; }
    try {
      await emailApi.send({
        to_email: clientEmail,
        to_name: c?.client_name,
        subject: `Τιμολόγιο #${invoice.invoice_number || invoice._id?.slice(-6)} — ${c?.title || ''}`,
        body_html: `<p>Αγαπητέ/ή ${c?.client_name},</p><p>Σας αποστέλλουμε το τιμολόγιο #${invoice.invoice_number || invoice._id?.slice(-6)} ύψους <strong>${fmt(invoice.total || invoice.amount)}</strong>.</p><p>Σκοτάνης & Συνεργάτες</p>`,
        invoice_id: invoice._id || invoice.id,
      });
      toast.success(`Email στάλθηκε σε ${clientEmail}`);
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής'); }
  };

  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total || i.amount || 0), 0);
  const totalExpenses = financials.filter((f: any) => f.type === 'expense').reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
  const balance = totalInvoiced - totalPaid;

  const tabs = [
    { id: 'overview' as DetailTab, label: 'Επισκόπηση' },
    { id: 'hearings' as DetailTab, label: 'Ακροαματήρια', count: hearings.length },
    { id: 'payments' as DetailTab, label: 'Πληρωμές', count: payments.length },
    { id: 'documents' as DetailTab, label: 'Έγγραφα', count: docs.length },
    { id: 'notes' as DetailTab, label: 'Σημειώσεις', count: notes.length },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;
  if (!c) return <div className="text-center py-20 text-[#5a7a9a]">Η υπόθεση δεν βρέθηκε.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/cases')} className="flex items-center gap-2 text-sm text-[#7a9ab8] hover:text-[#C6A75E] transition-colors">
          <ArrowLeft size={16} /> Υποθέσεις
        </button>
      </div>

      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-xs text-[#C6A75E] bg-[#C6A75E]/10 px-2 py-0.5 rounded">{c.case_number}</span>
              <span className="status-active">{c.status}</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">{c.category || c.legal_category}</span>
            </div>
            <h2 className="page-title mb-1">{c.title}</h2>
            {c.summary && <p className="text-sm text-[#7a9ab8]">{c.summary}</p>}
          </div>
          <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} size="sm" />
        </div>
      </div>

      {/* Financial summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-[3px] border-blue-500/30">
          <Users size={15} className="text-blue-400 mb-2" />
          <p className="text-sm font-semibold text-[#d4dce8] truncate">{c.client_name || '—'}</p>
          <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Πελάτης</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-[#C6A75E]/30">
          <TrendingUp size={15} className="text-[#C6A75E] mb-2" />
          <p className="text-sm font-bold text-[#C6A75E]">{fmt(totalInvoiced)}</p>
          <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Τιμολογηθέντα</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-emerald-500/30">
          <CreditCard size={15} className="text-emerald-400 mb-2" />
          <p className="text-sm font-bold text-emerald-400">{fmt(totalPaid)}</p>
          <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Εισπράχθηκαν</p>
        </div>
        <div className={`glass-card p-4 border-l-[3px] ${balance > 0 ? 'border-amber-500/30' : 'border-emerald-500/30'}`}>
          <DollarSign size={15} className={`mb-2 ${balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
          <p className={`text-sm font-bold ${balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{fmt(balance)}</p>
          <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider">Υπόλοιπο</p>
        </div>
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Checklist */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2"><CheckSquare size={14} className="text-[#C6A75E]" /> Checklist</h3>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {checklist.map((item: any, idx: number) => (
                <button key={idx} onClick={() => toggleCheck(idx, item.done)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                    item.done ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#0d2035]/40 border-[#1a3a5c]/20 hover:border-[#C6A75E]/20'
                  }`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    item.done ? 'border-emerald-400 bg-emerald-400/20' : 'border-[#5a7a9a]'
                  }`}>{item.done && <span className="text-emerald-400 text-xs">✓</span>}</div>
                  <span className={`text-sm ${item.done ? 'text-[#5a7a9a] line-through' : 'text-[#d4dce8]'}`}>
                    {item.label || item.text || item}
                  </span>
                </button>
              ))}
              {checklist.length === 0 && <p className="text-sm text-[#5a7a9a]">Κανένα item checklist.</p>}
            </div>
          </div>

          {/* Parties + Invoices */}
          <div className="space-y-5">
            {parties.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="section-title mb-3">Διάδικοι</h3>
                <div className="space-y-2">
                  {parties.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                      <p className="text-sm text-[#d4dce8] font-medium">{p.name}</p>
                      <span className="text-xs text-[#5a7a9a]">{p.role || p.type || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invoices quick view */}
            {invoices.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="section-title mb-3 flex items-center gap-2"><FileText size={14} /> Τιμολόγια ({invoices.length})</h3>
                <div className="space-y-2">
                  {invoices.slice(0, 3).map((inv: any) => (
                    <div key={inv._id || inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                      <div>
                        <p className="text-xs font-mono text-[#C6A75E]">#{inv.invoice_number || inv._id?.slice(-6)}</p>
                        <p className="text-xs text-[#5a7a9a]">{inv.created_at ? new Date(inv.created_at).toLocaleDateString('el-GR') : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-[#C6A75E]">{fmt(Number(inv.total || inv.amount || 0))}</span>
                        <button onClick={() => downloadPDF(inv._id || inv.id, inv.invoice_number || inv._id?.slice(-6))}
                          title="PDF" className="p-1 rounded hover:bg-[#132B45] text-[#5a7a9a] hover:text-[#C6A75E]">
                          <Download size={12} />
                        </button>
                        <button onClick={() => sendInvoiceEmail(inv)}
                          title="Email" className="p-1 rounded hover:bg-blue-500/10 text-[#5a7a9a] hover:text-blue-400">
                          <Mail size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Hearings ── */}
      {activeTab === 'hearings' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowHearingForm(true)} className="btn-gold text-xs flex items-center gap-1.5">
              <Plus size={13} /> Νέο Ακροαματήριο
            </button>
          </div>

          {hearings.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <Gavel size={36} className="mx-auto text-[#2a4a6a] mb-3" />
              <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν ακροαματήρια.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hearings.map((h: any) => (
                <div key={h._id || h.id} className="glass-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={HEARING_STATUS_COLORS[h.status] || 'status-pending'}>
                          {HEARING_STATUS_LABELS[h.status] || h.status}
                        </span>
                        <span className="text-xs font-mono text-[#C6A75E]">
                          {h.hearing_date ? new Date(h.hearing_date).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#d4dce8]">{h.court}</p>
                      {h.judge && <p className="text-xs text-[#5a7a9a] mt-0.5">Δικαστής: {h.judge}</p>}
                      {h.notes && <p className="text-xs text-[#7a9ab8] mt-2 bg-[#0d2035]/40 rounded-lg p-2">{h.notes}</p>}
                      {h.outcome && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          <p className="text-xs text-emerald-400"><strong>Αποτέλεσμα:</strong> {h.outcome}</p>
                        </div>
                      )}
                      {h.next_hearing && (
                        <p className="text-xs text-amber-400 mt-2">
                          Επόμενο: {new Date(h.next_hearing).toLocaleDateString('el-GR')}
                        </p>
                      )}
                    </div>
                    {perms.isAdmin && (
                      <button onClick={() => deleteHearing(h._id || h.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#5a7a9a] hover:text-red-400 flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Hearing Modal */}
          {showHearingForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowHearingForm(false)}>
              <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Νέο Ακροαματήριο</h3>
                  <button onClick={() => setShowHearingForm(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
                </div>
                <form onSubmit={addHearing} className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Δικαστήριο</label><input value={hearingForm.court} onChange={e => setHearingForm({ ...hearingForm, court: e.target.value })} className="input-dark" required placeholder="Πρωτοδικείο Αθηνών" /></div>
                    <div><label className="label">Ημερομηνία</label><input type="datetime-local" value={hearingForm.hearing_date} onChange={e => setHearingForm({ ...hearingForm, hearing_date: e.target.value })} className="input-dark" required /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Δικαστής</label><input value={hearingForm.judge} onChange={e => setHearingForm({ ...hearingForm, judge: e.target.value })} className="input-dark" placeholder="Προαιρετικό" /></div>
                    <div>
                      <label className="label">Κατάσταση</label>
                      <select value={hearingForm.status} onChange={e => setHearingForm({ ...hearingForm, status: e.target.value })} className="input-dark">
                        <option value="scheduled">Προγραμματισμένο</option>
                        <option value="completed">Ολοκληρώθηκε</option>
                        <option value="postponed">Αναβλήθηκε</option>
                        <option value="cancelled">Ακυρώθηκε</option>
                      </select>
                    </div>
                  </div>
                  <div><label className="label">Σημειώσεις</label><textarea value={hearingForm.notes} onChange={e => setHearingForm({ ...hearingForm, notes: e.target.value })} className="input-dark h-20 resize-none" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="btn-gold flex-1">Αποθήκευση</button>
                    <button type="button" onClick={() => setShowHearingForm(false)} className="btn-dark flex-1">Ακύρωση</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Payments ── */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <div className="glass-card px-4 py-2.5 border-l-2 border-emerald-500/40">
                <p className="text-xs text-[#5a7a9a]">Εισπράχθηκαν</p>
                <p className="text-lg font-bold text-emerald-400">{fmt(totalPaid)}</p>
              </div>
              <div className="glass-card px-4 py-2.5 border-l-2 border-amber-500/40">
                <p className="text-xs text-[#5a7a9a]">Υπόλοιπο</p>
                <p className="text-lg font-bold text-amber-400">{fmt(balance)}</p>
              </div>
            </div>
            <button onClick={() => setShowPaymentForm(true)} className="btn-gold text-xs flex items-center gap-1.5">
              <Plus size={13} /> Νέα Πληρωμή
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <CreditCard size={36} className="mx-auto text-[#2a4a6a] mb-3" />
              <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν πληρωμές για αυτή την υπόθεση.</p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <table className="w-full table-premium">
                <thead>
                  <tr className="bg-[#0d2035]/40">
                    <th>Ημερομηνία</th>
                    <th>Τρόπος</th>
                    <th className="hidden sm:table-cell">Παραπομπή</th>
                    <th className="hidden md:table-cell">Σημειώσεις</th>
                    <th>Ποσό</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p._id || p.id}>
                      <td className="text-xs">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('el-GR') : '—'}</td>
                      <td className="text-xs capitalize">{p.payment_method?.replace('_', ' ') || '—'}</td>
                      <td className="hidden sm:table-cell text-xs font-mono text-[#5a7a9a]">{p.reference || '—'}</td>
                      <td className="hidden md:table-cell text-xs text-[#7a9ab8]">{p.notes || '—'}</td>
                      <td className="font-mono font-bold text-emerald-400">{fmt(Number(p.amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Payment Modal */}
          {showPaymentForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowPaymentForm(false)}>
              <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Νέα Πληρωμή</h3>
                  <button onClick={() => setShowPaymentForm(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button>
                </div>
                <form onSubmit={addPayment} className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Ποσό (€)</label><input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-dark" required /></div>
                    <div><label className="label">Ημερομηνία</label><input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} className="input-dark" required /></div>
                  </div>
                  <div>
                    <label className="label">Τρόπος Πληρωμής</label>
                    <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} className="input-dark">
                      <option value="bank_transfer">Τραπεζική Μεταφορά</option>
                      <option value="cash">Μετρητά</option>
                      <option value="check">Επιταγή</option>
                      <option value="card">Κάρτα</option>
                    </select>
                  </div>
                  <div><label className="label">Αρ. Παραπομπής</label><input value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="TRN-..." className="input-dark" /></div>
                  <div><label className="label">Σημειώσεις</label><textarea value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="input-dark h-16 resize-none" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="btn-gold flex-1">Καταχώρηση</button>
                    <button type="button" onClick={() => setShowPaymentForm(false)} className="btn-dark flex-1">Ακύρωση</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Documents ── */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <label className="btn-gold text-xs flex items-center gap-1.5 cursor-pointer">
              <Upload size={13} /> Ανέβασμα
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          {docs.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <FileText size={36} className="mx-auto text-[#2a4a6a] mb-3" />
              <p className="text-sm text-[#5a7a9a]">Κανένα έγγραφο ακόμα.</p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <table className="w-full table-premium">
                <thead><tr className="bg-[#0d2035]/40"><th>Αρχείο</th><th className="hidden sm:table-cell">Ημερομηνία</th><th>Ενέργειες</th></tr></thead>
                <tbody>
                  {docs.map((d: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-[#C6A75E] flex-shrink-0" />
                          <span className="text-sm text-[#d4dce8] truncate max-w-[200px]">{d.filename || d.name}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell text-xs">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString('el-GR') : '—'}</td>
                      <td>
                        <button className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E]"><Download size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Notes ── */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Σημειώσεις ({notes.length})</h3>
            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {notes.map((n: any, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                  <p className="text-sm text-[#d4dce8]">{n.content}</p>
                  <p className="text-xs text-[#5a7a9a] mt-1.5">
                    {n.author_name && <span className="font-medium text-[#7a9ab8]">{n.author_name}</span>}
                    {n.author_name && ' — '}
                    {n.created_at ? new Date(n.created_at).toLocaleString('el-GR') : ''}
                  </p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν σημειώσεις ακόμα.</p>}
            </div>
            <div className="flex gap-2">
              <input value={newNote} onChange={e => setNewNote(e.target.value)}
                placeholder="Νέα σημείωση..."
                className="input-dark flex-1"
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()} />
              <button onClick={addNote} className="btn-gold text-xs">Προσθήκη</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
