import { useEffect, useState, useRef } from 'react';
import {
  FileCheck, Download, Edit3, X, ChevronRight, Loader2,
  Hash, Type, AlignLeft, Calendar, Link2, Search, Sparkles, User,
} from 'lucide-react';
import { templatesApi, casesApi, clientsApi } from '@/lib/api';
import { toast } from 'sonner';

interface TemplateField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea' | 'linked';
  required?: boolean;
  linked_to?: 'cases' | 'clients';
}

interface Template {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  fields?: (TemplateField | string)[];
}

interface CaseOption { id: string; label: string; client_name?: string; case_number?: string }
interface ClientOption { id: string; label: string; afm?: string }

const FIELD_ICONS: Record<string, React.ElementType> = {
  text: Type,
  date: Calendar,
  number: Hash,
  textarea: AlignLeft,
  linked: Link2,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Αστικό':       'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Ποινικό':      'text-red-400 bg-red-500/10 border-red-500/20',
  'Εμπορικό':     'text-[#C6A75E] bg-[#C6A75E]/10 border-[#C6A75E]/20',
  'Εργατικό':     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Διοικητικό':   'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Οικογενειακό': 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'Δικαστικό':    'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'Γενικό':       'text-[#8aa0b8] bg-[#132B45] border-[#1a3a5c]/40',
};

const normalizeField = (f: TemplateField | string): TemplateField => {
  if (typeof f === 'string') return { name: f, label: f, type: 'text' };
  return { ...f, type: f.type || 'text', required: f.required ?? false, label: f.label || f.name };
};

