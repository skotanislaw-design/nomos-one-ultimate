import { useEffect, useState, useCallback } from 'react';
import {
  Scale, ArrowLeft, Plus, Trash2, FileDown, Download,
  CheckCircle2, XCircle, Sparkles, RotateCw, Edit3, Upload,
  AlertTriangle, Clock, User, FileText, Gavel, Shield,
  ClipboardList, Activity, ChevronDown, ChevronUp,
} from 'lucide-react';
import { criminalApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPathId(): string {
  return window.location.pathname.split('/criminal/')[1] ?? '';
}

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', review: 'Αξιολόγηση', active: 'Ενεργή',
  awaiting_documents: 'Αναμονή Εγγράφων', court_preparation: 'Προετοιμασία Δίκης',
  closed: 'Κλειστή',
};

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    active: 'status-active', court_preparation: 'status-urgent',
    intake: 'status-info', review: 'status-pending',
    awaiting_documents: 'status-pending', closed: 'status-closed',
  };
  return <span className={`status-badge ${cls[status] ?? 'status-info'}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function HealthBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cfg: Record<string, { cls: string; label: string }> = {
    green: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Καλή Υγεία' },
    yellow: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Προσοχή' },
    red: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Κρίσιμη' },
  };
  const c = cfg[level] ?? cfg.green;
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] border font-medium ${c.cls}`}>{c.label}</span>;
}

function OutputStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
    revised: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  const labels: Record<string, string> = {
    draft: 'Draft', approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε', revised: 'Αναθεωρήθηκε',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] border font-medium ${cls[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{labels[status] ?? status}</span>;
}

// ── Reusable section wrapper ──────────────────────────────────────────────────

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1a3a5c]/40 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#5a7a9a]">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

