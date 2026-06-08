import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, Upload, Loader2, LogOut, FileText, Clock, CheckCircle,
  AlertCircle, DollarSign, MessageSquare, Phone, Scale, X, Gavel,
  CalendarDays, ChevronRight, Building2, Smartphone, Banknote, CreditCard,
  Plus, Trash2, CheckSquare
} from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '@/lib/api';
import { toast } from 'sonner';
import { parseTs } from '@/lib/prefs';

type Tab = 'overview' | 'messages' | 'documents' | 'financials' | 'progress';

interface StagedFile { file: File; id: string; }

export default function ClientPortalPage() {
  const { user, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [caseData, setCaseData]       = useState<any>(null);
  const [messages, setMessages]       = useState<any[]>([]);
  const [progress, setProgress]       = useState<any>(null);
  const [financials, setFinancials]   = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [mandatePending, setMandatePending] = useState(false);
  const [mandateAccepting, setMandateAccepting] = useState(false);

  // Messages
  const [msgContent, setMsgContent]   = useState('');
  const [msgSending, setMsgSending]   = useState(false);
  const msgBottomRef = useRef<HTMLDivElement>(null);

  // Documents
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading]     = useState<string | null>(null);
  const [confirming, setConfirming]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) { navigate('/portal/login'); return null; }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'messages' && messages.length) {
      msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, messages]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [caseRes, msgsRes, progressRes, finRes] = await Promise.allSettled([
        portalApi.getCase(),
        portalApi.getMessages(),
        portalApi.getProgress(),
        portalApi.getFinancials(),
      ]);
      if (caseRes.status === 'fulfilled') {
        const cd = caseRes.value.data;
        setCaseData(cd);
        if (!cd?.mandate_accepted) setMandatePending(true);
      }
      if (msgsRes.status === 'fulfilled')     setMessages(msgsRes.value.data || []);
      if (progressRes.status === 'fulfilled') setProgress(progressRes.value.data);
      if (finRes.status === 'fulfilled')      setFinancials(finRes.value.data);
    } catch (err) {
      toast.error('Σφάλμα φόρτωσης');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgContent.trim()) return;
    setMsgSending(true);
    try {
      await portalApi.sendMessage(msgContent);
      toast.success('Μήνυμα στάλθηκε');
      setMsgContent('');
      const res = await portalApi.getMessages();
      setMessages(res.data || []);
      setTimeout(() => msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής');
    } finally {
      setMsgSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    if (!files.length) return;
    e.currentTarget.value = '';

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name}: πολύ μεγάλο (max 50MB)`);
        continue;
      }
      const tempId = Math.random().toString(36).slice(2);
      setStagedFiles(prev => [...prev, { file, id: tempId }]);
      setUploading(file.name);
      try {
        await portalApi.uploadDocument(file);
      } catch (err: any) {
        toast.error(`${file.name}: ${err.response?.data?.detail || 'Σφάλμα'}`);
        setStagedFiles(prev => prev.filter(f => f.id !== tempId));
      } finally {
        setUploading(null);
      }
    }
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleConfirmUpload = async () => {
    if (!stagedFiles.length) return;
    setConfirming(true);
    try {
      await portalApi.confirmUpload();
      toast.success('Τα έγγραφα στάλθηκαν στον δικηγόρο σας');
      setStagedFiles([]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής');
    } finally {
      setConfirming(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/portal/login'); };

  const fmtDate = (d: string | null | undefined, withTime = false) => {
    if (!d) return '—';
    try {
      const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
      return (parseTs(d) ?? new Date(d)).toLocaleDateString('el-GR', opts);
    } catch { return d; }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',   label: 'Επισκόπηση',  icon: <Scale size={15} /> },
    { id: 'messages',   label: 'Επικοινωνία', icon: <MessageSquare size={15} /> },
    { id: 'documents',  label: 'Έγγραφα',     icon: <FileText size={15} /> },
    { id: 'financials', label: 'Χρεώσεις',    icon: <DollarSign size={15} /> },
    { id: 'progress',   label: 'Εξέλιξη',     icon: <CalendarDays size={15} /> },
  ];

  const handleAcceptMandate = async () => {
    setMandateAccepting(true);
    try {
      await portalApi.acceptMandate();
      setMandatePending(false);
      setCaseData((cd: any) => cd ? { ...cd, mandate_accepted: true } : cd);
      toast.success('Η εντολή αποδέχθηκε. Θα λάβετε email επιβεβαίωσης.');
    } catch {
      toast.error('Σφάλμα αποδοχής. Δοκιμάστε ξανά.');
    } finally {
      setMandateAccepting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin mx-auto mb-4" />
        <p className="text-sm text-[#6a8aaa]">Φόρτωση...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      {/* Header */}
      <header className="border-b border-[#1a3a5c]/40 sticky top-0 z-40" style={{ background: 'rgba(7,18,32,0.92)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
              <Scale size={15} className="text-[#071220]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Πύλη Πελάτη</h1>
              <p className="text-[10px] text-[#6a8aaa]">Σκοτάνης & Συνεργάτες</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm font-medium text-white">{user.name}</span>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400 transition-colors cursor-pointer" title="Αποσύνδεση">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 flex gap-1 overflow-x-auto pb-0 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-[#C6A75E] text-[#C6A75E]'
                  : 'border-transparent text-[#6a8aaa] hover:text-white'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 lg:px-6 py-6">

        {/* ═══════════ OVERVIEW ═══════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {caseData ? (
              <>
                <div className="glass-card p-6 border border-[#1a3a5c]">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Scale size={18} className="text-[#C6A75E]" /> Πληροφορίες Υπόθεσης
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Τίτλος', value: caseData.title },
                      { label: 'Αριθμός Υπόθεσης', value: caseData.case_number, mono: true },
                      { label: 'Κατάσταση', value: caseData.status },
                      { label: 'Κατηγορία', value: caseData.category },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="p-4 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/30">
                        <p className="text-xs text-[#6a8aaa] mb-1">{label}</p>
                        <p className={`text-sm font-medium text-white ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lawyer card */}
                {(caseData.lawyer_name || caseData.lawyer) && (
                  <div className="glass-card p-5 border border-[#1a3a5c]">
                    <h3 className="text-sm font-semibold text-white mb-3">Υπεύθυνος Δικηγόρος</h3>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
                        <span className="text-xs font-bold text-[#071220]">
                          {((caseData.lawyer?.name || caseData.lawyer_name) || 'Δ').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{caseData.lawyer?.name || caseData.lawyer_name || '—'}</p>
                        <p className="text-xs text-[#C6A75E]">Δικηγόρος</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {(caseData.lawyer?.email || caseData.lawyer_email) && (
                        <a href={`mailto:${caseData.lawyer?.email || caseData.lawyer_email}`} className="flex items-center gap-2 text-xs text-[#8aa0b8] hover:text-[#C6A75E] transition-colors">
                          <Mail size={12} /> {caseData.lawyer?.email || caseData.lawyer_email}
                        </a>
                      )}
                      {(caseData.lawyer?.phone || caseData.lawyer_phone) && (
                        <a href={`tel:${caseData.lawyer?.phone || caseData.lawyer_phone}`} className="flex items-center gap-2 text-xs text-[#8aa0b8] hover:text-[#C6A75E] transition-colors">
                          <Phone size={12} /> {caseData.lawyer?.phone || caseData.lawyer_phone}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Μηνύματα', value: messages.length, tab: 'messages' as Tab, color: 'text-blue-400' },
                    { label: 'Ανεξόφλητο', value: financials ? `€${financials.outstanding?.toFixed(2)}` : '—', tab: 'financials' as Tab, color: (financials?.outstanding || 0) > 0 ? 'text-red-400' : 'text-emerald-400' },
                    { label: 'Επόμενη Δικάσιμος', value: progress?.upcoming_hearings?.[0] ? fmtDate(progress.upcoming_hearings[0].hearing_date) : '—', tab: 'progress' as Tab, color: 'text-amber-400' },
                  ].map(({ label, value, tab, color }) => (
                    <button key={label} onClick={() => setActiveTab(tab)} className="glass-card p-4 border border-[#1a3a5c] text-left hover:border-[#C6A75E]/30 transition-colors cursor-pointer group">
                      <p className="text-[10px] text-[#6a8aaa] mb-1">{label}</p>
                      <p className={`text-base font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-[#5a7a9a] mt-1 group-hover:text-[#C6A75E] transition-colors">Δείτε περισσότερα →</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="glass-card p-12 border border-[#1a3a5c] text-center">
                <AlertCircle size={32} className="mx-auto mb-4 text-[#5a7a9a]" />
                <p className="text-sm text-[#8aa0b8]">Δεν βρέθηκαν στοιχεία υπόθεσης.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ MESSAGES ═══════════ */}
        {activeTab === 'messages' && (
          <div className="glass-card border border-[#1a3a5c] flex flex-col" style={{ minHeight: '70vh' }}>
            <div className="p-5 border-b border-[#1a3a5c]/40">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <MessageSquare size={16} className="text-[#C6A75E]" /> Επικοινωνία με Δικηγόρο
              </h2>
              <p className="text-xs text-[#6a8aaa] mt-0.5">Ο δικηγόρος σας θα απαντήσει το συντομότερο δυνατό.</p>
            </div>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ maxHeight: 'calc(70vh - 200px)' }}>
              {messages.length === 0 && (
                <p className="text-sm text-[#6a8aaa] text-center py-8">Δεν υπάρχουν μηνύματα ακόμα. Στείλτε το πρώτο σας μήνυμα!</p>
              )}
              {messages.map((msg, i) => (
                <React.Fragment key={msg.id || i}>
                  {/* Client message */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-[#C6A75E]/10 border border-[#C6A75E]/20 rounded-xl rounded-tr-sm px-4 py-3">
                      <p className="text-xs text-[#C6A75E] font-medium mb-1">{msg.client_name || user.name}</p>
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] text-[#6a8aaa] mt-1.5 text-right">{fmtDate(msg.created_at, true)}</p>
                    </div>
                  </div>
                  {/* Lawyer replies */}
                  {(msg.replies || []).map((reply: any, ri: number) => (
                    <div key={ri} className="flex justify-start">
                      <div className="max-w-[80%] bg-[#0d2035]/80 border border-[#1a3a5c] rounded-xl rounded-tl-sm px-4 py-3">
                        <p className="text-xs text-[#C6A75E] font-medium mb-1">{reply.author || 'Δικηγόρος'}</p>
                        <p className="text-sm text-white whitespace-pre-wrap">{reply.content}</p>
                        <p className="text-[10px] text-[#6a8aaa] mt-1.5">{fmtDate(reply.created_at, true)}</p>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              ))}
              <div ref={msgBottomRef} />
            </div>

            {/* Compose */}
            <div className="p-4 border-t border-[#1a3a5c]/40">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <textarea
                  value={msgContent}
                  onChange={e => setMsgContent(e.target.value)}
                  placeholder="Γράψτε το μήνυμά σας..."
                  rows={2}
                  className="input-dark flex-1 resize-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); }
                  }}
                />
                <button type="submit" disabled={msgSending || !msgContent.trim()} className="btn-gold px-4 flex items-center gap-1.5 self-end cursor-pointer disabled:opacity-50">
                  {msgSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════ DOCUMENTS ═══════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="glass-card p-6 border border-[#1a3a5c]">
              <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                <Upload size={16} className="text-[#C6A75E]" /> Ανέβασμα Εγγράφων
              </h2>
              <p className="text-xs text-[#6a8aaa] mb-5">Επιλέξτε ένα ή περισσότερα αρχεία και στη συνέχεια πατήστε «Αποστολή» για να τα στείλετε στον δικηγόρο σας.</p>

              {/* Drop zone */}
              <label className="block cursor-pointer">
                <div className="border-2 border-dashed border-[#1a3a5c]/60 hover:border-[#C6A75E]/40 rounded-xl p-8 text-center transition-colors">
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={24} className="text-[#C6A75E] animate-spin" />
                      <p className="text-sm text-[#C6A75E]">Ανέβασμα: {uploading}</p>
                    </div>
                  ) : (
                    <>
                      <Plus size={24} className="mx-auto mb-2 text-[#6a8aaa]" />
                      <p className="text-sm font-medium text-white mb-1">Προσθήκη αρχείων</p>
                      <p className="text-xs text-[#6a8aaa]">PDF, Word, εικόνες · max 50MB ανά αρχείο</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} disabled={!!uploading} className="hidden" />
              </label>

              {/* Staged list */}
              {stagedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-[#8aa0b8] font-medium">Αρχεία για αποστολή ({stagedFiles.length}):</p>
                  {stagedFiles.map(sf => (
                    <div key={sf.id} className="flex items-center gap-3 p-3 bg-[#0d2035]/50 rounded-lg border border-[#1a3a5c]/30">
                      <FileText size={14} className="text-[#C6A75E] flex-shrink-0" />
                      <span className="text-sm text-white flex-1 truncate">{sf.file.name}</span>
                      <span className="text-xs text-[#6a8aaa]">{(sf.file.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => handleRemoveStagedFile(sf.id)} className="p-1 hover:bg-red-500/10 rounded text-[#6a8aaa] hover:text-red-400 transition-colors cursor-pointer">
                        <X size={13} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={handleConfirmUpload}
                    disabled={confirming}
                    className="btn-gold w-full mt-3 py-3 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {confirming ? (
                      <><Loader2 size={14} className="animate-spin" /> Αποστολή...</>
                    ) : (
                      <><CheckSquare size={14} /> Αποστολή ({stagedFiles.length} αρχεία)</>
                    )}
                  </button>
                </div>
              )}

              {stagedFiles.length === 0 && !uploading && (
                <p className="text-xs text-[#5a7a9a] mt-3 text-center">
                  Αφού προσθέσετε τα αρχεία σας, επιβεβαιώστε την αποστολή με το κουμπί «Αποστολή».
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ FINANCIALS ═══════════ */}
        {activeTab === 'financials' && (
          <div className="space-y-5">
            {financials ? (
              <>
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Σύνολο Αμοιβών', value: financials.total, color: 'text-white' },
                    { label: 'Εξοφλημένο', value: financials.paid, color: 'text-emerald-400' },
                    { label: 'Ανεξόφλητο', value: financials.outstanding, color: financials.outstanding > 0 ? 'text-red-400' : 'text-emerald-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="glass-card p-4 border border-[#1a3a5c] text-center">
                      <p className="text-[10px] text-[#6a8aaa] mb-1">{label}</p>
                      <p className={`text-lg font-bold ${color}`}>€{(value || 0).toFixed(2)}</p>
                    </div>
                  ))}
                </div>

                {/* VAT notice */}
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <strong>Σημείωση:</strong> Τα ποσά δεν περιλαμβάνουν ΦΠΑ. Σε περίπτωση επιτηδευματία εφαρμόζεται παρακράτηση φόρου 20% επί της αμοιβής.
                  </p>
                </div>

                {/* Invoice breakdown */}
                {financials.invoices?.length > 0 && (
                  <div className="glass-card border border-[#1a3a5c]">
                    <div className="p-4 border-b border-[#1a3a5c]/40">
                      <h3 className="text-sm font-semibold text-white">Τιμολόγια</h3>
                    </div>
                    <div className="divide-y divide-[#1a3a5c]/30">
                      {financials.invoices.map((inv: any) => (
                        <div key={inv.id} className="p-4 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{inv.description}</p>
                            <p className="text-xs text-[#6a8aaa] mt-0.5">
                              {inv.invoice_number && <span className="font-mono mr-2">#{inv.invoice_number}</span>}
                              {inv.date}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium text-[#C6A75E]">€{inv.total.toFixed(2)}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                              inv.status === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-red-500/10 text-red-400'
                            }`}>
                              {inv.status === 'paid' ? 'Εξοφλημένο' : inv.status === 'partial' ? 'Μερικώς' : 'Εκκρεμεί'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment methods */}
                <div className="glass-card border border-[#1a3a5c]">
                  <div className="p-4 border-b border-[#1a3a5c]/40">
                    <h3 className="text-sm font-semibold text-white">Τρόποι Πληρωμής</h3>
                  </div>
                  <div className="p-4 space-y-4">

                    {/* Bank transfer */}
                    <div className="p-4 bg-[#0d2035]/50 rounded-xl border border-[#1a3a5c]/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 size={15} className="text-[#C6A75E]" />
                        <p className="text-sm font-semibold text-white">Κατάθεση / Εμβασμα</p>
                      </div>
                      {financials.bank_accounts?.length > 0 ? (
                        <div className="space-y-3">
                          {financials.bank_accounts.map((acc: any, i: number) => (
                            <div key={i} className="space-y-1">
                              <p className="text-xs font-medium text-[#C6A75E]">{acc.bank}</p>
                              <p className="text-xs text-[#8aa0b8]">IBAN: <span className="font-mono text-white">{acc.iban}</span></p>
                              {acc.name && <p className="text-xs text-[#8aa0b8]">Δικαιούχος: {acc.name}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#6a8aaa]">Επικοινωνήστε με το γραφείο για στοιχεία κατάθεσης.</p>
                      )}
                    </div>

                    {/* IRIS */}
                    <div className="p-4 bg-[#0d2035]/50 rounded-xl border border-[#1a3a5c]/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Smartphone size={15} className="text-[#C6A75E]" />
                        <p className="text-sm font-semibold text-white">IRIS / Web Banking</p>
                      </div>
                      <p className="text-xs text-[#8aa0b8]">
                        Χρησιμοποιήστε τα στοιχεία IBAN παραπάνω μέσω της εφαρμογής της τράπεζάς σας ή του IRIS.
                      </p>
                    </div>

                    {/* Cash */}
                    <div className="p-4 bg-[#0d2035]/50 rounded-xl border border-[#1a3a5c]/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Banknote size={15} className="text-[#C6A75E]" />
                        <p className="text-sm font-semibold text-white">Μετρητά</p>
                      </div>
                      <p className="text-xs text-[#8aa0b8]">
                        Πληρωμή με μετρητά στα γραφεία μας κατόπιν συνεννόησης.
                      </p>
                    </div>

                    <p className="text-[10px] text-[#5a7a9a] pt-1">
                      Αν έχετε ερωτήσεις σχετικά με τη χρέωσή σας, επικοινωνήστε με το γραφείο μας.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card p-12 border border-[#1a3a5c] text-center">
                <DollarSign size={32} className="mx-auto mb-4 text-[#5a7a9a]" />
                <p className="text-sm text-[#8aa0b8]">Δεν υπάρχουν οικονομικά στοιχεία διαθέσιμα.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ PROGRESS ═══════════ */}
        {activeTab === 'progress' && (
          <div className="space-y-5">
            {progress ? (
              <>
                {/* Next / last action */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass-card p-5 border border-[#1a3a5c]">
                    <p className="text-xs text-[#6a8aaa] mb-1">Τελευταία Ενέργεια</p>
                    <p className="text-sm font-medium text-white">{progress.last_action || '—'}</p>
                  </div>
                  <div className="glass-card p-5 border border-[#1a3a5c]">
                    <p className="text-xs text-[#6a8aaa] mb-1">Επόμενη Ενέργεια</p>
                    <p className="text-sm font-medium text-white">{progress.next_action || '—'}</p>
                  </div>
                </div>

                {/* Upcoming hearings */}
                <div className="glass-card border border-[#1a3a5c]">
                  <div className="p-4 border-b border-[#1a3a5c]/40 flex items-center gap-2">
                    <Gavel size={15} className="text-[#C6A75E]" />
                    <h3 className="text-sm font-semibold text-white">Επερχόμενες Δικάσιμοι</h3>
                  </div>
                  {progress.upcoming_hearings?.length > 0 ? (
                    <div className="divide-y divide-[#1a3a5c]/30">
                      {progress.upcoming_hearings.map((h: any, i: number) => (
                        <div key={h.id || i} className="p-4 flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-blue-400 leading-none">{fmtDate(h.hearing_date).split(' ')[2] || ''}</span>
                            <span className="text-sm font-bold text-blue-400 leading-none">{fmtDate(h.hearing_date).split(' ')[0] || ''}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{h.court || '—'}</p>
                            <p className="text-xs text-[#8aa0b8] mt-0.5">{fmtDate(h.hearing_date, true)}</p>
                            {h.notes && <p className="text-xs text-[#6a8aaa] mt-1">{h.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-[#6a8aaa]">Δεν υπάρχουν προσεχείς δικάσιμοι.</p>
                  )}
                </div>

                {/* Upcoming deadlines */}
                <div className="glass-card border border-[#1a3a5c]">
                  <div className="p-4 border-b border-[#1a3a5c]/40 flex items-center gap-2">
                    <CalendarDays size={15} className="text-[#C6A75E]" />
                    <h3 className="text-sm font-semibold text-white">Επερχόμενες Προθεσμίες</h3>
                  </div>
                  {progress.upcoming_deadlines?.length > 0 ? (
                    <div className="divide-y divide-[#1a3a5c]/30">
                      {progress.upcoming_deadlines.map((d: any, i: number) => (
                        <div key={d.id || i} className="p-4 flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{d.title || d.description || '—'}</p>
                            <p className="text-xs text-amber-400 mt-0.5">{fmtDate(d.date)}</p>
                            {d.notes && <p className="text-xs text-[#6a8aaa] mt-1">{d.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-[#6a8aaa]">Δεν υπάρχουν προσεχείς προθεσμίες.</p>
                  )}
                </div>

                {/* Past hearings */}
                {progress.past_hearings?.length > 0 && (
                  <div className="glass-card border border-[#1a3a5c]">
                    <div className="p-4 border-b border-[#1a3a5c]/40">
                      <h3 className="text-sm font-semibold text-white text-opacity-70">Προηγούμενες Δικάσιμοι</h3>
                    </div>
                    <div className="divide-y divide-[#1a3a5c]/30">
                      {[...progress.past_hearings].reverse().map((h: any, i: number) => (
                        <div key={h.id || i} className="p-4 flex items-start gap-3 opacity-60">
                          <CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-white">{h.court || '—'}</p>
                            <p className="text-xs text-[#8aa0b8]">{fmtDate(h.hearing_date, true)}</p>
                            {h.outcome && <p className="text-xs text-emerald-400 mt-0.5">{h.outcome}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="glass-card p-12 border border-[#1a3a5c] text-center">
                <CalendarDays size={32} className="mx-auto mb-4 text-[#5a7a9a]" />
                <p className="text-sm text-[#8aa0b8]">Δεν υπάρχουν στοιχεία εξέλιξης ακόμα.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Mandate Modal (blocking — cannot be dismissed) ── */}
      {mandatePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(7,18,32,0.97)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-2xl my-4 rounded-2xl border border-[#C6A75E]/30 overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(180deg,#0d1f35,#071220)' }}>

            {/* Header */}
            <div className="px-8 py-6 border-b border-[#C6A75E]/20" style={{ background: 'rgba(198,167,94,0.07)' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0">
                  <Scale size={16} className="text-[#071220]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Εντολή Παροχής Νομικών Υπηρεσιών</h2>
                  <p className="text-xs text-[#C6A75E]/80">Σκοτάνης &amp; Συνεργάτες — Δικηγορικό Γραφείο</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-5">
              {/* Case info */}
              <div className="rounded-xl border border-[#1a3a5c] bg-[#0d2035]/60 p-4 space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-[#4a6a8a] mb-3">Στοιχεία Υπόθεσης</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div><span className="text-[#5a7a9a] text-xs">Τίτλος: </span><span className="text-[#d4dce8] font-medium">{caseData?.title || '—'}</span></div>
                  <div><span className="text-[#5a7a9a] text-xs">Κατηγορία: </span><span className="text-[#d4dce8] font-medium">{caseData?.category || '—'}</span></div>
                  <div className="sm:col-span-2"><span className="text-[#5a7a9a] text-xs">Αντικείμενο: </span><span className="text-[#d4dce8] font-medium">{caseData?.case_subject || '—'}</span></div>
                  <div><span className="text-[#5a7a9a] text-xs">Εντολέας: </span><span className="text-[#d4dce8] font-medium">{user?.client_name || '—'}</span></div>
                </div>
              </div>

              {/* Mandate text */}
              <div className="rounded-xl border border-[#1a3a5c]/60 bg-[#071220]/60 p-5 max-h-64 overflow-y-auto text-[13px] text-[#b0c4d8] leading-relaxed space-y-3">
                <p><strong className="text-[#d4dce8]">ΕΝΤΟΛΗ ΠΑΡΟΧΗΣ ΝΟΜΙΚΩΝ ΥΠΗΡΕΣΙΩΝ</strong></p>

                <p>Ο κάτωθι υπογράφων, <strong className="text-[#d4dce8]">{user?.client_name || '(Εντολέας)'}</strong>, εφεξής «Εντολέας», με την παρούσα εντέλλομαι και εξουσιοδοτώ το δικηγορικό γραφείο <strong className="text-[#d4dce8]">Σκοτάνης &amp; Συνεργάτες</strong>, εφεξής «Εντολοδόχος», να αναλάβει και να χειρισθεί πλήρως την ανωτέρω νομική υπόθεσή μου, συμπεριλαμβανομένης κάθε δικαστικής και εξωδικαστικής ενέργειας που κριθεί αναγκαία.</p>

                <p><strong className="text-[#d4dce8]">Αμοιβή:</strong> Δηλώνω ότι έχω ενημερωθεί και αποδέχομαι ανεπιφύλακτα τη συμφωνηθείσα προφορικώς αμοιβή του Εντολοδόχου, δεσμευόμενος να την αποπληρώσω εμπρόθεσμα. Αναγνωρίζω ότι η αμοιβή αυτή δεν περιλαμβάνει τυχόν δικαστικά έξοδα, γραμμάτια προκαταβολής εισφορών προς τον Δικηγορικό Σύλλογο, παράβολα, ένσημα και λοιπές δαπάνες διεξαγωγής της υπόθεσης, τα οποία βαρύνουν εξ ολοκλήρου τον Εντολέα.</p>

                <p><strong className="text-[#d4dce8]">Εξουσιοδότηση:</strong> Χορηγώ ρητά στον Εντολοδόχο κάθε εξουσία για την κατάθεση δικογράφων, την εκπροσώπηση ενώπιον παντός δικαστηρίου ή αρχής, τη σύναψη συμβιβασμού υπό την έγκρισή μου, καθώς και για κάθε άλλη ενέργεια απαραίτητη για την προστασία των συμφερόντων μου.</p>

                <p><strong className="text-[#d4dce8]">Ψηφιακή Αποδοχή:</strong> Η παρούσα εντολή αποδέχεται ψηφιακά μέσω της ηλεκτρονικής πλατφόρμας Client Portal. Η ψηφιακή αποδοχή ισοδυναμεί με ιδιόχειρη υπογραφή βάσει του ν. 3979/2011 και του Κανονισμού (ΕΕ) 910/2014 (eIDAS). Θα αποσταλεί αυτόματα επιβεβαίωση στη δηλωθείσα ηλεκτρονική διεύθυνσή μου.</p>
              </div>

              {/* Consent notice */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  Η πρόσβαση στην πλατφόρμα προϋποθέτει την αποδοχή της εντολής. Διαβάστε προσεκτικά το κείμενο πριν αποδεχθείτε. Αν έχετε απορίες, επικοινωνήστε με το γραφείο πριν προχωρήσετε.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-[#1a3a5c]/40 flex flex-col sm:flex-row gap-3 items-center justify-between"
              style={{ background: 'rgba(13,32,53,0.8)' }}>
              <p className="text-[11px] text-[#4a6a8a]">
                Η αποδοχή καταγράφεται με timestamp &amp; IP για αποδεικτικούς σκοπούς.
              </p>
              <button
                onClick={handleAcceptMandate}
                disabled={mandateAccepting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#C6A75E,#A8893D)', color: '#071220' }}
              >
                {mandateAccepting
                  ? <><Loader2 size={16} className="animate-spin" /> Αποθήκευση...</>
                  : <><CheckCircle size={16} /> Αποδέχομαι την Εντολή</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