// ── Searchable combobox for cases/clients ─────────────────────────────────────
function LinkedSelect({
  linkedTo,
  cases,
  clients,
  value,
  onChange,
}: {
  linkedTo: 'cases' | 'clients';
  cases: CaseOption[];
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = linkedTo === 'cases'
    ? cases.filter(c =>
        !query || c.label.toLowerCase().includes(query.toLowerCase()) ||
        (c.client_name || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.case_number || '').toLowerCase().includes(query.toLowerCase())
      )
    : clients.filter(c =>
        !query || c.label.toLowerCase().includes(query.toLowerCase())
      );

  const selected = linkedTo === 'cases'
    ? cases.find(c => c.id === value)
    : clients.find(c => c.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input-dark w-full flex items-center gap-2 text-left"
      >
        {selected ? (
          <span className="flex-1 truncate text-[#d4dce8]">
            {selected.label}
            {'client_name' in selected && selected.client_name && (
              <span className="text-[#5a7a9a] ml-2 text-[11px]">· {selected.client_name}</span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-[#4a6a8a]">
            {linkedTo === 'cases' ? 'Επιλογή υπόθεσης…' : 'Επιλογή εντολέα…'}
          </span>
        )}
        <ChevronRight size={14} className={`text-[#5a7a9a] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl bg-[#0a1828] border border-[#1a3a5c] shadow-2xl max-h-56 flex flex-col">
          <div className="p-2 border-b border-[#1a3a5c]/40">
            <div className="flex items-center gap-2 px-2">
              <Search size={13} className="text-[#5a7a9a] flex-shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-[#d4dce8] outline-none placeholder:text-[#3a5a7a]"
                placeholder="Αναζήτηση…"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className="w-full text-left px-3 py-2 text-xs text-[#5a7a9a] hover:bg-[#132B45] border-b border-[#1a3a5c]/20"
              >
                Χωρίς επιλογή
              </button>
            )}
            {options.length === 0 && (
              <p className="text-center text-xs text-[#3a5a7a] py-4">Δεν βρέθηκαν αποτελέσματα</p>
            )}
            {options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-3 py-2.5 hover:bg-[#132B45] transition-colors ${opt.id === value ? 'bg-[#132B45]' : ''}`}
              >
                <p className="text-xs font-medium text-[#d4dce8] truncate">{opt.label}</p>
                {'client_name' in opt && opt.client_name && (
                  <p className="text-[10px] text-[#5a7a9a] mt-0.5">{opt.client_name}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [fillTarget, setFillTarget]     = useState<Template | null>(null);
  const [fieldValues, setFieldValues]   = useState<Record<string, string>>({});
  const [autoFilled, setAutoFilled]     = useState<Set<string>>(new Set());
  const [generating, setGenerating]     = useState(false);
  const [filling, setFilling]           = useState(false);

  const [previewTarget, setPreviewTarget] = useState<Template | null>(null);

  // Linked-field data — loaded once when any fill modal opens
  const [cases, setCases]     = useState<CaseOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    templatesApi.list()
      .then(r => setTemplates(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const loadLinkedData = async () => {
    if (cases.length > 0 && clients.length > 0) return;
    try {
      const [cRes, clRes] = await Promise.all([casesApi.list(), clientsApi.list()]);
      setCases((cRes.data || []).map((c: any) => ({
        id: c.id || c._id,
        label: c.title || `Υπόθεση ${c.case_number || ''}`,
        client_name: c.client_name || '',
        case_number: c.case_number || '',
      })));
      setClients((clRes.data || []).map((c: any) => ({
        id: c.id || c._id,
        label: c.full_name || c.name || '',
        afm: c.afm || '',
      })));
    } catch { /* non-fatal */ }
  };

  const openFill = async (t: Template) => {
    setFillTarget(t);
    const init: Record<string, string> = {};
    (t.fields || []).forEach(f => { init[normalizeField(f).name] = ''; });
    setFieldValues(init);
    setAutoFilled(new Set());
    await loadLinkedData();

    // Pre-fill from the fill endpoint with no case/client — pulls office settings
    try {
      const tid = t._id || t.id;
      if (tid) {
        setFilling(true);
        const res = await templatesApi.fill(tid, {});
        mergeAutoFilled(res.data.auto_filled || {});
      }
    } catch { /* ignore */ }
    finally { setFilling(false); }
  };

  const mergeAutoFilled = (data: Record<string, string>) => {
    setFieldValues(prev => {
      const next = { ...prev };
      const filled = new Set<string>();
      Object.entries(data).forEach(([k, v]) => {
        if (v) { next[k] = v; filled.add(k); }
      });
      setAutoFilled(prev2 => {
        const s = new Set(prev2);
        filled.forEach(k => s.add(k));
        return s;
      });
      return next;
    });
  };

  const handleLinkedChange = async (fieldName: string, id: string) => {
    setFieldValues(prev => ({ ...prev, [fieldName]: id }));
    if (!fillTarget) return;
    const tid = fillTarget._id || fillTarget.id;
    if (!tid || !id) return;

    setFilling(true);
    try {
      const params = fieldName === '_case_id' ? { case_id: id } : { client_id: id };
      const res = await templatesApi.fill(tid, params);
      mergeAutoFilled(res.data.auto_filled || {});
    } catch { toast.error('Αποτυχία αυτόματης συμπλήρωσης'); }
    finally { setFilling(false); }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fillTarget) return;
    const tid = fillTarget._id || fillTarget.id;
    if (!tid) { toast.error('Δεν βρέθηκε ID προτύπου'); return; }
    setGenerating(true);
    try {
      const res = await templatesApi.generate(tid, { fields: fieldValues });
      const blob = new Blob([res.data], {
        type: res.headers?.['content-type'] ||
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fillTarget.name || fillTarget.title || 'document'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Έγγραφο δημιουργήθηκε!');
      setFillTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Αποτυχία δημιουργίας εγγράφου');
    } finally {
      setGenerating(false);
    }
  };

  const catColor = (t: Template) =>
    CATEGORY_COLORS[t.category || ''] || 'text-[#8aa0b8] bg-[#132B45] border-[#1a3a5c]/40';

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Πρότυπα Εγγράφων</h2>
          <p className="page-subtitle">
            {templates.length} διαθέσιμα πρότυπα — συμπλήρωση &amp; εξαγωγή DOCX
          </p>
        </div>
      </div>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <FileCheck size={40} className="mx-auto text-[#2a4a6a] mb-4" />
          <p className="text-[#5a7a9a]">Δεν υπάρχουν πρότυπα στη βάση δεδομένων.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t, i) => {
            const fields = (t.fields || []).map(normalizeField).filter(f => f.type !== 'linked');
            const name = t.name || t.title || `Πρότυπο ${i + 1}`;
            const hasLinked = (t.fields || []).some(f => normalizeField(f).type === 'linked');
            return (
              <div key={t._id || t.id || i}
                className="glass-card p-5 flex flex-col gap-4 hover:border-[#1a3a5c] transition-all group">

                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#C6A75E]/10 border border-[#C6A75E]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C6A75E]/15 transition-all">
                    <FileCheck size={20} className="text-[#C6A75E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#d4dce8] leading-tight">{name}</h3>
                    {t.description && (
                      <p className="text-xs text-[#5a7a9a] mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {t.category && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${catColor(t)}`}>
                      {t.category}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#0d2035]/60 text-[#5a7a9a] border border-[#1a3a5c]/30">
                    {fields.length} πεδία
                  </span>
                  {hasLinked && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#C6A75E]/10 text-[#C6A75E] border border-[#C6A75E]/20 flex items-center gap-1">
                      <Link2 size={9} /> αυτόματο
                    </span>
                  )}
                </div>

                {fields.length > 0 && (
                  <div className="space-y-1">
                    {fields.slice(0, 3).map((f, fi) => {
                      const FIcon = FIELD_ICONS[f.type] || Type;
                      return (
                        <div key={fi} className="flex items-center gap-2 text-[11px] text-[#5a7a9a]">
                          <FIcon size={10} className="flex-shrink-0" />
                          <span className="truncate">{f.label}</span>
                          {f.required && <span className="text-red-400 flex-shrink-0">*</span>}
                        </div>
                      );
                    })}
                    {fields.length > 3 && (
                      <p className="text-[10px] text-[#3a5a7a] pl-4">+ {fields.length - 3} ακόμα πεδία</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1 mt-auto">
                  <button
                    onClick={() => setPreviewTarget(t)}
                    className="flex-1 py-2 rounded-lg border border-[#1a3a5c]/40 text-[#7a9ab8] hover:text-[#C6A75E] hover:border-[#C6A75E]/30 text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    <ChevronRight size={12} /> Προεπισκόπηση
                  </button>
                  <button
                    onClick={() => openFill(t)}
                    className="flex-1 btn-gold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                    <Edit3 size={12} /> Συμπλήρωση
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Fill Modal ─────────────────────────────────────────────────────────── */}
      {fillTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setFillTarget(null)}>
          <div className="glass-card w-full max-w-xl border border-[#1a3a5c] my-4"
            onClick={e => e.stopPropagation()}>

            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  {fillTarget.name || fillTarget.title}
                </h3>
                <p className="text-xs text-[#5a7a9a] mt-0.5">
                  Συμπληρώστε τα πεδία για να δημιουργήσετε το έγγραφο
                </p>
              </div>
              <button onClick={() => setFillTarget(null)}
                className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {filling && (
                <div className="flex items-center gap-2 text-xs text-[#C6A75E] bg-[#C6A75E]/10 rounded-lg px-3 py-2 border border-[#C6A75E]/20">
                  <Loader2 size={12} className="animate-spin" />
                  Αυτόματη συμπλήρωση…
                </div>
              )}

              {(fillTarget.fields || []).map((rawField, fi) => {
                const f = normalizeField(rawField);

                // ── Linked field → combobox ──────────────────────────────────
                if (f.type === 'linked') {
                  const isCase = f.linked_to === 'cases';
                  const Icon = isCase ? FileCheck : User;
                  return (
                    <div key={fi} className="rounded-xl border border-[#C6A75E]/20 bg-[#C6A75E]/5 p-3 space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#C6A75E]">
                        <Icon size={11} />
                        {f.label}
                        <span className="ml-auto text-[10px] font-normal text-[#C6A75E]/60">
                          Συμπληρώνει αυτόματα τα πεδία
                        </span>
                      </label>
                      <LinkedSelect
                        linkedTo={f.linked_to!}
                        cases={cases}
                        clients={clients}
                        value={fieldValues[f.name] || ''}
                        onChange={id => handleLinkedChange(f.name, id)}
                      />
                    </div>
                  );
                }

                // ── Regular field ────────────────────────────────────────────
                const FIcon = FIELD_ICONS[f.type] || Type;
                const isAuto = autoFilled.has(f.name);
                return (
                  <div key={fi}>
                    <label className="label flex items-center gap-1.5">
                      <FIcon size={11} className="text-[#5a7a9a]" />
                      {f.label}
                      {f.required && <span className="text-red-400">*</span>}
                      {isAuto && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-[#C6A75E]/70">
                          <Sparkles size={9} /> αυτόματο
                        </span>
                      )}
                    </label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={fieldValues[f.name] || ''}
                        onChange={e => {
                          setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }));
                          setAutoFilled(prev => { const s = new Set(prev); s.delete(f.name); return s; });
                        }}
                        className={`input-dark h-20 resize-none ${isAuto ? 'border-[#C6A75E]/30' : ''}`}
                        required={f.required}
                      />
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={fieldValues[f.name] || ''}
                        onChange={e => {
                          setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }));
                          setAutoFilled(prev => { const s = new Set(prev); s.delete(f.name); return s; });
                        }}
                        className={`input-dark ${isAuto ? 'border-[#C6A75E]/30' : ''}`}
                        required={f.required}
                      />
                    )}
                  </div>
                );
              })}

              {(fillTarget.fields || []).length === 0 && (
                <p className="text-sm text-[#5a7a9a] text-center py-4">
                  Αυτό το πρότυπο δεν έχει δυναμικά πεδία.
                </p>
              )}
            </form>

            <div className="p-6 pt-0 flex gap-2">
              <button type="button" onClick={() => setFillTarget(null)} className="btn-dark flex-1 cursor-pointer">
                Ακύρωση
              </button>
              <button
                disabled={generating || filling}
                onClick={handleGenerate}
                className="btn-gold flex-1 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
                {generating
                  ? <><Loader2 size={14} className="animate-spin" /> Δημιουργία…</>
                  : <><Download size={14} /> Δημιουργία DOCX</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ──────────────────────────────────────────────────────── */}
      {previewTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewTarget(null)}>
          <div className="glass-card w-full max-w-md border border-[#1a3a5c]"
            onClick={e => e.stopPropagation()}>

            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">{previewTarget.name || previewTarget.title}</h3>
              <button onClick={() => setPreviewTarget(null)}
                className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {previewTarget.category && (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${catColor(previewTarget)}`}>
                  {previewTarget.category}
                </span>
              )}
              {previewTarget.description && (
                <p className="text-sm text-[#8aa0b8]">{previewTarget.description}</p>
              )}

              <div>
                <p className="text-xs font-semibold text-[#C6A75E] uppercase tracking-wider mb-3">
                  Πεδία ({(previewTarget.fields || []).filter(f => normalizeField(f).type !== 'linked').length})
                </p>
                <div className="space-y-2">
                  {(previewTarget.fields || []).map((rawField, fi) => {
                    const f = normalizeField(rawField);
                    if (f.type === 'linked') return (
                      <div key={fi}
                        className="flex items-center gap-2 p-2 rounded-lg bg-[#C6A75E]/5 border border-[#C6A75E]/15">
                        <Link2 size={12} className="text-[#C6A75E] flex-shrink-0" />
                        <span className="text-xs text-[#C6A75E]">{f.label}</span>
                      </div>
                    );
                    const FIcon = FIELD_ICONS[f.type] || Type;
                    return (
                      <div key={fi}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                        <div className="w-7 h-7 rounded-lg bg-[#132B45] flex items-center justify-center flex-shrink-0">
                          <FIcon size={13} className="text-[#5a7a9a]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#d4dce8]">{f.label}</p>
                          <p className="text-[10px] text-[#4a6a8a]">{f.type}{f.required ? ' · απαιτείται' : ''}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => { setPreviewTarget(null); openFill(previewTarget); }}
                className="btn-gold w-full flex items-center justify-center gap-2 cursor-pointer">
                <Edit3 size={14} /> Συμπλήρωση &amp; Δημιουργία
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
