import { useEffect, useState } from 'react';
import { Scale, Plus, X, Search, AlertTriangle, ChevronRight } from 'lucide-react';
import { criminalApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────

const MATTER_TYPES = [
  'Κλοπή', 'Ληστεία', 'Απάτη', 'Ναρκωτικά', 'Σωματική βλάβη',
  'Ανθρωποκτονία', 'Οδική παράβαση', 'Συκοφαντική δυσφήμηση',
  'Παραβίαση προσωπικών δεδομένων', 'Υπεξαίρεση', 'Άλλο',
];

const URGENCY_LABELS: Record<string, string> = {
  low: 'Χαμηλή', medium: 'Μέτρια', high: 'Υψηλή', critical: 'Κρίσιμη',
};

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', review: 'Αξιολόγηση', active: 'Ενεργή',
  awaiting_documents: 'Αναμονή Εγγράφων', court_preparation: 'Προετοιμασία Δίκης',
  closed: 'Κλειστή',
};

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    active: 'status-active',
    court_preparation: 'status-urgent',
    intake: 'status-info',
    review: 'status-pending',
    awaiting_documents: 'status-pending',
    closed: 'status-closed',
  };
  return (
    <span className={`status-badge ${cls[status] ?? 'status-info'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function UrgencyBadge({ level }: { level: string }) {
  const cls: Record<string, string> = {
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] border font-medium ${cls[level] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
      {URGENCY_LABELS[level] ?? level}
    </span>
  );
}

function HealthBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cfg: Record<string, { cls: string; label: string }> = {
    green: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Καλή' },
    yellow: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Προσοχή' },
    red: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Κρίσιμη' },
  };
  const c = cfg[level] ?? cfg.green;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] border font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ── Slide-in panel ────────────────────────────────────────────────────────────

interface NewCaseFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_FORM = {
  case_title: '', client_name: '', client_email: '', client_phone: '',
  client_role: 'accused', matter_type: '', short_description: '', opposing_party: '',
  court: '', hearing_date: '', urgency_level: 'medium', status: 'intake',
};

function NewCasePanel({ onClose, onCreated }: NewCaseFormProps) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.case_title.trim() || !form.client_name.trim() || !form.matter_type || !form.short_description.trim()) {
      toast.error('Συμπληρώστε τα υποχρεωτικά πεδία');
      return;
    }
    setSaving(true);
    try {
      await criminalApi.create(form);
      toast.success('Η ποινική υπόθεση δημιουργήθηκε');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά τη δημιουργία');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg h-full overflow-y-auto flex flex-col glass-card border-l border-[#1a3a5c]/60 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3a5c]/40">
          <div className="flex items-center gap-3">
            <Scale size={18} className="text-[#C6A75E]" />
            <h2 className="text-[15px] font-semibold text-[#e0e8f0]">Νέα Ποινική Υπόθεση</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#5a7a9a] hover:text-[#C6A75E] hover:bg-[#0d2035]/60 transition-all">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τίτλος Υπόθεσης *</label>
            <input className="input-dark w-full" value={form.case_title} onChange={e => set('case_title', e.target.value)} required placeholder="π.χ. Κλοπή 2024 — Ιωάννης Παπαδόπουλος" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Πελάτης *</label>
              <input className="input-dark w-full" value={form.client_name} onChange={e => set('client_name', e.target.value)} required placeholder="Ονοματεπώνυμο" />
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ρόλος Πελάτη</label>
              <select className="input-dark w-full" value={form.client_role} onChange={e => set('client_role', e.target.value)}>
                <option value="accused">Κατηγορούμενος</option>
                <option value="victim">Θύμα</option>
                <option value="witness">Μάρτυρας</option>
                <option value="complainant">Εγκαλών</option>
                <option value="other">Άλλο</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Email Πελάτη</label>
              <input className="input-dark w-full" type="email" value={form.client_email} onChange={e => set('client_email', e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Τηλέφωνο</label>
              <input className="input-dark w-full" value={form.client_phone} onChange={e => set('client_phone', e.target.value)} placeholder="69xxxxxxxx" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Κατηγορία / Είδος *</label>
            <select className="input-dark w-full" value={form.matter_type} onChange={e => set('matter_type', e.target.value)} required>
              <option value="">-- Επιλέξτε --</option>
              {MATTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Σύντομη Περιγραφή *</label>
            <textarea className="input-dark w-full" rows={3} value={form.short_description} onChange={e => set('short_description', e.target.value)} required placeholder="Σύντομη περιγραφή της υπόθεσης..." />
          </div>
          <div>
            <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Αντίδικος / Εισαγγελία</label>
            <input className="input-dark w-full" value={form.opposing_party} onChange={e => set('opposing_party', e.target.value)} placeholder="Ονοματεπώνυμο ή αρχή" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Δικαστήριο</label>
              <input className="input-dark w-full" value={form.court} onChange={e => set('court', e.target.value)} placeholder="π.χ. Τριμελές Πλημ/κείο Αθηνών" />
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Ημ. Δικαστηρίου</label>
              <input className="input-dark w-full" type="date" value={form.hearing_date} onChange={e => set('hearing_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Επείγον</label>
              <select className="input-dark w-full" value={form.urgency_level} onChange={e => set('urgency_level', e.target.value)}>
                <option value="low">Χαμηλή</option>
                <option value="medium">Μέτρια</option>
                <option value="high">Υψηλή</option>
                <option value="critical">Κρίσιμη</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#5a7a9a] mb-1.5 uppercase tracking-wider">Κατάσταση</label>
              <select className="input-dark w-full" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="intake">Intake</option>
                <option value="review">Αξιολόγηση</option>
                <option value="active">Ενεργή</option>
                <option value="awaiting_documents">Αναμονή Εγγράφων</option>
                <option value="court_preparation">Προετοιμασία Δίκης</option>
                <option value="closed">Κλειστή</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="submit" disabled={saving} className="btn-gold flex-1">
              {saving ? 'Αποθήκευση...' : 'Δημιουργία Υπόθεσης'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[#8aaac8] hover:text-[#d4dce8] hover:bg-[#0d2035]/60 transition-all text-sm">
              Ακύρωση
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CriminalCasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [health, setHealth] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const perms = usePermissions();

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await criminalApi.list();
      const list: any[] = Array.isArray(res.data) ? res.data : [];
      setCases(list);
      // Fetch health in parallel (best-effort)
      const healthResults = await Promise.allSettled(
        list.map(c => criminalApi.health(c.id).then(r => ({ id: c.id, ...r.data })))
      );
      const hMap: Record<string, any> = {};
      healthResults.forEach(r => {
        if (r.status === 'fulfilled') hMap[r.value.id] = r.value;
      });
      setHealth(hMap);
    } catch {
      toast.error('Σφάλμα φόρτωσης υποθέσεων');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    return !q || [c.case_title, c.client_name, c.matter_type, c.status]
      .some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#4a6a8a] mb-1">Ποινικές Υποθέσεις</p>
          <h1 className="text-2xl font-bold text-[#e0e8f0] flex items-center gap-2">
            <Scale size={22} className="text-[#C6A75E]" />
            Ποινικές
          </h1>
        </div>
        {perms.canView('cases') && (
          <button onClick={() => setShowNew(true)} className="btn-gold flex items-center gap-2">
            <Plus size={16} />
            Νέα Ποινική Υπόθεση
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6a8a]" />
        <input
          className="input-dark w-full pl-9"
          placeholder="Αναζήτηση κατά τίτλο, πελάτη, κατηγορία..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-8 text-center text-[#5a7a9a]">Φόρτωση...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Scale size={32} className="text-[#1a3a5c] mx-auto mb-3" />
          <p className="text-[#5a7a9a] text-sm">
            {search ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Δεν υπάρχουν ποινικές υποθέσεις.'}
          </p>
          {!search && (
            <button onClick={() => setShowNew(true)} className="btn-gold mt-4">
              Δημιουργία πρώτης υπόθεσης
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="table-scroll">
            <table className="table-premium w-full">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Τίτλος</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Πελάτης</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Κατηγορία</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Κατάσταση</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Επείγον</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Ημ. Δικαστηρίου</th>
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-[#4a6a8a]">Υγεία</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className="border-t border-[#1a3a5c]/20 hover:bg-[#0d2035]/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/criminal/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.urgency_level === 'critical' && <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />}
                        <span className="text-sm font-medium text-[#d4dce8] hover:text-[#C6A75E] transition-colors truncate max-w-[200px]">
                          {c.case_title}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-[#8aaac8]">{c.client_name}</td>
                    <td className="px-3 py-3 text-sm text-[#8aaac8]">{c.matter_type}</td>
                    <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-3"><UrgencyBadge level={c.urgency_level} /></td>
                    <td className="px-3 py-3 text-sm font-mono text-[#6a8aaa]">{c.hearing_date || '—'}</td>
                    <td className="px-3 py-3"><HealthBadge level={health[c.id]?.level} /></td>
                    <td className="px-3 py-3 text-[#4a6a8a]"><ChevronRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && <NewCasePanel onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