// --- Overview Tab ---
function OverviewTab({ caseData, health, onUpdate }: { caseData: any; health: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...caseData });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await criminalApi.update(caseData.id, form);
      toast.success('Αποθηκεύτηκε');
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally { setSaving(false); }
  };

  const fields = [
    { key: 'case_title', label: 'Τίτλος' }, { key: 'client_name', label: 'Πελάτης' },
    { key: 'client_email', label: 'Email' }, { key: 'client_phone', label: 'Τηλέφωνο' },
    { key: 'matter_type', label: 'Κατηγορία' }, { key: 'opposing_party', label: 'Αντίδικος' },
    { key: 'court', label: 'Δικαστήριο' }, { key: 'hearing_date', label: 'Δικάσιμος' },
  ];

  if (editing) {
    return (
      <SectionCard title="Επεξεργασία Υπόθεσης" action={
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-gold text-xs px-3 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
          <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 text-[#8aaac8] hover:text-[#d4dce8]">Άκυρο</button>
        </div>
      }>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">{f.label}</label>
              {f.key === 'hearing_date'
                ? <input type="date" className="input-dark w-full" value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                : <input className="input-dark w-full" value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              }
            </div>
          ))}
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Επείγον</label>
            <select className="input-dark w-full" value={form.urgency_level || 'medium'} onChange={e => set('urgency_level', e.target.value)}>
              <option value="low">Χαμηλή</option><option value="medium">Μέτρια</option>
              <option value="high">Υψηλή</option><option value="critical">Κρίσιμη</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Κατάσταση</label>
            <select className="input-dark w-full" value={form.status || 'intake'} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Σύντομη Περιγραφή</label>
            <textarea className="input-dark w-full" rows={3} value={form.short_description || ''} onChange={e => set('short_description', e.target.value)} />
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Στοιχεία Υπόθεσης" action={
        <button onClick={() => setEditing(true)} className="text-xs text-[#C6A75E] hover:text-[#E8C97A] flex items-center gap-1">
          <Edit3 size={12} /> Επεξεργασία
        </button>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a] mb-1">{f.label}</p>
              <p className="text-sm text-[#d4dce8]">{caseData[f.key] || '—'}</p>
            </div>
          ))}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a] mb-1">Επείγον</p>
            <p className="text-sm text-[#d4dce8]">{caseData.urgency_level || '—'}</p>
          </div>
        </div>
        {caseData.short_description && (
          <div className="mt-4 pt-4 border-t border-[#1a3a5c]/30">
            <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a] mb-2">Σύντομη Περιγραφή</p>
            <p className="text-sm text-[#b0c4d8] leading-relaxed">{caseData.short_description}</p>
          </div>
        )}
      </SectionCard>

      {health && (
        <SectionCard title="Υγεία Υπόθεσης">
          <div className="flex items-center gap-4 flex-wrap">
            <HealthBadge level={health.level} />
            {health.hearing_days_left !== null && health.hearing_days_left !== undefined && (
              <span className="text-sm text-[#8aaac8]">
                Δικάσιμος σε <strong className="text-[#d4dce8]">{health.hearing_days_left}</strong> ημέρες
              </span>
            )}
          </div>
          {health.reasons?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {health.reasons.map((r: string, i: number) => (
                <li key={i} className="text-sm text-[#8aaac8] flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span> {r}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// --- Timeline Tab ---
function TimelineTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ event_date: '', event_time: '', event_description: '', source: '', confidence_level: 'alleged', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => criminalApi.listEvents(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.event_date || !form.event_description.trim()) { toast.error('Συμπληρώστε ημερομηνία και περιγραφή'); return; }
    setSaving(true);
    try {
      await criminalApi.createEvent(caseId, form);
      toast.success('Γεγονός προστέθηκε');
      setShowForm(false);
      setForm({ event_date: '', event_time: '', event_description: '', source: '', confidence_level: 'alleged', notes: '' });
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή γεγονότος;')) return;
    try { await criminalApi.deleteEvent(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const confidenceLabel: Record<string, string> = { confirmed: 'Επιβεβαιωμένο', alleged: 'Αμφισβητούμενο', unclear: 'Ασαφές' };
  const confidenceCls: Record<string, string> = {
    confirmed: 'text-emerald-400', alleged: 'text-amber-400', unclear: 'text-slate-400',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Χρονολόγιο Γεγονότων" action={
        <button onClick={() => setShowForm(v => !v)} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={13} /> Νέο Γεγονός
        </button>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-5 p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/40 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ημερομηνία *</label>
                <input type="date" className="input-dark w-full" value={form.event_date} onChange={e => set('event_date', e.target.value)} required />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ώρα</label>
                <input type="time" className="input-dark w-full" value={form.event_time} onChange={e => set('event_time', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Περιγραφή *</label>
              <textarea className="input-dark w-full" rows={2} value={form.event_description} onChange={e => set('event_description', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Πηγή</label>
                <input className="input-dark w-full" value={form.source} onChange={e => set('source', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Αξιοπιστία</label>
                <select className="input-dark w-full" value={form.confidence_level} onChange={e => set('confidence_level', e.target.value)}>
                  <option value="confirmed">Επιβεβαιωμένο</option>
                  <option value="alleged">Αμφισβητούμενο</option>
                  <option value="unclear">Ασαφές</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-gold text-xs px-4 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#8aaac8] hover:text-[#d4dce8]">Ακύρωση</button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν γεγονότα.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[#1a3a5c]/60" />
            <div className="space-y-4">
              {items.map(ev => (
                <div key={ev.id} className="flex gap-4 group">
                  <div className="w-4 h-4 rounded-full border-2 border-[#C6A75E]/40 bg-[#071220] flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0 p-3 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono text-[#C6A75E]">{ev.event_date}{ev.event_time ? ` ${ev.event_time}` : ''}</span>
                        {ev.confidence_level && (
                          <span className={`ml-2 text-[10px] ${confidenceCls[ev.confidence_level]}`}>
                            [{confidenceLabel[ev.confidence_level] ?? ev.confidence_level}]
                          </span>
                        )}
                      </div>
                      <button onClick={() => del(ev.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="text-sm text-[#d4dce8] mt-1">{ev.event_description}</p>
                    {ev.source && <p className="text-xs text-[#5a7a9a] mt-1">Πηγή: {ev.source}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Parties Tab ---
function PartiesTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'other', contact_details: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => criminalApi.listParties(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Συμπληρώστε όνομα'); return; }
    setSaving(true);
    try {
      await criminalApi.createParty(caseId, form);
      toast.success('Εμπλεκόμενος προστέθηκε');
      setShowForm(false);
      setForm({ name: '', role: 'other', contact_details: '', notes: '' });
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή;')) return;
    try { await criminalApi.deleteParty(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const roleLabels: Record<string, string> = {
    client: 'Πελάτης', opposing: 'Αντίδικος', witness: 'Μάρτυρας',
    police_officer: 'Αστυνομικός', expert: 'Πραγματογνώμονας',
    victim: 'Θύμα', other: 'Άλλο',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Εμπλεκόμενοι" action={
        <button onClick={() => setShowForm(v => !v)} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={13} /> Προσθήκη
        </button>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-5 p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/40 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Όνομα *</label>
                <input className="input-dark w-full" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ρόλος</label>
                <select className="input-dark w-full" value={form.role} onChange={e => set('role', e.target.value)}>
                  {Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Στοιχεία Επικοινωνίας</label>
              <input className="input-dark w-full" value={form.contact_details} onChange={e => set('contact_details', e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Σημειώσεις</label>
              <textarea className="input-dark w-full" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-gold text-xs px-4 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#8aaac8] hover:text-[#d4dce8]">Ακύρωση</button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν εμπλεκόμενοι.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map(p => (
              <div key={p.id} className="p-3 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30 group">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#d4dce8]">{p.name}</p>
                    <p className="text-xs text-[#C6A75E] mt-0.5">{roleLabels[p.role] ?? p.role}</p>
                    {p.contact_details && <p className="text-xs text-[#5a7a9a] mt-1">{p.contact_details}</p>}
                    {p.notes && <p className="text-xs text-[#4a6a8a] mt-1 italic">{p.notes}</p>}
                  </div>
                  <button onClick={() => del(p.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Documents Tab ---
function DocumentsTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(() => criminalApi.listDocuments(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await criminalApi.uploadDocument(caseId, fd);
      toast.success('Έγγραφο ανέβηκε');
      load();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα'); } finally { setUploading(false); e.target.value = ''; }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή εγγράφου;')) return;
    try { await criminalApi.deleteDocument(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const importanceColors: Record<string, string> = {
    low: 'text-slate-400', medium: 'text-blue-400', high: 'text-amber-400', critical: 'text-red-400',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Έγγραφα" action={
        <label className={`btn-gold text-xs px-3 py-1.5 flex items-center gap-1 cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <Upload size={13} /> {uploading ? 'Ανέβασμα...' : 'Ανέβασμα'}
          <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleUpload} />
        </label>
      }>
        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν έγγραφα.</p>
        ) : (
          <div className="space-y-2">
            {items.map(d => (
              <div key={d.id} className="p-3 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <FileText size={14} className="text-[#C6A75E] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#d4dce8] truncate">{d.file_name}</p>
                      <p className="text-xs text-[#5a7a9a]">
                        {d.category} · <span className={importanceColors[d.importance_level] ?? 'text-slate-400'}>{d.importance_level}</span>
                        {d.size_bytes ? ` · ${(d.size_bytes / 1024).toFixed(1)}KB` : ''}
                      </p>
                      {d.summary && (
                        <>
                          <button onClick={() => setExpanded(p => ({ ...p, [d.id]: !p[d.id] }))}
                            className="text-[10px] text-[#C6A75E] hover:text-[#E8C97A] mt-1 flex items-center gap-0.5">
                            {expanded[d.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            AI Περίληψη
                          </button>
                          {expanded[d.id] && (
                            <p className="text-xs text-[#8aaac8] mt-1 leading-relaxed border-l-2 border-[#C6A75E]/20 pl-2">{d.summary}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => del(d.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Evidence Tab ---
function EvidenceTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', source: '', supports: 'neutral', reliability: 'unverified' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => criminalApi.listEvidence(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Συμπληρώστε τίτλο'); return; }
    setSaving(true);
    try {
      await criminalApi.createEvidence(caseId, form);
      toast.success('Αποδεικτικό στοιχείο προστέθηκε');
      setShowForm(false);
      setForm({ title: '', description: '', source: '', supports: 'neutral', reliability: 'unverified' });
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή;')) return;
    try { await criminalApi.deleteEvidence(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const supportsLabels: Record<string, string> = {
    supports_defense: 'Υπεράσπιση', supports_prosecution: 'Κατηγορία', neutral: 'Ουδέτερο', ambiguous: 'Αμφίβολο',
  };
  const supportsCls: Record<string, string> = {
    supports_defense: 'text-emerald-400', supports_prosecution: 'text-red-400',
    neutral: 'text-slate-400', ambiguous: 'text-amber-400',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Αποδείξεις" action={
        <button onClick={() => setShowForm(v => !v)} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={13} /> Προσθήκη
        </button>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-5 p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/40 space-y-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τίτλος *</label>
              <input className="input-dark w-full" value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Περιγραφή</label>
              <textarea className="input-dark w-full" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Πηγή</label>
                <input className="input-dark w-full" value={form.source} onChange={e => set('source', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Υποστηρίζει</label>
                <select className="input-dark w-full" value={form.supports} onChange={e => set('supports', e.target.value)}>
                  {Object.entries(supportsLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Αξιοπιστία</label>
                <select className="input-dark w-full" value={form.reliability} onChange={e => set('reliability', e.target.value)}>
                  <option value="high">Υψηλή</option><option value="medium">Μέτρια</option>
                  <option value="low">Χαμηλή</option><option value="unverified">Αδιάγνωστη</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-gold text-xs px-4 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#8aaac8] hover:text-[#d4dce8]">Ακύρωση</button>
            </div>
          </form>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν αποδείξεις.</p>
        ) : (
          <div className="space-y-2">
            {items.map(ev => (
              <div key={ev.id} className="p-3 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30 group flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#d4dce8]">{ev.title}</p>
                  <div className="flex gap-3 mt-1">
                    <span className={`text-[11px] ${supportsCls[ev.supports] ?? 'text-slate-400'}`}>{supportsLabels[ev.supports] ?? ev.supports}</span>
                    <span className="text-[11px] text-[#5a7a9a]">Αξιοπιστία: {ev.reliability}</span>
                    {ev.source && <span className="text-[11px] text-[#4a6a8a]">Πηγή: {ev.source}</span>}
                  </div>
                  {ev.description && <p className="text-xs text-[#8aaac8] mt-1">{ev.description}</p>}
                </div>
                <button onClick={() => del(ev.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Legal Issues Tab ---
function LegalIssuesTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ issue_title: '', facts_supporting: '', missing_facts: '', risk_level: 'medium', lawyer_notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => criminalApi.listIssues(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.issue_title.trim()) { toast.error('Συμπληρώστε τίτλο'); return; }
    setSaving(true);
    try {
      await criminalApi.createIssue(caseId, form);
      toast.success('Νομικό ζήτημα προστέθηκε');
      setShowForm(false);
      setForm({ issue_title: '', facts_supporting: '', missing_facts: '', risk_level: 'medium', lawyer_notes: '' });
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή;')) return;
    try { await criminalApi.deleteIssue(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const riskCls: Record<string, string> = {
    low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Νομικά Ζητήματα" action={
        <button onClick={() => setShowForm(v => !v)} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={13} /> Προσθήκη
        </button>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-5 p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/40 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τίτλος Ζητήματος *</label>
                <input className="input-dark w-full" value={form.issue_title} onChange={e => set('issue_title', e.target.value)} required />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Γεγονότα που στηρίζουν</label>
                <textarea className="input-dark w-full" rows={2} value={form.facts_supporting} onChange={e => set('facts_supporting', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Στοιχεία που λείπουν</label>
                <textarea className="input-dark w-full" rows={2} value={form.missing_facts} onChange={e => set('missing_facts', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Επίπεδο Κινδύνου</label>
                <select className="input-dark w-full" value={form.risk_level} onChange={e => set('risk_level', e.target.value)}>
                  <option value="low">Χαμηλό</option><option value="medium">Μέτριο</option>
                  <option value="high">Υψηλό</option><option value="critical">Κρίσιμο</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Σημειώσεις Δικηγόρου</label>
                <textarea className="input-dark w-full" rows={2} value={form.lawyer_notes} onChange={e => set('lawyer_notes', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-gold text-xs px-4 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#8aaac8] hover:text-[#d4dce8]">Ακύρωση</button>
            </div>
          </form>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν νομικά ζητήματα.</p>
        ) : (
          <div className="space-y-3">
            {items.map(issue => (
              <div key={issue.id} className="p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30 group">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={14} className="text-[#C6A75E]" />
                      <p className="text-sm font-medium text-[#d4dce8]">{issue.issue_title}</p>
                      <span className={`text-[11px] font-medium ${riskCls[issue.risk_level] ?? 'text-slate-400'}`}>
                        [{issue.risk_level}]
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {issue.facts_supporting && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a] mb-1">Γεγονότα</p>
                          <p className="text-[#8aaac8]">{issue.facts_supporting}</p>
                        </div>
                      )}
                      {issue.missing_facts && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a] mb-1">Ελλείποντα</p>
                          <p className="text-[#8aaac8]">{issue.missing_facts}</p>
                        </div>
                      )}
                    </div>
                    {issue.lawyer_notes && <p className="text-xs text-[#5a7a9a] mt-2 italic">{issue.lawyer_notes}</p>}
                  </div>
                  <button onClick={() => del(issue.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2 flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Tasks Tab ---
function TasksTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', status: 'open' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => criminalApi.listTasks(caseId).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Συμπληρώστε τίτλο'); return; }
    setSaving(true);
    try {
      await criminalApi.createTask(caseId, form);
      toast.success('Task δημιουργήθηκε');
      setShowForm(false);
      setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', status: 'open' });
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή task;')) return;
    try { await criminalApi.deleteTask(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const updateStatus = async (id: string, status: string) => {
    try { await criminalApi.updateTask(caseId, id, { status }); load(); } catch { toast.error('Σφάλμα'); }
  };

  const statusCls: Record<string, string> = {
    open: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
    done: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  const statusLabels: Record<string, string> = { open: 'Ανοικτό', in_progress: 'Σε Εξέλιξη', blocked: 'Αποκλεισμένο', done: 'Ολοκληρωμένο' };
  const priorityCls: Record<string, string> = { low: 'text-slate-400', medium: 'text-blue-400', high: 'text-amber-400', urgent: 'text-red-400' };

  return (
    <div className="space-y-5">
      <SectionCard title="Tasks" action={
        <button onClick={() => setShowForm(v => !v)} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={13} /> Νέο Task
        </button>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-5 p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/40 space-y-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τίτλος *</label>
              <input className="input-dark w-full" value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ανατεθειμένο σε</label>
                <input className="input-dark w-full" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Προθεσμία</label>
                <input type="date" className="input-dark w-full" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Προτεραιότητα</label>
                <select className="input-dark w-full" value={form.priority} onChange={e => set('priority', e.target.value)}>
                  <option value="low">Χαμηλή</option><option value="medium">Μέτρια</option>
                  <option value="high">Υψηλή</option><option value="urgent">Επείγουσα</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-gold text-xs px-4 py-1.5">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#8aaac8] hover:text-[#d4dce8]">Ακύρωση</button>
            </div>
          </form>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν tasks.</p>
        ) : (
          <div className="space-y-2">
            {items.map(t => (
              <div key={t.id} className="p-3 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30 group flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm text-[#d4dce8] ${t.status === 'done' ? 'line-through text-[#5a7a9a]' : ''}`}>{t.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${statusCls[t.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {statusLabels[t.status] ?? t.status}
                    </span>
                    <span className={`text-[11px] ${priorityCls[t.priority] ?? 'text-slate-400'}`}>{t.priority}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-[#5a7a9a]">
                    {t.due_date && <span className="flex items-center gap-1"><Clock size={11} />{t.due_date}</span>}
                    {t.assigned_to && <span className="flex items-center gap-1"><User size={11} />{t.assigned_to}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.status !== 'done' && (
                    <button onClick={() => updateStatus(t.id, 'done')} className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors">
                      <CheckCircle2 size={15} />
                    </button>
                  )}
                  {t.status === 'done' && (
                    <button onClick={() => updateStatus(t.id, 'open')} className="text-[10px] text-[#4a6a8a] hover:text-[#8aaac8]">
                      <RotateCw size={14} />
                    </button>
                  )}
                  <button onClick={() => del(t.id)} className="text-[#4a6a8a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- AI Outputs Tab ---
const OUTPUT_TYPES = [
  { type: 'case_summary', label: 'Περίληψη Υπόθεσης' },
  { type: 'chronology', label: 'Χρονολόγιο' },
  { type: 'missing_documents', label: 'Ελλείποντα Έγγραφα' },
  { type: 'client_questions', label: 'Ερωτήσεις προς Πελάτη' },
  { type: 'witness_questions', label: 'Ερωτήσεις προς Μάρτυρες' },
  { type: 'risk_analysis', label: 'Ανάλυση Κινδύνου' },
  { type: 'legal_issues', label: 'Νομικά Ζητήματα (Draft)' },
  { type: 'defence_strategy', label: 'Στρατηγική Υπεράσπισης' },
  { type: 'prosecution_support', label: 'Υποστήριξη Κατηγορίας' },
  { type: 'court_brief', label: 'Court Preparation Brief' },
  { type: 'client_email', label: 'Draft Email προς Πελάτη' },
  { type: 'internal_memo', label: 'Εσωτερικό Memo' },
];

function AIOutputsTab({ caseId, userRole }: { caseId: string; userRole: string }) {
  const [outputs, setOutputs] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState('case_summary');
  const [language, setLanguage] = useState('el');
  const [extraContext, setExtraContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const canApprove = ['administrator', 'lawyer'].includes(userRole);

  const load = useCallback(() => criminalApi.listOutputs(caseId).then(r => setOutputs(Array.isArray(r.data) ? r.data : [])).catch(() => {}), [caseId]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      await criminalApi.generateOutput(caseId, { output_type: selectedType, language, extra_context: extraContext || undefined });
      toast.success('AI draft δημιουργήθηκε');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά τη δημιουργία');
    } finally { setGenerating(false); }
  };

  const updateOutput = async (id: string, data: any) => {
    try { await criminalApi.updateOutput(caseId, id, data); load(); } catch { toast.error('Σφάλμα'); }
  };

  const saveEdit = async (id: string) => {
    await updateOutput(id, { content: editContent[id] });
    toast.success('Αποθηκεύτηκε ως revised');
    setEditing(p => ({ ...p, [id]: false }));
  };

  const del = async (id: string) => {
    if (!window.confirm('Διαγραφή output;')) return;
    try { await criminalApi.deleteOutput(caseId, id); load(); } catch { toast.error('Σφάλμα'); }
  };

  const exportFile = async (id: string, format: string) => {
    try {
      const token = localStorage.getItem('nomos_token');
      const resp = await fetch(`/api/criminal/cases/${caseId}/outputs/${id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export απέτυχε');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.href = url; a.download = m ? m[1] : `output.${format}`; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Εξήχθη .${format}`);
    } catch { toast.error('Σφάλμα export'); }
  };

  return (
    <div className="space-y-5">
      {/* Generation panel */}
      <SectionCard title="Δημιουργία AI Output">
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-300">
            Όλα τα outputs είναι DRAFT για αναθεώρηση. Δεν αποστέλλονται αυτόματα.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τύπος Output</label>
              <select className="input-dark w-full" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                {OUTPUT_TYPES.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Γλώσσα</label>
              <select className="input-dark w-full" value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="el">Ελληνικά</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Επιπλέον Πλαίσιο (προαιρετικό)</label>
            <textarea className="input-dark w-full" rows={2} value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="Ειδικές οδηγίες ή επιπρόσθετα στοιχεία..." />
          </div>
          <button onClick={generate} disabled={generating} className="btn-gold flex items-center gap-2">
            <Sparkles size={15} />
            {generating ? 'Δημιουργία... (μπορεί να πάρει ~30s)' : 'Δημιουργία'}
          </button>
        </div>
      </SectionCard>

      {/* Output list */}
      {outputs.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Sparkles size={28} className="text-[#1a3a5c] mx-auto mb-2" />
          <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν outputs ακόμη.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {outputs.map(o => (
            <div key={o.id} className="glass-card overflow-hidden border border-[#1a3a5c]/40">
              <div className="px-5 py-3 border-b border-[#1a3a5c]/40 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#C6A75E]" />
                  <div>
                    <p className="text-sm font-medium text-[#d4dce8]">{o.title}</p>
                    <p className="text-[11px] text-[#5a7a9a] font-mono">
                      {o.output_type} · {o.language?.toUpperCase()} · {new Date(o.created_at).toLocaleString('el-GR')}
                    </p>
                  </div>
                </div>
                <OutputStatusBadge status={o.status} />
              </div>

              <div className="p-5">
                {/* Content */}
                {editing[o.id] ? (
                  <textarea
                    className="input-dark w-full font-mono text-xs"
                    rows={14}
                    value={editContent[o.id] ?? o.content}
                    onChange={e => setEditContent(p => ({ ...p, [o.id]: e.target.value }))}
                  />
                ) : (
                  <>
                    <button onClick={() => setExpanded(p => ({ ...p, [o.id]: !p[o.id] }))}
                      className="text-[11px] text-[#C6A75E] hover:text-[#E8C97A] flex items-center gap-1 mb-2">
                      {expanded[o.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {expanded[o.id] ? 'Απόκρυψη' : 'Προβολή'} περιεχομένου
                    </button>
                    {expanded[o.id] && (
                      <pre className="text-xs text-[#8aaac8] leading-relaxed whitespace-pre-wrap font-mono bg-[#0d2035]/40 p-3 rounded-lg border border-[#1a3a5c]/30 max-h-80 overflow-y-auto">
                        {o.content}
                      </pre>
                    )}
                  </>
                )}

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-[#1a3a5c]/30 flex flex-wrap gap-2">
                  {!editing[o.id] && (
                    <button onClick={() => { setEditing(p => ({ ...p, [o.id]: true })); setEditContent(p => ({ ...p, [o.id]: o.content })); }}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#1a3a5c]/40 text-[#8aaac8] hover:text-[#C6A75E] hover:border-[#C6A75E]/30 transition-all">
                      <Edit3 size={12} /> Επεξεργασία
                    </button>
                  )}
                  {editing[o.id] && (
                    <>
                      <button onClick={() => saveEdit(o.id)} className="btn-gold text-xs px-3 py-1.5">Αποθήκευση</button>
                      <button onClick={() => setEditing(p => ({ ...p, [o.id]: false }))} className="text-xs px-3 py-1.5 text-[#8aaac8] hover:text-[#d4dce8]">Άκυρο</button>
                    </>
                  )}

                  {canApprove && o.status !== 'approved' && (
                    <button onClick={() => updateOutput(o.id, { status: 'approved' })}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                      <CheckCircle2 size={12} /> Έγκριση
                    </button>
                  )}
                  {canApprove && o.status !== 'rejected' && (
                    <button onClick={() => updateOutput(o.id, { status: 'rejected' })}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                      <XCircle size={12} /> Απόρριψη
                    </button>
                  )}

                  <div className="ml-auto flex gap-2">
                    <button onClick={() => exportFile(o.id, 'pdf')}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#1a3a5c]/40 text-[#8aaac8] hover:text-[#C6A75E] hover:border-[#C6A75E]/30 transition-all">
                      <FileDown size={12} /> PDF
                    </button>
                    <button onClick={() => exportFile(o.id, 'docx')}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#1a3a5c]/40 text-[#8aaac8] hover:text-[#C6A75E] hover:border-[#C6A75E]/30 transition-all">
                      <Download size={12} /> DOCX
                    </button>
                    {canApprove && (
                      <button onClick={() => del(o.id)} className="p-1.5 text-[#4a6a8a] hover:text-red-400 transition-all">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {(o.output_type === 'client_email' || o.output_type === 'court_brief') && o.status !== 'approved' && (
                  <div className="mt-3 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    Approval gate: αυτό το έγγραφο πρέπει να εγκριθεί από δικηγόρο/admin.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Audit Tab ---
function CCAuditTab({ caseId }: { caseId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    criminalApi.caseAudit(caseId)
      .then(r => setLogs(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  return (
    <SectionCard title="Audit Log">
      {loading ? (
        <p className="text-sm text-[#5a7a9a]">Φόρτωση...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[#4a6a8a] text-center py-6">Δεν υπάρχουν εγγραφές.</p>
      ) : (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-3 p-2 rounded hover:bg-[#0d2035]/30 transition-colors">
              <Activity size={13} className="text-[#C6A75E] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono font-medium text-[#d4dce8]">{log.action}</span>
                {log.user_id && <span className="text-xs text-[#5a7a9a] ml-2">· {log.user_id.slice(0, 8)}</span>}
              </div>
              <span className="text-[10px] font-mono text-[#4a6a8a] flex-shrink-0">
                {log.timestamp ? new Date(log.timestamp).toLocaleString('el-GR') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Main Detail Page ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Επισκόπηση', icon: Gavel },
  { id: 'timeline', label: 'Χρονολόγιο', icon: Clock },
  { id: 'parties', label: 'Εμπλεκόμενοι', icon: User },
  { id: 'documents', label: 'Έγγραφα', icon: FileText },
  { id: 'evidence', label: 'Αποδείξεις', icon: Shield },
  { id: 'issues', label: 'Νομικά Ζητήματα', icon: Scale },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'ai_outputs', label: 'AI Outputs', icon: Sparkles },
  { id: 'audit', label: 'Audit', icon: Activity },
];

export default function CriminalCaseDetailPage() {
  const caseId = getPathId();
  const [caseData, setCaseData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const perms = usePermissions();

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const load = useCallback(async () => {
    if (!caseId) return;
    try {
      const [caseRes, healthRes] = await Promise.all([
        criminalApi.get(caseId),
        criminalApi.health(caseId).catch(() => ({ data: null })),
      ]);
      setCaseData(caseRes.data);
      setHealth(healthRes.data);
    } catch {
      toast.error('Σφάλμα φόρτωσης υπόθεσης');
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="glass-card p-12 text-center text-[#5a7a9a]">Φόρτωση...</div>;
  if (!caseData) return (
    <div className="glass-card p-12 text-center">
      <p className="text-[#5a7a9a]">Υπόθεση δεν βρέθηκε.</p>
      <button onClick={() => navigate('/criminal')} className="btn-gold mt-4">Επιστροφή</button>
    </div>
  );

  // Get user role from localStorage
  let userRole = 'secretary';
  try { userRole = JSON.parse(localStorage.getItem('nomos_user') || '{}').role ?? 'secretary'; } catch {}

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/criminal')} className="p-2 rounded-lg text-[#5a7a9a] hover:text-[#C6A75E] hover:bg-[#0d2035]/60 transition-all mt-0.5 flex-shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Scale size={16} className="text-[#C6A75E]" />
              <p className="text-[10px] uppercase tracking-widest text-[#4a6a8a]">Ποινική Υπόθεση</p>
            </div>
            <h1 className="text-xl font-bold text-[#e0e8f0]">{caseData.case_title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={caseData.status} />
              {health && <HealthBadge level={health.level} />}
              <span className="text-xs text-[#5a7a9a]">{caseData.client_name}</span>
              {caseData.matter_type && <span className="text-xs text-[#5a7a9a]">· {caseData.matter_type}</span>}
            </div>
          </div>
        </div>
        {caseData.hearing_date && (
          <div className="glass-card px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-[#4a6a8a]">Δικάσιμος</p>
            <p className="text-sm font-mono text-[#C6A75E] font-medium">{caseData.hearing_date}</p>
            {health?.hearing_days_left !== null && health?.hearing_days_left !== undefined && (
              <p className="text-[10px] text-[#5a7a9a]">{health.hearing_days_left >= 0 ? `σε ${health.hearing_days_left} ημέρες` : 'παρήλθε'}</p>
            )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 p-1 glass-card rounded-xl scrollbar-thin">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0
                ${isActive ? 'bg-[#C6A75E]/10 text-[#C6A75E] border border-[#C6A75E]/20' : 'text-[#5a7a9a] hover:text-[#b8cce0] hover:bg-[#0d2035]/60'}`}>
              <Icon size={13} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab caseData={caseData} health={health} onUpdate={load} />}
      {activeTab === 'timeline' && <TimelineTab caseId={caseId} />}
      {activeTab === 'parties' && <PartiesTab caseId={caseId} />}
      {activeTab === 'documents' && <DocumentsTab caseId={caseId} />}
      {activeTab === 'evidence' && <EvidenceTab caseId={caseId} />}
      {activeTab === 'issues' && <LegalIssuesTab caseId={caseId} />}
      {activeTab === 'tasks' && <TasksTab caseId={caseId} />}
      {activeTab === 'ai_outputs' && <AIOutputsTab caseId={caseId} userRole={userRole} />}
      {activeTab === 'audit' && <CCAuditTab caseId={caseId} />}
    </div>
  );
}
