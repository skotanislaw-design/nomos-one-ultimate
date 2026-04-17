import { useEffect, useState } from 'react';
import { FileCheck, Download, Edit3, X, ChevronRight, Loader2, Hash, Type, AlignLeft, Calendar } from 'lucide-react';
import { templatesApi } from '@/lib/api';
import { toast } from 'sonner';

interface TemplateField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea';
  required?: boolean;
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

const FIELD_ICONS: Record<string, React.ElementType> = {
  text: Type,
  date: Calendar,
  number: Hash,
  textarea: AlignLeft,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Αστικό': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Ποινικό': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Εμπορικό': 'text-[#C6A75E] bg-[#C6A75E]/10 border-[#C6A75E]/20',
  'Εργατικό': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Διοικητικό': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Οικογενειακό': 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

/** Normalize a field entry — supports both string and object formats */
const normalizeField = (f: TemplateField | string): TemplateField => {
  if (typeof f === 'string') return { name: f, label: f, type: 'text' };
  return { type: 'text', required: false, ...f, label: f.label || f.name };
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Fill modal
  const [fillTarget, setFillTarget] = useState<Template | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  // Preview modal
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null);

  useEffect(() => {
    templatesApi.list()
      .then(r => setTemplates(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const openFill = (t: Template) => {
    setFillTarget(t);
    // Initialise all fields to empty strings
    const init: Record<string, string> = {};
    (t.fields || []).forEach(f => { init[normalizeField(f).name] = ''; });
    setFieldValues(init);
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
        type: res.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fillTarget.name || fillTarget.title || 'document'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Έγγραφο δημιουργήθηκε και ληφθέν!');
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
          <p className="page-subtitle">{templates.length} διαθέσιμα πρότυπα — συμπλήρωση &amp; εξαγωγή DOCX</p>
        </div>
      </div>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <FileCheck size={40} className="mx-auto text-[#2a4a6a] mb-4" />
          <p className="text-[#5a7a9a]">Δεν υπάρχουν πρότυπα στη βάση δεδομένων.</p>
          <p className="text-xs text-[#3a5a7a] mt-2">Προσθέστε πρότυπα μέσω του backend API.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t, i) => {
            const fields = (t.fields || []).map(normalizeField);
            const name = t.name || t.title || `Πρότυπο ${i + 1}`;
            return (
              <div key={t._id || t.id || i}
                className="glass-card p-5 flex flex-col gap-4 hover:border-[#1a3a5c] transition-all group">

                {/* Top */}
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

                {/* Meta */}
                <div className="flex items-center gap-2 flex-wrap">
                  {t.category && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${catColor(t)}`}>
                      {t.category}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#0d2035]/60 text-[#5a7a9a] border border-[#1a3a5c]/30">
                    {fields.length} πεδία
                  </span>
                </div>

                {/* Field preview */}
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

                {/* Actions */}
                <div className="flex gap-2 pt-1 mt-auto">
                  <button
                    onClick={() => setPreviewTarget(t)}
                    className="flex-1 py-2 rounded-lg border border-[#1a3a5c]/40 text-[#7a9ab8] hover:text-[#C6A75E] hover:border-[#C6A75E]/30 text-xs font-medium transition-all flex items-center justify-center gap-1.5">
                    <ChevronRight size={12} /> Προεπισκόπηση
                  </button>
                  <button
                    onClick={() => openFill(t)}
                    className="flex-1 btn-gold text-xs flex items-center justify-center gap-1.5">
                    <Edit3 size={12} /> Συμπλήρωση
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Fill Modal ── */}
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
                <p className="text-xs text-[#5a7a9a] mt-0.5">Συμπληρώστε τα πεδία για να δημιουργήσετε το έγγραφο</p>
              </div>
              <button onClick={() => setFillTarget(null)}
                className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {(fillTarget.fields || []).map((rawField, fi) => {
                const f = normalizeField(rawField);
                const FIcon = FIELD_ICONS[f.type] || Type;
                return (
                  <div key={fi}>
                    <label className="label flex items-center gap-1.5">
                      <FIcon size={11} className="text-[#5a7a9a]" />
                      {f.label}
                      {f.required && <span className="text-red-400">*</span>}
                    </label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={fieldValues[f.name] || ''}
                        onChange={e => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                        className="input-dark h-20 resize-none"
                        required={f.required}
                      />
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={fieldValues[f.name] || ''}
                        onChange={e => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                        className="input-dark"
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
              <button type="button" onClick={() => setFillTarget(null)} className="btn-dark flex-1">
                Ακύρωση
              </button>
              <button
                type="submit"
                form="template-fill-form"
                disabled={generating}
                onClick={handleGenerate}
                className="btn-gold flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                {generating
                  ? <><Loader2 size={14} className="animate-spin" /> Δημιουργία...</>
                  : <><Download size={14} /> Δημιουργία DOCX</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewTarget(null)}>
          <div className="glass-card w-full max-w-md border border-[#1a3a5c]"
            onClick={e => e.stopPropagation()}>

            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">{previewTarget.name || previewTarget.title}</h3>
              <button onClick={() => setPreviewTarget(null)}
                className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {previewTarget.category && (
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${catColor(previewTarget)}`}>
                    {previewTarget.category}
                  </span>
                </div>
              )}

              {previewTarget.description && (
                <p className="text-sm text-[#8aa0b8]">{previewTarget.description}</p>
              )}

              {/* Fields list */}
              <div>
                <p className="text-xs font-semibold text-[#C6A75E] uppercase tracking-wider mb-3">
                  Πεδία Προτύπου ({(previewTarget.fields || []).length})
                </p>
                <div className="space-y-2">
                  {(previewTarget.fields || []).map((rawField, fi) => {
                    const f = normalizeField(rawField);
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
                  {(previewTarget.fields || []).length === 0 && (
                    <p className="text-sm text-[#4a6a8a] text-center py-2">Χωρίς δυναμικά πεδία</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => { setPreviewTarget(null); openFill(previewTarget); }}
                className="btn-gold w-full flex items-center justify-center gap-2">
                <Edit3 size={14} /> Συμπλήρωση &amp; Δημιουργία
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
