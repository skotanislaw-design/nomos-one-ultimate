import React, { useState, useEffect } from 'react';
import { Mail, Send, Upload, Loader2, LogOut, FileText, Clock, CheckCircle, AlertCircle, DollarSign, MessageSquare } from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '@/lib/api';
import { toast } from 'sonner';

export default function ClientPortalPage() {
  const { user, logout } = usePortalAuth();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageContent, setMessageContent] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  if (!user) {
    navigate('/portal/login');
    return null;
  }

  // Load case data and events
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [caseRes, eventsRes] = await Promise.all([
          portalApi.getCase().catch(() => ({ data: null })),
          portalApi.getEvents().catch(() => ({ data: [] })),
        ]);
        setCaseData(caseRes?.data || null);
        setEvents(eventsRes?.data || []);
      } catch (err) {
        console.error('Error loading portal data:', err);
        toast.error('Σφάλμα φόρτωσης δεδομένων');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim()) {
      toast.error('Παρακαλώ γράψτε ένα μήνυμα');
      return;
    }
    setMessageSending(true);
    try {
      await portalApi.sendMessage(messageContent);
      toast.success('Μήνυμα στάλθηκε');
      setMessageContent('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής μηνύματος');
    } finally {
      setMessageSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('Το αρχείο είναι πολύ μεγάλο (max 50MB)');
      return;
    }

    setUploadingFile(true);
    try {
      await portalApi.uploadDocument(file);
      toast.success('Έγγραφο ανεβάστηκε επιτυχώς');
      e.currentTarget.value = '';
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα ανεβάσματος');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const formatEventLabel = (type: string): string => {
    const labels: Record<string, string> = {
      CREATE_NOTE: 'Σημείωση προστέθηκε',
      UPDATE_CASE: 'Υπόθεση ενημερώθηκε',
      CREATE_FINANCIAL: 'Χρέωση προστέθηκε',
      CREATE_DOCUMENT: 'Έγγραφο ανεβάστηκε',
      CREATE_INVOICE: 'Τιμολόγιο εκδόθηκε',
      UPDATE_STATUS: 'Κατάσταση άλλαξε',
    };
    return labels[type] || type;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'CREATE_INVOICE':
        return <DollarSign size={14} className="text-amber-400" />;
      case 'UPDATE_STATUS':
        return <CheckCircle size={14} className="text-emerald-400" />;
      case 'CREATE_DOCUMENT':
        return <FileText size={14} className="text-blue-400" />;
      case 'CREATE_FINANCIAL':
        return <AlertCircle size={14} className="text-yellow-400" />;
      default:
        return <Clock size={14} className="text-[#6a8aaa]" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6a8aaa]">Φόρτωση...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      {/* Header */}
      <header className="border-b border-[#1a3a5c]/40 sticky top-0 z-40" style={{ background: 'rgba(7,18,32,0.8)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Πύλη Πελάτη</h1>
            <p className="text-xs text-[#6a8aaa]">Σκοτάνης & Συνεργάτες</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-[#6a8aaa]">Πελάτης</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400 transition-colors"
              title="Αποσύνδεση"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* Case Overview */}
        {caseData && (
          <div className="glass-card p-6 border border-[#1a3a5c]">
            <h2 className="text-lg font-semibold text-white mb-4">Πληροφορίες Υπόθεσης</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Case Title */}
              <div className="p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                <p className="text-xs text-[#6a8aaa] mb-1">Τίτλος Υπόθεσης</p>
                <p className="text-sm font-medium text-white">{caseData.title || '—'}</p>
              </div>

              {/* Case Number */}
              <div className="p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                <p className="text-xs text-[#6a8aaa] mb-1">Αριθμός Υπόθεσης</p>
                <p className="text-sm font-medium text-white font-mono">{caseData.number || '—'}</p>
              </div>

              {/* Status */}
              <div className="p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                <p className="text-xs text-[#6a8aaa] mb-1">Κατάσταση</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    caseData.status === 'active' ? 'bg-emerald-400' :
                    caseData.status === 'closed' ? 'bg-slate-400' :
                    'bg-amber-400'
                  }`} />
                  <p className="text-sm font-medium text-white">{caseData.status || '—'}</p>
                </div>
              </div>

              {/* Category */}
              <div className="p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                <p className="text-xs text-[#6a8aaa] mb-1">Κατηγορία</p>
                <p className="text-sm font-medium text-white">{caseData.category || '—'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Lawyer Info & Fees */}
          <div className="space-y-6">
            {/* Lawyer Card */}
            {caseData?.lawyer && (
              <div className="glass-card p-6 border border-[#1a3a5c]">
                <h3 className="text-sm font-semibold text-white mb-4">Δικηγόρος</h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
                    <span className="text-sm font-bold text-[#071220]">
                      {(caseData.lawyer?.name || 'X').split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{caseData.lawyer?.name || '—'}</p>
                    <p className="text-xs text-[#6a8aaa]">{caseData.lawyer?.specialization || ''}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {caseData.lawyer?.email && (
                    <a
                      href={`mailto:${caseData.lawyer.email}`}
                      className="flex items-center gap-2 text-xs text-[#8aa0b8] hover:text-[#C6A75E] transition-colors"
                    >
                      <Mail size={14} /> {caseData.lawyer.email}
                    </a>
                  )}
                  {caseData.lawyer?.phone && (
                    <p className="text-xs text-[#8aa0b8]">
                      {caseData.lawyer.phone}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Fees Summary */}
            <div className="glass-card p-6 border border-[#1a3a5c]">
              <h3 className="text-sm font-semibold text-white mb-4">Χρεώσεις</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#8aa0b8]">Συνολική Αμοιβή</span>
                  <span className="text-sm font-medium text-[#C6A75E]">
                    €{(caseData?.total_fees || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#8aa0b8]">Πληρωμένη Αμοιβή</span>
                  <span className="text-sm font-medium text-emerald-400">
                    €{(caseData?.paid_fees || 0).toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-[#1a3a5c]/30 pt-3 flex justify-between items-center">
                  <span className="text-xs font-medium text-white">Ανεξόφλητο</span>
                  <span className={`text-sm font-bold ${
                    (caseData?.total_fees || 0) - (caseData?.paid_fees || 0) > 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}>
                    €{((caseData?.total_fees || 0) - (caseData?.paid_fees || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Messages & Documents */}
          <div className="lg:col-span-2 space-y-6">
            {/* Messages */}
            <div className="glass-card p-6 border border-[#1a3a5c]">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare size={16} /> Επικοινωνία με Δικηγόρο
              </h3>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea
                  value={messageContent}
                  onChange={e => setMessageContent(e.target.value)}
                  placeholder="Γράψτε το μήνυμά σας εδώ..."
                  rows={4}
                  className="input-dark resize-none"
                />
                <button
                  type="submit"
                  disabled={messageSending}
                  className="btn-gold w-full flex items-center justify-center gap-2"
                >
                  <Send size={14} />
                  {messageSending ? 'Αποστολή...' : 'Αποστολή Μηνύματος'}
                </button>
              </form>
              <p className="text-[10px] text-[#5a7a9a] mt-3">
                Ο δικηγόρος σας θα απαντήσει το συντομότερο δυνατό.
              </p>
            </div>

            {/* Document Upload */}
            <div className="glass-card p-6 border border-[#1a3a5c]">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Upload size={16} /> Ανέβασμα Εγγράφων
              </h3>
              <label className="block">
                <div className="border-2 border-dashed border-[#1a3a5c]/60 hover:border-[#C6A75E]/40 rounded-lg p-6 text-center cursor-pointer transition-colors">
                  <Upload size={24} className="mx-auto mb-2 text-[#6a8aaa]" />
                  <p className="text-sm font-medium text-white mb-1">
                    Κάντε κλικ για ανέβασμα
                  </p>
                  <p className="text-xs text-[#6a8aaa]">
                    ή σύρετε αρχείο εδώ (max 50MB)
                  </p>
                </div>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="hidden"
                />
              </label>
              {uploadingFile && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#C6A75E]">
                  <Loader2 size={14} className="animate-spin" />
                  Ανέβασμα...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline */}
        {events.length > 0 && (
          <div className="glass-card p-6 border border-[#1a3a5c]">
            <h2 className="text-lg font-semibold text-white mb-4">Ιστορικό Δραστηριοτήτων</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {events.map((event, idx) => (
                <div key={idx} className="flex gap-4 p-4 bg-[#0d2035]/40 rounded-lg border border-[#1a3a5c]/30">
                  <div className="flex-shrink-0 mt-1">
                    {getEventIcon(event.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {formatEventLabel(event.action)}
                    </p>
                    {event.details && (
                      <p className="text-xs text-[#8aa0b8] mt-1">{event.details}</p>
                    )}
                    <p className="text-xs text-[#5a7a9a] mt-1">
                      {event.timestamp
                        ? new Date(event.timestamp).toLocaleDateString('el-GR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && !loading && (
          <div className="glass-card p-12 border border-[#1a3a5c] text-center">
            <AlertCircle size={32} className="mx-auto mb-4 text-[#5a7a9a]" />
            <p className="text-sm text-[#8aa0b8]">Δεν υπάρχουν δραστηριότητες ακόμα.</p>
          </div>
        )}
      </main>
    </div>
  );
}
