import { useState, useCallback } from 'react';
import { Upload, FileText, FolderOpen, Search, Download, Trash2, Eye, Cloud, HardDrive, Link2, X, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { casesApi, documentsApi } from '@/lib/api';
import { toast } from 'sonner';
import { parseTs } from '@/lib/prefs';

type VaultTab = 'local' | 'drive' | 'recent';

export default function DocumentVaultPage() {
  const [activeTab, setActiveTab] = useState<VaultTab>('local');
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [driveConnected] = useState(false);

  const tabs = [
    { id: 'local' as VaultTab, label: 'Τοπικά' },
    { id: 'drive' as VaultTab, label: 'Google Drive' },
    { id: 'recent' as VaultTab, label: 'Πρόσφατα' },
  ];

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(file => {
      setDocs(prev => [...prev, {
        _id: Date.now().toString() + Math.random(),
        filename: file.name,
        size: file.size,
        created_at: new Date().toISOString(),
        source: 'local',
        type: file.type,
      }]);
    });
    toast.success(`${droppedFiles.length} αρχεία προστέθηκαν`);
  }, []);

  const fileIcon = (name: string) => {
    const ext = name?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['doc', 'docx'].includes(ext || '')) return '📝';
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) return '🖼️';
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return '📊';
    if (['zip', 'rar'].includes(ext || '')) return '🗜️';
    return '📎';
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filtered = docs.filter(d =>
    (d.filename || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: string) => {
    setDocs(prev => prev.filter(d => d._id !== id));
    setShowDeleteConfirm(null);
    toast.success('Αρχείο διαγράφηκε');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Θησαυροφυλάκιο Εγγράφων</h2><p className="page-subtitle">Κεντρική διαχείριση αρχείων</p></div>
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Storage stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-[3px] border-blue-500/40">
          <HardDrive size={18} className="text-blue-400 mb-2" />
          <p className="text-2xl font-bold text-white">{docs.length}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Τοπικά Αρχεία</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-green-500/40">
          <Cloud size={18} className="text-green-400 mb-2" />
          <p className="text-2xl font-bold text-green-400">—</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Drive Αρχεία</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-[#C6A75E]/40">
          <FileText size={18} className="text-[#C6A75E] mb-2" />
          <p className="text-2xl font-bold text-[#C6A75E]">{formatSize(docs.reduce((s, d) => s + (d.size || 0), 0))}</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Σύνολο Μέγεθος</p>
        </div>
        <div className="glass-card p-4 border-l-[3px] border-amber-500/40">
          <RefreshCw size={18} className="text-amber-400 mb-2" />
          <p className="text-2xl font-bold text-amber-400">—</p>
          <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Τελ. Συγχρ.</p>
        </div>
      </div>

      {/* ── Local tab ── */}
      {activeTab === 'local' && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer
              ${dragOver ? 'border-[#C6A75E] bg-[#C6A75E]/5' : 'border-[#1a3a5c] hover:border-[#C6A75E]/40 bg-[#0d2035]/10 hover:bg-[#0d2035]/20'}`}
            onClick={() => document.getElementById('vault-file-input')?.click()}>
            <input id="vault-file-input" type="file" multiple className="hidden"
              onChange={e => {
                if (e.target.files) {
                  const files = Array.from(e.target.files);
                  files.forEach(file => setDocs(prev => [...prev, {
                    _id: Date.now().toString() + Math.random(),
                    filename: file.name, size: file.size,
                    created_at: new Date().toISOString(), source: 'local', type: file.type,
                  }]));
                  toast.success(`${files.length} αρχεία προστέθηκαν`);
                }
              }} />
            <Upload size={32} className={`mx-auto mb-3 ${dragOver ? 'text-[#C6A75E]' : 'text-[#4a6a8a]'}`} />
            <p className="text-base font-semibold text-[#d4dce8]">Σύρετε αρχεία εδώ</p>
            <p className="text-xs text-[#5a7a9a] mt-1">ή κάντε κλικ για επιλογή</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
            <input type="text" placeholder="Αναζήτηση αρχείου..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-dark pl-9 text-xs" />
          </div>

          {/* Files list */}
          <div className="glass-card overflow-hidden table-scroll">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <FolderOpen size={40} className="mx-auto text-[#2a4a6a] mb-3" />
                <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν αρχεία. Ανεβάστε το πρώτο σας έγγραφο.</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead><tr className="bg-[#0d2035]/40"><th>Αρχείο</th><th className="hidden sm:table-cell">Τύπος</th><th className="hidden md:table-cell">Μέγεθος</th><th className="hidden lg:table-cell">Ημερομηνία</th><th>Ενέργειες</th></tr></thead>
                <tbody>
                  {filtered.map((doc: any) => (
                    <tr key={doc._id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{fileIcon(doc.filename)}</span>
                          <span className="text-sm text-[#d4dce8] font-medium truncate max-w-[200px]">{doc.filename}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell text-xs text-[#5a7a9a]">{doc.type || '—'}</td>
                      <td className="hidden md:table-cell font-mono text-xs">{formatSize(doc.size)}</td>
                      <td className="hidden lg:table-cell text-xs">{doc.created_at ? (parseTs(doc.created_at)?.toLocaleDateString('el-GR') ?? '—') : '—'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button title="Λήψη" className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                            <Download size={13} />
                          </button>
                          <button title="Διαγραφή" onClick={() => setShowDeleteConfirm(doc._id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-[#7a9ab8] hover:text-red-400 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Google Drive tab ── */}
      {activeTab === 'drive' && (
        <div className="space-y-5">
          {!driveConnected ? (
            <div className="glass-card p-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
                <Cloud size={32} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Σύνδεση με Google Drive</h3>
                <p className="text-sm text-[#7a9ab8] max-w-sm mx-auto">Συγχρονίστε αυτόματα τα έγγραφα σας με το Google Drive για ασφαλή αποθήκευση και πρόσβαση από παντού.</p>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-left max-w-sm mx-auto">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} className="text-blue-400" />
                  <p className="text-xs font-semibold text-blue-300">Ρύθμιση απαιτείται</p>
                </div>
                <p className="text-xs text-[#7a9ab8]">Για να ενεργοποιήσετε το Google Drive, ρυθμίστε το OAuth client JSON στις <strong className="text-[#c0d0e0]">Ρυθμίσεις → Integrations → Google Drive</strong>.</p>
              </div>

              <button
                onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                className="btn-gold flex items-center gap-2 mx-auto">
                <Link2 size={14} /> Μετάβαση στις Ρυθμίσεις
              </button>

              {/* Features */}
              <div className="grid grid-cols-3 gap-4 mt-4 text-left">
                {[
                  { title: 'Αυτόματος Συγχρονισμός', desc: 'Κάθε αλλαγή αποθηκεύεται άμεσα' },
                  { title: 'Ασφαλής Αποθήκευση', desc: 'Κρυπτογραφημένη μεταφορά' },
                  { title: 'Κοινή Πρόσβαση', desc: 'Μοιραστείτε με συνεργάτες' },
                ].map(f => (
                  <div key={f.title} className="p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/30">
                    <p className="text-xs font-semibold text-[#C6A75E] mb-1">{f.title}</p>
                    <p className="text-[10px] text-[#5a7a9a]">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[#5a7a9a]">Συνδεδεμένο με Google Drive</p>
          )}
        </div>
      )}

      {/* ── Recent tab ── */}
      {activeTab === 'recent' && (
        <div className="glass-card p-6">
          <h3 className="section-title mb-4">Πρόσφατη Δραστηριότητα</h3>
          {docs.length === 0 ? (
            <p className="text-center text-sm text-[#5a7a9a] py-8">Δεν υπάρχει πρόσφατη δραστηριότητα.</p>
          ) : (
            <div className="space-y-2">
              {docs.slice().reverse().slice(0, 20).map((doc: any) => (
                <div key={doc._id} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d2035]/30 border border-[#1a3a5c]/20">
                  <span className="text-xl">{fileIcon(doc.filename)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#d4dce8] font-medium truncate">{doc.filename}</p>
                    <p className="text-xs text-[#5a7a9a]">Προστέθηκε • {doc.created_at ? (parseTs(doc.created_at)?.toLocaleString('el-GR') ?? '—') : '—'}</p>
                  </div>
                  <span className="text-xs text-[#4a6a8a]">{formatSize(doc.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(null)}>
          <div className="glass-card w-full max-w-sm border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white">Διαγραφή Αρχείου;</h3>
                <p className="text-sm text-[#7a9ab8] mt-1">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="btn-dark flex-1">Ακύρωση</button>
                <button onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-all">
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
