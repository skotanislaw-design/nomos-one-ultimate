import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, User as UserIcon, Building2, Hash, Phone, Mail, MapPin,
  Briefcase, Gavel, Calendar, DollarSign, FileText, StickyNote,
  Clock, ChevronRight, TrendingUp, CreditCard, AlertCircle, Edit2, X,
} from 'lucide-react';
import api, { clientsApi } from '@/lib/api';
import { parseTs } from '@/lib/prefs';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

type Tab = 'overview' | 'cases' | 'hearings' | 'financials' | 'deadlines';

const STATUS_LABELS: Record<string, string> = {
  open: 'Ανοικτή', active: 'Ενεργή', in_progress: 'Σε Εξέλιξη',
  hearing: 'Ακροατήριο', appeal: 'Έφεση',
  closed_won: 'Κερδήθηκε', closed_lost: 'Απώλεια',
  closed_settled: 'Συμβιβασμός', archived: 'Αρχείο',
};
const STATUS_CSS: Record<string, string> = {
  open: 'status-active', active: 'status-active', in_progress: 'status-info',
  hearing: 'status-pending', appeal: 'status-urgent',
  closed_won: 'status-active', closed_lost: 'status-closed',
  closed_settled: 'status-closed', archived: 'status-closed',
};
const HEARING_LABELS: Record<string, string> = {
  scheduled: 'Προγραμματισμένο', completed: 'Ολοκληρώθηκε',
  postponed: 'Αναβλήθηκε', cancelled: 'Ακυρώθηκε',
};
const CLIENT_TYPE_LABELS: Record<string, string> = {
  individual: 'Ιδιώτης', professional: 'Επιτηδευματίας',
  company: 'Εταιρεία', public: 'Δημόσιο',
};

