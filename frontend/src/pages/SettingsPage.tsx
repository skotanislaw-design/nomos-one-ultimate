import { useEffect, useState } from 'react';
import { Save, Shield, Bell, Building2, Lock, Users, Tag, Cloud, Bot, Link2, CreditCard, AlertCircle, CheckCircle, ExternalLink, Upload, RefreshCw, FolderOpen } from 'lucide-react';
import { settingsApi, gdriveApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type SettingsTab = 'general' | 'security' | 'notifications' | 'integrations' | 'ai' | 'billing_config' | 'team' | 'categories';


// ── Google Drive Card ─────────────────────────────────────────────────────────
function GoogleDriveCard({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [folderInput, setFolderInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try { const r = await gdriveApi.status(); setStatus(r.data); }
    catch { setStatus(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleOAuthClient = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const token = localStorage.getItem('token') || localStorage.getItem('nomos_token') || '';
      await fetch('/api/integrations/gdrive/oauth/client', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      toast.success('OAuth client φορτώθηκε');
      await fetchStatus();
    } catch { toast.error('Σφάλμα φόρτωσης'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleSetFolder = async () => {
    if (!folderInput.trim()) return;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('nomos_token') || '';
      await fetch('/api/integrations/gdrive/folder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_url: folderInput.trim() }),
      });
      toast.success('Φάκελος αποθηκεύτηκε');
      setFolderInput('');
      await fetchStatus();
    } catch { toast.error('Σφάλμα αποθήκευσης φακέλου'); }
  };

  if (loading) return (
    <div className="glass-card p-6 flex items-center gap-3">
      <Cloud size={16} className="text-blue-400" />
      <span className="text-sm text-[#6a8aaa]">Φόρτωση κατάστασης Drive...</span>
    </div>
  );

  const isConnected = status?.configured === true;
  const hasClient = status?.oauth_client_ready === true;
  const hasFolder = status?.folder_configured === true;

  return (
    <div className="glass-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-blue-400" />
          <h3 className="section-title">Google Drive</h3>
        </div>
        {isConnected ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <CheckCircle size={11} /> Συνδεδεμένο
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
            <AlertCircle size={11} /> Αδύνατη σύνδεση
          </span>
        )}
      </div>

      {/* Status checklist */}
      <div className="space-y-2">
        {[
          { label: 'OAuth Client JSON', done: hasClient, step: 1 },
          { label: 'Εξουσιοδότηση Google Account', done: isConnected, step: 2 },
          { label: 'Root Φάκελος Drive', done: hasFolder, step: 3 },
        ].map(s => (
          <div key={s.step} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
              ${s.done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[#1a3a5c]/40 text-[#4a6a8a] border border-[#1a3a5c]/50'}`}>
              {s.done ? '✓' : s.step}
            </div>
            <span className={`text-sm ${s.done ? 'text-[#c0d0e0]' : 'text-[#5a7a9a]'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload OAuth client */}
      {isAdmin && !hasClient && (
        <div className="p-4 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40 space-y-3">
          <p className="text-xs text-[#8aa0b8]">
            Κατεβάστε το <strong className="text-[#c0d0e0]">OAuth 2.0 Client JSON</strong> από Google Cloud Console → Credentials και ανεβάστε το εδώ.
          </p>
          <label className="btn-dark text-xs flex items-center gap-1.5 cursor-pointer w-fit">
            <Upload size={13} /> {uploading ? 'Φόρτωση...' : 'Ανέβασε OAuth Client JSON'}
            <input type="file" accept=".json" className="hidden" onChange={handleOAuthClient} disabled={uploading} />
          </label>
        </div>
      )}

      {/* Step 2: Connect Google Account */}
      {isAdmin && hasClient && !isConnected && (
        <div className="p-4 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40 space-y-3">
          <p className="text-xs text-[#8aa0b8]">Εξουσιοδοτήστε τον Google λογαριασμό σας για ανέβασμα αρχείων στο Drive.</p>
          <a href="/api/integrations/gdrive/oauth/start" target="_blank" rel="noopener noreferrer"
            className="btn-gold text-xs flex items-center gap-1.5 w-fit">
            <ExternalLink size={13} /> Σύνδεση με Google Drive
          </a>
          <p className="text-[11px] text-[#4a6a8a]">Μετά την εξουσιοδότηση, ανανεώστε τη σελίδα.</p>
        </div>
      )}

      {/* Step 3: Set folder */}
      {isAdmin && !hasFolder && (
        <div className="p-4 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40 space-y-3">
          <p className="text-xs text-[#8aa0b8]">Επικολλήστε το URL του φακέλου Google Drive που θέλετε να χρησιμοποιείτε ως root.</p>
          <div className="flex gap-2">
            <input value={folderInput} onChange={e => setFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..." className="input-dark text-xs flex-1" />
            <button onClick={handleSetFolder} className="btn-dark text-xs flex items-center gap-1 px-3">
              <FolderOpen size={13} /> Αποθήκευση
            </button>
          </div>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-3">
          <CheckCircle size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Google Drive συνδεδεμένο</p>
            <p className="text-xs text-[#6a8aaa] mt-0.5">
              Τα έγγραφα αρχειοθετούνται αυτόματα: <span className="text-[#8aa0b8]">Έτος → Πελάτης → Υπόθεση</span>
            </p>
          </div>
        </div>
      )}

      {/* Re-upload client button when already connected */}
      {isAdmin && hasClient && (
        <label className="text-[11px] text-[#4a6a8a] hover:text-[#C6A75E] flex items-center gap-1.5 cursor-pointer w-fit transition-colors">
          <RefreshCw size={11} /> Αντικατάσταση OAuth client
          <input type="file" accept=".json" className="hidden" onChange={handleOAuthClient} />
        </label>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const perms = usePermissions();

  useEffect(() => {
    settingsApi.get().then(r => { setSettings(r.data || {}); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try { await settingsApi.update(settings); toast.success('Ρυθμίσεις αποθηκεύτηκαν'); }
    catch { toast.error('Σφάλμα αποθήκευσης'); }
  };

  const tabs = [
    { id: 'general' as SettingsTab, label: 'Γενικά' },
    { id: 'security' as SettingsTab, label: 'Ασφάλεια' },
    { id: 'notifications' as SettingsTab, label: 'Ειδοποιήσεις' },
    { id: 'integrations' as SettingsTab, label: 'Integrations' },
    { id: 'ai' as SettingsTab, label: 'AI Settings' },
    { id: 'billing_config' as SettingsTab, label: 'Τιμολόγηση' },
    { id: 'team' as SettingsTab, label: 'Ομάδα' },
    { id: 'categories' as SettingsTab, label: 'Κατηγορίες' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h2 className="page-title">Ρυθμίσεις</h2><p className="page-subtitle">Παράμετροι συστήματος</p></div>
        </div>
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} size="sm" />
      </div>

      {!perms.isAdmin && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Shield size={14} className="text-amber-400" /><span className="text-xs text-amber-300">Μόνο ανάγνωση — Ο ρόλος σας δεν επιτρέπει αλλαγές.</span>
        </div>
      )}

      {/* ── General ── */}
      {activeTab === 'general' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Building2 size={16} className="text-[#C6A75E]" /><h3 className="section-title">Στοιχεία Γραφείου</h3></div>
          <div><label className="label">Όνομα Γραφείου</label><input value={settings.firm_name || ''} onChange={e => setSettings({...settings, firm_name: e.target.value})} className="input-dark" disabled={!perms.isAdmin} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email Επικοινωνίας</label><input value={settings.notification_email || ''} onChange={e => setSettings({...settings, notification_email: e.target.value})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Τηλέφωνο</label><input value={settings.firm_phone || ''} onChange={e => setSettings({...settings, firm_phone: e.target.value})} placeholder="+30 210 0000000" className="input-dark" disabled={!perms.isAdmin} /></div>
          </div>
          <div><label className="label">Διεύθυνση</label><input value={settings.firm_address || ''} onChange={e => setSettings({...settings, firm_address: e.target.value})} className="input-dark" disabled={!perms.isAdmin} /></div>
          <div><label className="label">ΑΦΜ Γραφείου</label><input value={settings.firm_afm || ''} onChange={e => setSettings({...settings, firm_afm: e.target.value})} placeholder="123456789" className="input-dark max-w-xs" disabled={!perms.isAdmin} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Νόμισμα</label><select value={settings.currency || 'EUR'} onChange={e => setSettings({...settings, currency: e.target.value})} className="input-dark" disabled={!perms.isAdmin}><option value="EUR">EUR (€)</option><option value="USD">USD ($)</option></select></div>
            <div><label className="label">ΦΠΑ %</label><input type="number" value={settings.vat_rate || 24} onChange={e => setSettings({...settings, vat_rate: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
          </div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Security ── */}
      {activeTab === 'security' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Lock size={16} className="text-[#C6A75E]" /><h3 className="section-title">Ρυθμίσεις Ασφάλειας</h3></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Ελάχιστο μήκος κωδικού</label><input type="number" value={settings.min_password_length || 8} onChange={e => setSettings({...settings, min_password_length: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Μέγ. αποτυχίες σύνδεσης</label><input type="number" value={settings.max_login_attempts || 5} onChange={e => setSettings({...settings, max_login_attempts: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
          </div>
          <div><label className="label">Λήξη κλειδώματος (λεπτά)</label><input type="number" value={settings.lockout_minutes || 15} onChange={e => setSettings({...settings, lockout_minutes: Number(e.target.value)})} className="input-dark max-w-[200px]" disabled={!perms.isAdmin} /></div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
            <div><p className="text-sm text-[#d4dce8]">Έλεγχος ταυτότητας 2 παραγόντων</p><p className="text-xs text-[#5a7a9a]">Απαιτείται 2FA για όλους τους χρήστες</p></div>
            <button onClick={() => setSettings({...settings, require_2fa: !settings.require_2fa})} disabled={!perms.isAdmin} className={`w-11 h-6 rounded-full transition-colors ${settings.require_2fa ? 'bg-[#C6A75E]' : 'bg-[#1a3a5c]'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.require_2fa ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
          </div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Notifications ── */}
      {activeTab === 'notifications' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Bell size={16} className="text-[#C6A75E]" /><h3 className="section-title">Ειδοποιήσεις & Υπενθυμίσεις</h3></div>
          {[
            { key: 'send_reminders', label: 'Υπενθυμίσεις Προθεσμιών', desc: 'Αυτόματη αποστολή για επερχόμενες προθεσμίες' },
            { key: 'notify_stagnant', label: 'Στάσιμες Υποθέσεις', desc: 'Ειδοποίηση για υποθέσεις χωρίς κίνηση' },
            { key: 'notify_overdue', label: 'Ληξιπρόθεσμα Τιμολόγια', desc: 'Ειδοποίηση για ανεξόφλητα τιμολόγια' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
              <div><p className="text-sm text-[#d4dce8]">{label}</p><p className="text-xs text-[#5a7a9a]">{desc}</p></div>
              <button onClick={() => setSettings({...settings, [key]: !settings[key]})} disabled={!perms.isAdmin} className={`w-11 h-6 rounded-full transition-colors ${settings[key] ? 'bg-[#C6A75E]' : 'bg-[#1a3a5c]'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
            </div>
          ))}

          <div><label className="label">SMTP Server</label><input value={settings.smtp_host || ''} onChange={e => setSettings({...settings, smtp_host: e.target.value})} placeholder="smtp.gmail.com" className="input-dark" disabled={!perms.isAdmin} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">SMTP Port</label><input type="number" value={settings.smtp_port || 587} onChange={e => setSettings({...settings, smtp_port: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">SMTP Username</label><input value={settings.smtp_user || ''} onChange={e => setSettings({...settings, smtp_user: e.target.value})} placeholder="noreply@domain.com" className="input-dark" disabled={!perms.isAdmin} /></div>
          </div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Integrations ── */}
      {activeTab === 'integrations' && (
        <div className="space-y-5">
          {/* Google Drive */}
          <GoogleDriveCard isAdmin={perms.isAdmin} />

          {/* Lindy AI */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded bg-purple-500/30 flex items-center justify-center"><Bot size={12} className="text-purple-400" /></div>
              <h3 className="section-title">Lindy AI</h3>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Ενεργό</span>
            </div>
            <div><label className="label">Lindy Webhook URL</label><input value={settings.lindy_webhook || 'https://chat.lindy.ai/christos-skotaniss-workspace/lindy/legal-document-extractor-69db65ca7cf5099909310fa8/tasks'} onChange={e => setSettings({...settings, lindy_webhook: e.target.value})} className="input-dark font-mono text-xs" disabled={!perms.isAdmin} /></div>
            {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
          </div>
        </div>
      )}

      {/* ── AI Settings ── */}
      {activeTab === 'ai' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Bot size={16} className="text-purple-400" /><h3 className="section-title">AI & Αυτοματισμοί</h3></div>
          {[
            { key: 'ai_intake_enabled', label: 'AI Document Intake', desc: 'Αυτόματη εισαγωγή εγγράφων μέσω Lindy AI' },
            { key: 'ai_categorize', label: 'Αυτόματη Κατηγοριοποίηση', desc: 'Το AI κατηγοριοποιεί αυτόματα νέες υποθέσεις' },
            { key: 'ai_deadline_extract', label: 'Εξαγωγή Προθεσμιών', desc: 'Αυτόματη ανίχνευση προθεσμιών από έγγραφα' },
            { key: 'ai_draft_emails', label: 'AI Email Drafts', desc: 'Πρόταση email σε πελάτες από το AI' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
              <div><p className="text-sm text-[#d4dce8]">{label}</p><p className="text-xs text-[#5a7a9a]">{desc}</p></div>
              <button onClick={() => setSettings({...settings, [key]: !settings[key]})} disabled={!perms.isAdmin} className={`w-11 h-6 rounded-full transition-colors ${settings[key] ? 'bg-purple-500' : 'bg-[#1a3a5c]'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
            </div>
          ))}
          <div><label className="label">AI Language Model</label><select value={settings.ai_model || 'gpt-4'} onChange={e => setSettings({...settings, ai_model: e.target.value})} className="input-dark max-w-xs" disabled={!perms.isAdmin}><option value="gpt-4">GPT-4 (Προεπιλογή)</option><option value="claude-3">Claude 3</option><option value="gemini">Gemini Pro</option></select></div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Billing Config ── */}
      {activeTab === 'billing_config' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><CreditCard size={16} className="text-[#C6A75E]" /><h3 className="section-title">Ρυθμίσεις Τιμολόγησης</h3></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Προεπιλεγμένος ΦΠΑ %</label><input type="number" value={settings.default_vat_rate || 24} onChange={e => setSettings({...settings, default_vat_rate: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Παρακράτηση Φόρου %</label><input type="number" value={settings.withholding_rate || 20} onChange={e => setSettings({...settings, withholding_rate: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Ημέρες Πίστωσης (default)</label><input type="number" value={settings.default_credit_days || 30} onChange={e => setSettings({...settings, default_credit_days: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Ημέρες Υπενθύμισης πριν λήξη</label><input type="number" value={settings.reminder_days_before || 7} onChange={e => setSettings({...settings, reminder_days_before: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
            <div><p className="text-sm text-[#d4dce8]">Αυτόματες Υπενθυμίσεις</p><p className="text-xs text-[#5a7a9a]">Αυτόματη αποστολή email σε ληξιπρόθεσμα</p></div>
            <button onClick={() => setSettings({...settings, auto_reminders: !settings.auto_reminders})} disabled={!perms.isAdmin} className={`w-11 h-6 rounded-full transition-colors ${settings.auto_reminders ? 'bg-[#C6A75E]' : 'bg-[#1a3a5c]'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.auto_reminders ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
          </div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Team ── */}
      {activeTab === 'team' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Users size={16} className="text-[#C6A75E]" /><h3 className="section-title">Διαχείριση Ομάδας</h3></div>
          <p className="text-sm text-[#7a9ab8]">Η διαχείριση χρηστών γίνεται από τη σελίδα <button onClick={() => {}} className="text-[#C6A75E] hover:underline">Χρήστες</button>.</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Μέγιστος αριθμός χρηστών</label><input type="number" value={settings.max_users || 10} onChange={e => setSettings({...settings, max_users: Number(e.target.value)})} className="input-dark" disabled={!perms.isAdmin} /></div>
            <div><label className="label">Default ρόλος νέου χρήστη</label><select value={settings.default_role || 'associate'} onChange={e => setSettings({...settings, default_role: e.target.value})} className="input-dark" disabled={!perms.isAdmin}><option value="associate">Συνεργάτης</option><option value="trainee">Ασκούμενος</option><option value="readonly">Μόνο Ανάγνωση</option></select></div>
          </div>
          {perms.isAdmin && <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>}
        </div>
      )}

      {/* ── Categories ── */}
      {activeTab === 'categories' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Tag size={16} className="text-[#C6A75E]" /><h3 className="section-title">Κατηγορίες Υποθέσεων</h3></div>
          <p className="text-xs text-[#5a7a9a]">Οι κατηγορίες χρησιμοποιούνται για ταξινόμηση υποθέσεων</p>
          <div className="space-y-2">
            {['Ποινικό', 'Αστικό', 'Διοικητικό', 'Εμπορικό', 'Εργατικό', 'Οικογενειακό', 'Ακίνητα', 'Φορολογικό', 'Ναυτικό', 'Διεθνές'].map(cat => (
              <div key={cat} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#C6A75E]" />
                  <span className="text-sm text-[#d4dce8]">{cat}</span>
                </div>
                <span className="text-xs text-[#4a6a8a]">Ενεργό</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#4a6a8a] italic">* Η προσαρμογή κατηγοριών θα είναι διαθέσιμη σε επόμενη έκδοση</p>
        </div>
      )}
    </div>
  );
}
