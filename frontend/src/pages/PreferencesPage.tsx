import { useState } from 'react';
import { Save, Moon, Globe, Bell, Eye, Monitor, Palette, Type } from 'lucide-react';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type PrefTab = 'display' | 'notifications' | 'language';

export default function PreferencesPage() {
  const [activeTab, setActiveTab] = useState<PrefTab>('display');
  const [prefs, setPrefs] = useState({
    language: 'el',
    dateFormat: 'DD/MM/YYYY',
    currency: 'EUR',
    timezone: 'Europe/Athens',
    theme: 'dark',
    sidebarCollapsed: false,
    compactMode: false,
    fontSize: 'medium',
    notifyDeadlines: true,
    notifyInvoices: true,
    notifyMessages: true,
    notifyStagnant: false,
    emailDigest: 'daily',
  });

  const tabs = [
    { id: 'display' as PrefTab, label: 'Εμφάνιση' },
    { id: 'notifications' as PrefTab, label: 'Ειδοποιήσεις' },
    { id: 'language' as PrefTab, label: 'Γλώσσα & Μορφές' },
  ];

  const handleSave = () => {
    localStorage.setItem('nomos_preferences', JSON.stringify(prefs));
    toast.success('Προτιμήσεις αποθηκεύτηκαν');
  };

  const toggle = (key: keyof typeof prefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Προτιμήσεις</h2><p className="page-subtitle">Εξατομικεύστε την εμπειρία σας</p></div>
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* ── Display tab ── */}
      {activeTab === 'display' && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2"><Palette size={16} className="text-[#C6A75E]" /><h3 className="section-title">Εμφάνιση & Θέμα</h3></div>

          {/* Theme */}
          <div>
            <label className="label mb-3">Θέμα</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'dark', label: 'Σκοτεινό', icon: Moon, desc: 'Προεπιλογή' },
                { id: 'darker', label: 'Βαθύ Σκοτεινό', icon: Monitor, desc: 'Βαθύτερο' },
                { id: 'auto', label: 'Αυτόματο', icon: Eye, desc: 'Ανάλογα ώρας' },
              ].map(t => (
                <button key={t.id} onClick={() => setPrefs(p => ({ ...p, theme: t.id }))}
                  className={`p-4 rounded-xl border text-center transition-all ${prefs.theme === t.id ? 'border-[#C6A75E] bg-[#C6A75E]/10' : 'border-[#1a3a5c]/40 bg-[#0d2035]/20 hover:border-[#1a3a5c]'}`}>
                  <t.icon size={20} className={`mx-auto mb-2 ${prefs.theme === t.id ? 'text-[#C6A75E]' : 'text-[#5a7a9a]'}`} />
                  <p className={`text-xs font-medium ${prefs.theme === t.id ? 'text-[#C6A75E]' : 'text-[#8aa0b8]'}`}>{t.label}</p>
                  <p className="text-[10px] text-[#4a6a8a]">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="label mb-3 flex items-center gap-2"><Type size={14} /> Μέγεθος Κειμένου</label>
            <div className="flex gap-2">
              {[{ id: 'small', label: 'Μικρό' }, { id: 'medium', label: 'Κανονικό' }, { id: 'large', label: 'Μεγάλο' }].map(s => (
                <button key={s.id} onClick={() => setPrefs(p => ({ ...p, fontSize: s.id }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${prefs.fontSize === s.id ? 'bg-[#C6A75E] text-[#071220]' : 'bg-[#0d2035]/60 border border-[#1a3a5c]/40 text-[#8aa0b8] hover:border-[#C6A75E]/30'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          {[
            { key: 'compactMode', label: 'Compact Mode', desc: 'Μειωμένα περιθώρια για περισσότερες πληροφορίες' },
            { key: 'sidebarCollapsed', label: 'Collapsed Sidebar', desc: 'Εκκίνηση με κλειστό sidebar' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
              <div><p className="text-sm text-[#d4dce8]">{label}</p><p className="text-xs text-[#5a7a9a]">{desc}</p></div>
              <button onClick={() => toggle(key as any)}
                className={`w-11 h-6 rounded-full transition-colors ${(prefs as any)[key] ? 'bg-[#C6A75E]' : 'bg-[#1a3a5c]'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${(prefs as any)[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}

          <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>
        </div>
      )}

      {/* ── Notifications tab ── */}
      {activeTab === 'notifications' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Bell size={16} className="text-[#C6A75E]" /><h3 className="section-title">Ειδοποιήσεις</h3></div>
          {[
            { key: 'notifyDeadlines', label: 'Προθεσμίες', desc: 'Ειδοποίηση για επερχόμενες προθεσμίες' },
            { key: 'notifyInvoices', label: 'Τιμολόγια', desc: 'Ειδοποίηση για ληξιπρόθεσμα τιμολόγια' },
            { key: 'notifyMessages', label: 'Μηνύματα AI', desc: 'Ειδοποίηση για νέα εισερχόμενα από Lindy' },
            { key: 'notifyStagnant', label: 'Αδρανείς Υποθέσεις', desc: 'Ειδοποίηση για υποθέσεις χωρίς κίνηση >14 ημέρες' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
              <div><p className="text-sm text-[#d4dce8]">{label}</p><p className="text-xs text-[#5a7a9a]">{desc}</p></div>
              <button onClick={() => toggle(key as any)}
                className={`w-11 h-6 rounded-full transition-colors ${(prefs as any)[key] ? 'bg-[#C6A75E]' : 'bg-[#1a3a5c]'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${(prefs as any)[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}

          <div>
            <label className="label">Email Digest</label>
            <select value={prefs.emailDigest} onChange={e => setPrefs(p => ({ ...p, emailDigest: e.target.value }))} className="input-dark max-w-xs">
              <option value="realtime">Άμεσα</option>
              <option value="daily">Ημερήσια Σύνοψη</option>
              <option value="weekly">Εβδομαδιαία Σύνοψη</option>
              <option value="never">Ποτέ</option>
            </select>
          </div>

          <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>
        </div>
      )}

      {/* ── Language tab ── */}
      {activeTab === 'language' && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2"><Globe size={16} className="text-[#C6A75E]" /><h3 className="section-title">Γλώσσα & Μορφές</h3></div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Γλώσσα Διεπαφής</label>
              <select value={prefs.language} onChange={e => setPrefs(p => ({ ...p, language: e.target.value }))} className="input-dark">
                <option value="el">Ελληνικά</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="label">Ζώνη Ώρας</label>
              <select value={prefs.timezone} onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))} className="input-dark">
                <option value="Europe/Athens">Αθήνα (GMT+2/+3)</option>
                <option value="Europe/London">Λονδίνο (GMT+0/+1)</option>
                <option value="Europe/Paris">Παρίσι (GMT+1/+2)</option>
              </select>
            </div>
            <div>
              <label className="label">Μορφή Ημερομηνίας</label>
              <select value={prefs.dateFormat} onChange={e => setPrefs(p => ({ ...p, dateFormat: e.target.value }))} className="input-dark">
                <option value="DD/MM/YYYY">ΗΗ/ΜΜ/ΕΕΕΕ (π.χ. 13/04/2026)</option>
                <option value="MM/DD/YYYY">ΜΜ/ΗΗ/ΕΕΕΕ (π.χ. 04/13/2026)</option>
                <option value="YYYY-MM-DD">ΕΕΕΕ-ΜΜ-ΗΗ (π.χ. 2026-04-13)</option>
              </select>
            </div>
            <div>
              <label className="label">Νόμισμα</label>
              <select value={prefs.currency} onChange={e => setPrefs(p => ({ ...p, currency: e.target.value }))} className="input-dark">
                <option value="EUR">EUR (€) — Ευρώ</option>
                <option value="USD">USD ($) — Δολάριο</option>
                <option value="GBP">GBP (£) — Λίρα</option>
              </select>
            </div>
          </div>

          <button onClick={handleSave} className="btn-gold flex items-center gap-1.5"><Save size={14} /> Αποθήκευση</button>
        </div>
      )}
    </div>
  );
}
