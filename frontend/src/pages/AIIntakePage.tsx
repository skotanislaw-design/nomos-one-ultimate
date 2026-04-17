import { useState, useCallback } from 'react';
import { Upload, Mail, Bot, FileText, CheckCircle, X, Send, Link, Zap, AlertCircle } from 'lucide-react';
import { lindyApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type IntakeTab = 'upload' | 'lindy' | 'email';

const LINDY_WEBHOOK = 'https://chat.lindy.ai/christos-skotaniss-workspace/lindy/legal-document-extractor-69db65ca7cf5099909310fa8/tasks';

export default function AIIntakePage() {
  const [activeTab, setActiveTab] = useState<IntakeTab>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lindyMessage, setLindyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const tabs = [
    { id: 'upload' as IntakeTab, label: 'Drag & Drop' },
    { id: 'lindy' as IntakeTab, label: 'Lindy AI' },
    { id: 'email' as IntakeTab, label: 'Email Intake' },
  ];

  // ── Drag & Drop ──
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped]);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const processFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of files) {
        try {
          // Forward via backend proxy (avoids CORS) — sends file metadata + content as base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await lindyApi.forward({
            source: 'drag_drop',
            message: `Document intake: ${file.name}`,
            metadata: {
              filename: file.name,
              size: file.size,
              type: file.type,
              content_base64: base64,
            },
          });
          setResults(prev => [...prev, {
            id: Date.now() + Math.random(),
            name: file.name,
            status: 'success',
            message: 'Αποστάλθηκε μέσω backend proxy στο Lindy AI',
            time: new Date().toLocaleTimeString('el-GR'),
          }]);
          successCount++;
        } catch (err: any) {
          setResults(prev => [...prev, {
            id: Date.now() + Math.random(),
            name: file.name,
            status: 'error',
            message: err?.response?.data?.detail || 'Αποτυχία αποστολής',
            time: new Date().toLocaleTimeString('el-GR'),
          }]);
        }
      }
      if (successCount > 0) toast.success(`${successCount} αρχεία στάλθηκαν στο Lindy AI`);
      setFiles([]);
    } finally {
      setUploading(false);
    }
  };

  // ── Lindy AI — routed through backend proxy to avoid CORS ──
  const sendToLindy = async () => {
    if (!lindyMessage.trim()) return;
    setSending(true);
    try {
      await lindyApi.forward({
        message: lindyMessage,
        source: 'manual_intake',
        metadata: { timestamp: new Date().toISOString() },
      });
      setResults(prev => [...prev, {
        id: Date.now(),
        name: 'Μήνυμα Lindy AI',
        status: 'success',
        message: lindyMessage.slice(0, 80) + (lindyMessage.length > 80 ? '...' : ''),
        time: new Date().toLocaleTimeString('el-GR'),
      }]);
      toast.success('Το μήνυμα εστάλη στο Lindy AI');
      setLindyMessage('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Αποτυχία αποστολής';
      setResults(prev => [...prev, {
        id: Date.now(),
        name: 'Μήνυμα Lindy AI',
        status: 'error',
        message: detail,
        time: new Date().toLocaleTimeString('el-GR'),
      }]);
      toast.error(detail);
    } finally {
      setSending(false);
    }
  };

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) return '📄';
    if (['doc', 'docx'].includes(ext || '')) return '📝';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return '🖼️';
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return '📊';
    return '📎';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">AI Document Intake</h2>
          <p className="page-subtitle">Εισαγωγή εγγράφων μέσω AI — Lindy Legal Extractor</p>
        </div>
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Lindy AI info banner */}
      <div className="glass-card p-4 border border-purple-500/20 border-l-4 border-l-purple-500/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#d4dce8]">Lindy AI Legal Document Extractor</p>
            <p className="text-xs text-[#5a7a9a] truncate">{LINDY_WEBHOOK}</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ενεργό
          </span>
        </div>
      </div>

      {/* ── Drag & Drop tab ── */}
      {activeTab === 'upload' && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all cursor-pointer
              ${dragOver
                ? 'border-[#C6A75E] bg-[#C6A75E]/5 scale-[1.01]'
                : 'border-[#1a3a5c] hover:border-[#C6A75E]/50 bg-[#0d2035]/20 hover:bg-[#0d2035]/40'
              }`}
            onClick={() => document.getElementById('file-input')?.click()}>
            <input id="file-input" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.csv"
              className="hidden" onChange={onFileChange} />
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all
              ${dragOver ? 'bg-[#C6A75E]/20' : 'bg-[#132B45]'}`}>
              <Upload size={28} className={dragOver ? 'text-[#C6A75E]' : 'text-[#5a7a9a]'} />
            </div>
            <p className="text-lg font-semibold text-[#d4dce8] mb-2">
              {dragOver ? 'Αφήστε τα αρχεία εδώ' : 'Σύρετε & αφήστε έγγραφα'}
            </p>
            <p className="text-sm text-[#5a7a9a]">ή κάντε κλικ για επιλογή αρχείων</p>
            <p className="text-xs text-[#3a5a7a] mt-2">PDF, Word, Excel, εικόνες — μέγιστο 50MB ανά αρχείο</p>
          </div>

          {/* Queued files */}
          {files.length > 0 && (
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="section-title">Αρχεία σε Ουρά ({files.length})</h3>
                <button onClick={processFiles} disabled={uploading}
                  className="btn-gold text-xs flex items-center gap-1.5 disabled:opacity-50">
                  {uploading ? (
                    <><span className="w-3 h-3 border border-[#071220]/40 border-t-[#071220] rounded-full animate-spin" /> Αποστολή...</>
                  ) : (
                    <><Send size={13} /> Αποστολή στο Lindy AI</>
                  )}
                </button>
              </div>
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/30">
                  <span className="text-2xl">{fileIcon(file.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#d4dce8] font-medium truncate">{file.name}</p>
                    <p className="text-xs text-[#5a7a9a]">{formatSize(file.size)}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#5a7a9a] hover:text-red-400 transition-all">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lindy AI tab ── */}
      {activeTab === 'lindy' && (
        <div className="space-y-5">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-700/20 flex items-center justify-center">
                <Bot size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="section-title">Lindy AI Extractor</h3>
                <p className="text-xs text-[#5a7a9a]">Αποστολή κειμένου ή περιγραφής υπόθεσης</p>
              </div>
            </div>

            <textarea
              value={lindyMessage}
              onChange={e => setLindyMessage(e.target.value)}
              placeholder="Περιγράψτε την υπόθεση ή επικολλήστε κείμενο εγγράφου για ανάλυση από το Lindy AI...&#10;&#10;Π.χ.: Σύμβαση εργασίας μεταξύ... / Εξώδικο με ημερομηνία... / Αίτηση αναστολής..."
              className="input-dark h-40 resize-none text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendToLindy();
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#4a6a8a]">Ctrl+Enter για αποστολή</p>
              <button onClick={sendToLindy} disabled={sending || !lindyMessage.trim()}
                className="btn-gold text-xs flex items-center gap-1.5 disabled:opacity-40">
                {sending ? (
                  <><span className="w-3 h-3 border border-[#071220]/40 border-t-[#071220] rounded-full animate-spin" /> Αποστολή...</>
                ) : (
                  <><Send size={13} /> Αποστολή στο Lindy</>
                )}
              </button>
            </div>
          </div>

          {/* Webhook info */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link size={14} className="text-[#C6A75E]" />
              <h4 className="text-xs font-semibold text-[#C6A75E] uppercase tracking-wider">Webhook Endpoint</h4>
            </div>
            <code className="text-xs text-[#8aa0b8] break-all bg-[#0d2035]/60 rounded-lg p-3 block">{LINDY_WEBHOOK}</code>
          </div>
        </div>
      )}

      {/* ── Email Intake tab ── */}
      {activeTab === 'email' && (
        <div className="space-y-5">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Mail size={20} className="text-blue-400" />
              </div>
              <div>
                <h3 className="section-title">Email Intake</h3>
                <p className="text-xs text-[#5a7a9a]">Αυτόματη εισαγωγή υποθέσεων μέσω email</p>
              </div>
            </div>

            {/* Dedicated intake email */}
            <div className="p-4 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40">
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">Dedicated Intake Email</p>
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono text-[#C6A75E]">intake@skotanislaw.com</code>
                <button onClick={() => { navigator.clipboard.writeText('intake@skotanislaw.com'); toast.success('Email αντιγράφηκε!'); }}
                  className="text-xs text-[#5a7a9a] hover:text-[#C6A75E] border border-[#1a3a5c] hover:border-[#C6A75E]/40 px-2 py-1 rounded transition-all">
                  Αντιγραφή
                </button>
              </div>
              <p className="text-xs text-[#4a6a8a] mt-2">Στείλτε έγγραφα σε αυτό το email και το Lindy AI θα τα επεξεργαστεί αυτόματα</p>
            </div>

            {/* SMTP Status */}
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-400" />
                <p className="text-sm font-medium text-amber-300">SMTP Placeholder</p>
              </div>
              <p className="text-xs text-[#7a9ab8] mt-1">Η ενσωμάτωση SMTP θα ρυθμιστεί από τις Ρυθμίσεις → AI & Integrations. Προς το παρόν χρησιμοποιείτε το Drag & Drop ή το Lindy AI.</p>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[#C6A75E] uppercase tracking-wider">Οδηγίες Χρήσης</p>
              {[
                { num: '1', text: 'Στείλτε email με συνημμένα έγγραφα (PDF, Word, εικόνες)' },
                { num: '2', text: 'Το Lindy AI αναλύει αυτόματα τα έγγραφα και εξάγει στοιχεία υπόθεσης' },
                { num: '3', text: 'Τα εξαγόμενα στοιχεία εμφανίζονται στη λίστα "Νέες Εισερχόμενες"' },
                { num: '4', text: 'Επιβεβαιώστε και αποθηκεύστε την υπόθεση στο σύστημα' },
              ].map(step => (
                <div key={step.num} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#C6A75E]/20 border border-[#C6A75E]/30 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#C6A75E]">{step.num}</div>
                  <p className="text-sm text-[#8aa0b8] pt-0.5">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results log ── */}
      {results.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="section-title">Αρχείο Εισαγωγών ({results.length})</h3>
            <button onClick={() => setResults([])} className="text-xs text-[#5a7a9a] hover:text-red-400 transition-colors">Εκκαθάριση</button>
          </div>
          {results.slice().reverse().map((r: any) => (
            <div key={r.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
              r.status === 'success'
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
            }`}>
              {r.status === 'success'
                ? <CheckCircle size={15} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                : <AlertCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#d4dce8] truncate">{r.name}</p>
                <p className="text-xs text-[#6a8aaa]">{r.message}</p>
              </div>
              <span className="text-[10px] text-[#4a6a8a] flex-shrink-0">{r.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