const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: any) => { const dt = d ? parseTs(d) : null; return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; };
const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const perms = usePermissions();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.get(`/api/clients/${id}/360`)
      .then(r => { setData(r.data); setEditForm(r.data.client); })
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await clientsApi.update(id!, editForm);
      toast.success('Αποθηκεύτηκε');
      setEditMode(false);
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );
  if (!data) return <div className="text-center py-20 text-[#5a7a9a]">Δεν βρέθηκε εντολέας.</div>;

  const { client, stats, cases, hearings, deadlines, case_financials, invoices } = data;
  const isCompany = client.client_type === 'company' || client.client_type === 'public';

  const tabs = [
    { id: 'overview' as Tab,    label: 'Επισκόπηση' },
    { id: 'cases' as Tab,       label: `Υποθέσεις (${cases.length})` },
    { id: 'hearings' as Tab,    label: `Ακροατήρια (${hearings.length})` },
    { id: 'financials' as Tab,  label: 'Οικονομικά' },
    { id: 'deadlines' as Tab,   label: `Προθεσμίες (${deadlines.length})` },
  ];

  const now = new Date().toISOString().slice(0, 10);
  const upcomingHearings  = hearings.filter((h: any) => String(h.hearing_date || '').slice(0, 10) >= now && !['completed','cancelled'].includes(h.status));
  const upcomingDeadlines = deadlines.filter((d: any) => String(d.date || '').slice(0, 10) >= now);
  const activeCases = cases.filter((c: any) => !String(c.status || '').startsWith('closed') && c.status !== 'archived');

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button onClick={() => nav('/clients')} className="flex items-center gap-2 text-sm text-[#7a9ab8] hover:text-[#C6A75E] transition-colors">
        <ArrowLeft size={16} /> Πελατολόγιο
      </button>

      {/* ── Header card ── */}
      <div className="glass-card p-6">
        {!editMode ? (
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C6A75E]/30 to-[#C6A75E]/10 border border-[#C6A75E]/20 flex items-center justify-center flex-shrink-0">
              {isCompany ? <Building2 size={28} className="text-[#C6A75E]" /> : <UserIcon size={28} className="text-[#C6A75E]" />}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-white">{client.full_name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  client.is_active !== false
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-[#5a7a9a] bg-[#132B45] border-[#1a3a5c]/40'
                }`}>{client.is_active !== false ? '● Ενεργός' : '● Ανενεργός'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-[#C6A75E]/30 text-[#C6A75E] bg-[#C6A75E]/10">
                  {CLIENT_TYPE_LABELS[client.client_type] || client.client_type}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-[#7a9ab8]">
                {client.afm    && <span className="flex items-center gap-1.5"><Hash size={13} className="text-[#5a7a9a]" />{client.afm}</span>}
                {client.phone  && <span className="flex items-center gap-1.5"><Phone size={13} className="text-[#5a7a9a]" />{client.phone}</span>}
                {client.email  && <span className="flex items-center gap-1.5"><Mail size={13} className="text-[#5a7a9a]" />{client.email}</span>}
                {client.address && <span className="flex items-center gap-1.5"><MapPin size={13} className="text-[#5a7a9a]" />{client.address}</span>}
              </div>
            </div>
            {perms.isAdmin && (
              <button onClick={() => setEditMode(true)}
                className="p-2.5 rounded-xl bg-[#132B45] hover:bg-[#1a3a5c] border border-[#1a3a5c]/60 text-[#7a9ab8] hover:text-[#C6A75E] transition-all flex-shrink-0">
                <Edit2 size={16} />
              </button>
            )}
          </div>
        ) : (
          /* ── Edit form inline ── */
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Επεξεργασία Στοιχείων</p>
              <button type="button" onClick={() => setEditMode(false)} className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8]"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Ονοματεπώνυμο / Επωνυμία</label>
                <input value={editForm.full_name || ''} onChange={e => setEditForm({...editForm, full_name: e.target.value})} className="input-dark" required /></div>
              <div><label className="label">ΑΦΜ</label><input value={editForm.afm || ''} onChange={e => setEditForm({...editForm, afm: e.target.value})} className="input-dark" /></div>
              <div><label className="label">Τηλέφωνο</label><input value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="input-dark" /></div>
              <div><label className="label">Email</label><input type="email" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} className="input-dark" /></div>
              <div><label className="label">Διεύθυνση</label><input value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} className="input-dark" /></div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-gold flex-1">Αποθήκευση</button>
              <button type="button" onClick={() => setEditMode(false)} className="btn-dark flex-1">Ακύρωση</button>
            </div>
          </form>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { icon: Briefcase,   label: 'Σύνολο Υποθέσεων', val: stats.cases_total,        color: 'text-blue-400',    border: 'border-blue-500/30' },
          { icon: Briefcase,   label: 'Ενεργές',           val: stats.cases_active,       color: 'text-emerald-400', border: 'border-emerald-500/30' },
          { icon: Gavel,       label: 'Επερχ. Ακροαμ.',   val: stats.hearings_upcoming,  color: 'text-[#C6A75E]',   border: 'border-[#C6A75E]/30' },
          { icon: Clock,       label: 'Επερχ. Προθεσμ.',  val: stats.deadlines_upcoming, color: 'text-amber-400',   border: 'border-amber-500/30' },
          { icon: FileText,    label: 'Έγγραφα',           val: stats.doc_count,          color: 'text-purple-400',  border: 'border-purple-500/30' },
          { icon: TrendingUp,  label: 'Τιμολογηθέντα',    val: fmt(stats.total_invoiced), color: 'text-[#C6A75E]',  border: 'border-[#C6A75E]/30' },
          { icon: CreditCard,  label: 'Υπόλοιπο',         val: fmt(stats.balance),       color: stats.balance > 0 ? 'text-amber-400' : 'text-emerald-400', border: stats.balance > 0 ? 'border-amber-500/30' : 'border-emerald-500/30' },
        ].map(({ icon: Icon, label, val, color, border }) => (
          <div key={label} className={`glass-card p-4 border-l-[3px] ${border}`}>
            <Icon size={14} className={`${color} mb-2`} />
            <p className={`text-sm font-bold ${color}`}>{val}</p>
            <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="overflow-x-auto">
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Ενεργές υποθέσεις */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Briefcase size={14} className="text-[#C6A75E]" /> Ενεργές Υποθέσεις
            </h3>
            {activeCases.length === 0
              ? <p className="text-sm text-[#4a6a8a]">Δεν υπάρχουν ενεργές υποθέσεις.</p>
              : <div className="space-y-2">
                {activeCases.map((c: any) => (
                  <button key={c.id || c._id} onClick={() => nav(`/cases/${c.id || c._id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20 hover:border-[#C6A75E]/30 transition-all text-left group">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#d4dce8] truncate group-hover:text-[#C6A75E] transition-colors">{c.offense || c.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {c.legal_category && <span className="text-[9px] text-[#5a7a9a] bg-[#0d2035] border border-[#1a3a5c]/30 px-1 py-0.5 rounded">{c.legal_category}</span>}
                        {c.law_articles   && <span className="text-[9px] font-mono text-[#C6A75E]/70">{c.law_articles}</span>}
                        {c.case_number    && <span className="text-[9px] font-mono text-[#5a7a9a]">{c.case_number}</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] shrink-0 ${STATUS_CSS[c.status] || 'status-pending'}`}>{STATUS_LABELS[c.status] || c.status}</span>
                    <ChevronRight size={13} className="text-[#3a5a7a] group-hover:text-[#C6A75E] transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            }
          </div>

          {/* Επερχόμενα Ακροατήρια */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Gavel size={14} className="text-[#C6A75E]" /> Επερχόμενα Ακροατήρια
            </h3>
            {upcomingHearings.length === 0
              ? <p className="text-sm text-[#4a6a8a]">Δεν υπάρχουν προγραμματισμένα ακροατήρια.</p>
              : <div className="space-y-2">
                {upcomingHearings.slice(0, 5).map((h: any) => (
                  <div key={h.id || h._id} className="p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#d4dce8] truncate">{h.case_label}</p>
                        <p className="text-[10px] text-[#5a7a9a] mt-0.5">{h.court || '—'}{h.judge ? ` · ${h.judge}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-[#C6A75E]">{fmtDate(h.hearing_date)}</p>
                        <p className="text-[9px] text-[#5a7a9a]">{HEARING_LABELS[h.status] || h.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>

          {/* Επερχόμενες Προθεσμίες */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Clock size={14} className="text-[#C6A75E]" /> Επερχόμενες Προθεσμίες
            </h3>
            {upcomingDeadlines.length === 0
              ? <p className="text-sm text-[#4a6a8a]">Δεν υπάρχουν επερχόμενες προθεσμίες.</p>
              : <div className="space-y-2">
                {upcomingDeadlines.slice(0, 5).map((d: any) => {
                  const daysLeft = Math.ceil((new Date(d.date).getTime() - Date.now()) / 86400000);
                  const urgent = daysLeft <= 7;
                  return (
                    <div key={d.id || d._id} className={`p-3 rounded-xl border ${urgent ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#0d2035]/50 border-[#1a3a5c]/20'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#d4dce8]">{d.title || d.deadline_type || 'Προθεσμία'}</p>
                          <p className="text-[9px] text-[#5a7a9a] mt-0.5 truncate">{d.case_label}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-mono ${urgent ? 'text-amber-400' : 'text-[#C6A75E]'}`}>{fmtDate(d.date)}</p>
                          {urgent && <p className="text-[9px] text-amber-400">{daysLeft}η μέρες</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>

          {/* Οικονομική Σύνοψη */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <DollarSign size={14} className="text-[#C6A75E]" /> Οικονομική Σύνοψη
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20">
                <span className="text-xs text-[#7a9ab8]">Σύνολο Τιμολογηθέντων</span>
                <span className="text-sm font-bold text-[#C6A75E]">{fmt(stats.total_invoiced)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20">
                <span className="text-xs text-[#7a9ab8]">Εισπράχθηκαν</span>
                <span className="text-sm font-bold text-emerald-400">{fmt(stats.total_paid)}</span>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-xl border ${stats.balance > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                <span className="text-xs text-[#7a9ab8] flex items-center gap-1">
                  {stats.balance > 0 && <AlertCircle size={11} className="text-amber-400" />}
                  Υπόλοιπο
                </span>
                <span className={`text-sm font-bold ${stats.balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{fmt(stats.balance)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ΥΠΟΘΕΣΕΙΣ ══════════ */}
      {activeTab === 'cases' && (
        <div className="glass-card overflow-hidden table-scroll">
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Αδίκημα / Υπόθεση</th>
                <th className="hidden sm:table-cell">Κατηγορία</th>
                <th className="hidden md:table-cell">Άρθρα ΠΚ</th>
                <th>Κατάσταση</th>
                <th className="hidden lg:table-cell">Δικηγόρος</th>
                <th className="hidden lg:table-cell">Ημ/νία</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c: any) => (
                <tr key={c.id || c._id}>
                  <td>
                    <p className="text-xs font-semibold text-[#d4dce8] truncate max-w-[200px]" title={c.offense || c.title}>{c.offense || c.title}</p>
                    <p className="text-[10px] font-mono text-[#C6A75E]">{c.case_number}</p>
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">{c.legal_category || '—'}</span>
                  </td>
                  <td className="hidden md:table-cell">
                    {c.law_articles
                      ? <span className="text-[10px] font-mono text-[#C6A75E] bg-[#0d2035] border border-[#C6A75E]/20 px-1.5 py-0.5 rounded">{c.law_articles}</span>
                      : <span className="text-[10px] text-[#3a5a7a]">—</span>}
                  </td>
                  <td><span className={`${STATUS_CSS[c.status] || 'status-pending'}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                  <td className="hidden lg:table-cell text-xs text-[#7a9ab8]">{c.assigned_lawyer_name || '—'}</td>
                  <td className="hidden lg:table-cell text-[10px] text-[#5a7a9a]">
                    {c.created_at ? (parseTs(c.created_at)?.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) ?? '—') : '—'}
                  </td>
                  <td>
                    <button onClick={() => nav(`/cases/${c.id || c._id}`)}
                      className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν υποθέσεις.</div>}
        </div>
      )}

      {/* ══════════ ΑΚΡΟΑΜΑΤΗΡΙΑ ══════════ */}
      {activeTab === 'hearings' && (
        <div className="glass-card overflow-hidden table-scroll">
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Υπόθεση</th>
                <th>Ημερομηνία</th>
                <th className="hidden sm:table-cell">Δικαστήριο</th>
                <th className="hidden md:table-cell">Δικαστής</th>
                <th>Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {[...hearings].sort((a: any, b: any) => {
                const da = String(a.hearing_date || ''); const db2 = String(b.hearing_date || '');
                return da < db2 ? 1 : -1;
              }).map((h: any) => {
                const isPast = String(h.hearing_date || '').slice(0, 10) < now;
                return (
                  <tr key={h.id || h._id} className={isPast ? 'opacity-60' : ''}>
                    <td><p className="text-xs font-medium text-[#d4dce8] truncate max-w-[180px]">{h.case_label}</p></td>
                    <td>
                      <p className={`text-xs font-mono ${isPast ? 'text-[#5a7a9a]' : 'text-[#C6A75E]'}`}>{fmtDate(h.hearing_date)}</p>
                    </td>
                    <td className="hidden sm:table-cell text-xs text-[#7a9ab8]">{h.court || '—'}</td>
                    <td className="hidden md:table-cell text-xs text-[#7a9ab8]">{h.judge || '—'}</td>
                    <td><span className="text-[10px] px-2 py-0.5 rounded bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">
                      {HEARING_LABELS[h.status] || h.status || '—'}
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hearings.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν ακροατήρια.</div>}
        </div>
      )}

      {/* ══════════ ΟΙΚΟΝΟΜΙΚΑ ══════════ */}
      {activeTab === 'financials' && (
        <div className="space-y-5">
          {/* Σύνολο */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Τιμολογηθέντα', val: fmt(stats.total_invoiced), color: 'text-[#C6A75E]', border: 'border-[#C6A75E]/30' },
              { label: 'Εισπράχθηκαν',  val: fmt(stats.total_paid),    color: 'text-emerald-400', border: 'border-emerald-500/30' },
              { label: 'Υπόλοιπο',      val: fmt(stats.balance),        color: stats.balance > 0 ? 'text-amber-400' : 'text-emerald-400', border: stats.balance > 0 ? 'border-amber-500/30' : 'border-emerald-500/30' },
            ].map(({ label, val, color, border }) => (
              <div key={label} className={`glass-card p-5 border-l-[3px] ${border} text-center`}>
                <p className={`text-xl font-bold ${color}`}>{val}</p>
                <p className="text-[10px] text-[#5a7a9a] uppercase tracking-wider mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Ανά υπόθεση */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Ανάλυση ανά Υπόθεση</h3>
            {cases.length === 0
              ? <p className="text-sm text-[#4a6a8a]">Δεν υπάρχουν υποθέσεις.</p>
              : <div className="space-y-2">
                {cases.map((c: any) => {
                  const fin = case_financials[c.id || c._id] || { invoiced: 0, paid: 0 };
                  const bal = fin.invoiced - fin.paid;
                  return (
                    <div key={c.id || c._id} className="flex items-center gap-4 p-3 rounded-xl bg-[#0d2035]/50 border border-[#1a3a5c]/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#d4dce8] truncate">{c.offense || c.title}</p>
                        <p className="text-[10px] font-mono text-[#5a7a9a]">{c.case_number}</p>
                      </div>
                      <div className="flex gap-4 shrink-0 text-right">
                        <div>
                          <p className="text-xs font-mono text-[#C6A75E]">{fmt(fin.invoiced)}</p>
                          <p className="text-[9px] text-[#5a7a9a]">Τιμολόγια</p>
                        </div>
                        <div>
                          <p className="text-xs font-mono text-emerald-400">{fmt(fin.paid)}</p>
                          <p className="text-[9px] text-[#5a7a9a]">Πληρωθέντα</p>
                        </div>
                        <div>
                          <p className={`text-xs font-mono ${bal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{fmt(bal)}</p>
                          <p className="text-[9px] text-[#5a7a9a]">Υπόλοιπο</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        </div>
      )}

      {/* ══════════ ΠΡΟΘΕΣΜΙΕΣ ══════════ */}
      {activeTab === 'deadlines' && (
        <div className="glass-card overflow-hidden table-scroll">
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Τίτλος</th>
                <th>Υπόθεση</th>
                <th>Ημερομηνία</th>
                <th className="hidden sm:table-cell">Τύπος</th>
              </tr>
            </thead>
            <tbody>
              {[...deadlines].sort((a: any, b: any) => String(a.date || '') < String(b.date || '') ? -1 : 1).map((d: any) => {
                const isPast = String(d.date || '').slice(0, 10) < now;
                const daysLeft = Math.ceil((new Date(d.date).getTime() - Date.now()) / 86400000);
                const urgent = !isPast && daysLeft <= 7;
                return (
                  <tr key={d.id || d._id} className={isPast ? 'opacity-50' : ''}>
                    <td>
                      <div className="flex items-center gap-2">
                        {urgent && <AlertCircle size={12} className="text-amber-400 flex-shrink-0" />}
                        <p className="text-xs font-medium text-[#d4dce8]">{d.title || d.deadline_type || 'Προθεσμία'}</p>
                      </div>
                    </td>
                    <td><p className="text-xs text-[#7a9ab8] truncate max-w-[160px]">{d.case_label}</p></td>
                    <td>
                      <p className={`text-xs font-mono ${urgent ? 'text-amber-400' : isPast ? 'text-[#5a7a9a]' : 'text-[#C6A75E]'}`}>
                        {fmtDate(d.date)}
                      </p>
                      {urgent && <p className="text-[9px] text-amber-400">{daysLeft}η μέρες</p>}
                    </td>
                    <td className="hidden sm:table-cell text-[10px] text-[#5a7a9a]">{d.deadline_type || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {deadlines.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν καταχωρημένες προθεσμίες.</div>}
        </div>
      )}
    </div>
  );
}
