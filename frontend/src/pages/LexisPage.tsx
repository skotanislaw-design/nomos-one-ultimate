import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, RefreshCw, Scale, Zap } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SpecialistInfo {
  id: string;
  name: string;
  short: string;
  icon: string;
  color: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  specialist?: SpecialistInfo;
}

const SPECIALISTS: SpecialistInfo[] = [
  { id: 'penal',         name: 'Ποινικό Δίκαιο',         short: 'Ποινικό',       icon: '⚖️', color: '#EF4444' },
  { id: 'penal_proc',    name: 'Ποινική Δικονομία',       short: 'Ποιν. Δικον.',  icon: '🏛️', color: '#F97316' },
  { id: 'civil',         name: 'Αστικό Δίκαιο',           short: 'Αστικό',        icon: '📜', color: '#3B82F6' },
  { id: 'civil_proc',    name: 'Πολιτική Δικονομία',      short: 'Πολ. Δικον.',   icon: '📋', color: '#6366F1' },
  { id: 'admin',         name: 'Διοικητικό Δίκαιο',       short: 'Διοικητικό',    icon: '🏢', color: '#8B5CF6' },
  { id: 'admin_proc',    name: 'Διοικητική Δικονομία',    short: 'Διοικ. Δικον.', icon: '📁', color: '#A855F7' },
  { id: 'tax',           name: 'Φορολογικό Δίκαιο',       short: 'Φορολογικό',    icon: '💰', color: '#EAB308' },
  { id: 'econ_penal',    name: 'Οικ. Ποινικό & Ξέπλυμα', short: 'Οικ. Ποινικό',  icon: '🔍', color: '#DC2626' },
  { id: 'jurisprudence', name: 'Νομολογία & Θεωρία',      short: 'Νομολογία',     icon: '📚', color: '#0EA5E9' },
  { id: 'echr',          name: 'ΕΔΔΑ & Ευρ. Θεσμοί',      short: 'ΕΔΔΑ / ΕΕ',    icon: '🇪🇺', color: '#06B6D4' },
  { id: 'labor',         name: 'Εργατικό Δίκαιο',          short: 'Εργατικό',      icon: '👷', color: '#10B981' },
  { id: 'commercial',    name: 'Εμπορικό & Εταιρικό',     short: 'Εμπορικό',      icon: '🏪', color: '#F59E0B' },
];

const SUGGESTIONS: Record<string, string[]> = {
  penal:         ['Ποια άρθρα ΠΚ ρυθμίζουν την υπεξαίρεση;', 'Πότε παραγράφεται ένα ποινικό αδίκημα;', 'Τι είναι η απόπειρα κατά το ΠΚ;', 'Εξήγησε τη συρροή αδικημάτων.'],
  penal_proc:    ['Ποια η διαδικασία κύριας ανάκρισης;', 'Πότε εκδίδεται βούλευμα παραπομπής;', 'Τι προβλέπει ο ΚΠΔ για την προφυλάκιση;', 'Προθεσμία άσκησης έφεσης σε ποινικές υποθέσεις.'],
  civil:         ['ΑΚ 914 — τι ορίζει;', 'Βήματα για αγωγή διαζυγίου.', 'Τι είναι η νόμιμη μοίρα στην κληρονομιά;', 'Αποποίηση κληρονομίας — διαδικασία και προθεσμίες.'],
  civil_proc:    ['Πώς ασκώ αίτηση ασφαλιστικών μέτρων;', 'Διαταγή πληρωμής — βήματα έκδοσης.', 'Τι είναι η ανακοπή εκτέλεσης;', 'Προθεσμία άσκησης αναίρεσης στον ΑΠ.'],
  admin:         ['Λόγοι ακύρωσης διοικητικής πράξης στο ΣτΕ.', 'Τι είναι η αίτηση θεραπείας;', 'Πώς προσβάλλω παράνομη διοικητική πράξη;', 'ΑΑΔΕ — ποια διαδικασία ελέγχου ακολουθεί;'],
  admin_proc:    ['Αίτηση ακυρώσεως στο ΣτΕ — προϋποθέσεις παραδεκτού.', 'Διαφορά προσφυγής ουσίας από αίτηση ακύρωσης.', 'Αίτηση αναστολής ΣτΕ — κριτήρια χορήγησης.', 'Αρμοδιότητα ΔΠρ vs ΔΕφ.'],
  tax:           ['Παραγραφή φορολογικής απαίτησης.', 'Τι είναι η ενδικοφανής προσφυγή στο ΔΕΔ;', 'Πρόστιμα ΚΦΔ — ύψη και υπολογισμός.', 'Φορολογική κατοικία φυσικού προσώπου.'],
  econ_penal:    ['Ποιοι υπόκεινται σε υποχρεώσεις AML;', 'Ξέπλυμα χρήματος — στοιχεία αδικήματος.', 'Πότε η φοροδιαφυγή γίνεται ποινικό αδίκημα;', 'Δήμευση εσόδων εγκλήματος — διαδικασία.'],
  jurisprudence: ['Ανάλυσε τάσεις νομολογίας ΑΠ για αδικοπραξία.', 'Τι σημαίνει ratio decidendi;', 'Πότε γίνεται παραπομπή στην Ολομέλεια ΑΠ;', 'Αναλογική ερμηνεία — πότε εφαρμόζεται;'],
  echr:          ['ΕΣΔΑ αρθ. 6 — δικαίωμα σε δίκαιη δίκη.', 'Πώς προσφεύγω στο ΕΔΔΑ;', 'GDPR — τα βασικά δικαιώματα υποκειμένου.', 'Ευρωπαϊκό ένταλμα σύλληψης — βασικά.'],
  labor:         ['Αποζημίωση αδικαιολόγητης απόλυσης.', 'Εργατικό ατύχημα — ευθύνη εργοδότη.', 'Ασφαλιστικές εισφορές ΕΦΚΑ 2024.', 'Ομαδικές απολύσεις — νόμιμη διαδικασία.'],
  commercial:    ['Ευθύνη μελών ΔΣ ΑΕ κατά το Ν.4548/2018.', 'Πτώχευση ΙΚΕ — Ν.4738/2020.', 'Αξιόγραφα: επιταγή vs συναλλαγματική.', 'Ίδρυση ΙΚΕ — βήματα και κόστος.'],
};

const DEFAULT_SUGGESTIONS = SUGGESTIONS['civil'];

function getSpecialist(id: string): SpecialistInfo {
  return SPECIALISTS.find(s => s.id === id) ?? SPECIALISTS[2]; // default civil
}

export default function LexisPage() {
  const [selectedSpecialist, setSelectedSpecialist] = useState<string>('');  // '' = auto
  const [activeSpecialist, setActiveSpecialist] = useState<SpecialistInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [autoRoute, setAutoRoute] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentSpec = autoRoute
    ? (activeSpecialist ?? null)
    : SPECIALISTS.find(s => s.id === selectedSpecialist) ?? null;

  const suggestions = autoRoute
    ? DEFAULT_SUGGESTIONS
    : (selectedSpecialist ? (SUGGESTIONS[selectedSpecialist] ?? DEFAULT_SUGGESTIONS) : DEFAULT_SUGGESTIONS);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages: Message[] = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // Append empty assistant message
    setMessages(m => [...m, { role: 'assistant', content: '', specialist: currentSpec ?? undefined }]);

    try {
      const token = localStorage.getItem('nomos_token') || localStorage.getItem('token') || '';
      const resp = await fetch(`${API_URL}/api/lexis/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          specialist_id: autoRoute ? '' : selectedSpecialist,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      let buffer = '';
      let resolvedSpec: SpecialistInfo | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);

            // First event: specialist routing info
            if (parsed.specialist_id && !parsed.text) {
              resolvedSpec = getSpecialist(parsed.specialist_id);
              if (autoRoute) {
                setActiveSpecialist(resolvedSpec);
              }
              setMessages(m => {
                const last = m[m.length - 1];
                return [...m.slice(0, -1), { ...last, specialist: resolvedSpec ?? undefined }];
              });
            }

            if (parsed.status) {
              setSearchStatus(parsed.status);
            }

            if (parsed.text) {
              setSearchStatus('');
              setMessages(m => {
                const last = m[m.length - 1];
                return [...m.slice(0, -1), { ...last, content: last.content + parsed.text }];
              });
            }

            if (parsed.error) {
              toast.error('Σφάλμα: ' + parsed.error);
            }
          } catch { /* non-JSON line */ }
        }
      }
    } catch (err: any) {
      toast.error('Σφάλμα επικοινωνίας με το LEXIS');
      setMessages(m => m.slice(0, -1));
    } finally {
      setStreaming(false);
      setSearchStatus('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    if (autoRoute) setActiveSpecialist(null);
  };

  const handleAutoRouteToggle = () => {
    const next = !autoRoute;
    setAutoRoute(next);
    if (next) {
      setSelectedSpecialist('');
      setActiveSpecialist(null);
    } else if (!selectedSpecialist) {
      setSelectedSpecialist('civil');
    }
  };

  const displaySpec = autoRoute ? activeSpecialist : (SPECIALISTS.find(s => s.id === selectedSpecialist) ?? null);

  return (
    <div className="flex h-[calc(100vh-5rem)] max-h-[900px] gap-0 rounded-2xl overflow-hidden border border-[#1a3a5c]/40"
         style={{ background: '#071220' }}>

      {/* ─── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-[#1a3a5c]/40"
             style={{ background: 'linear-gradient(180deg,#071220,#0a1929)' }}>

        {/* Sidebar header */}
        <div className="px-4 pt-4 pb-3 border-b border-[#1a3a5c]/40">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#a88b45] flex items-center justify-center flex-shrink-0 shadow shadow-[#C6A75E]/20">
              <Scale size={14} className="text-[#071220]" />
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-widest text-[#C6A75E] leading-tight">LEXIS</p>
              <p className="text-[9px] text-[#4a6a8a] tracking-wider leading-tight">12 Νομικοί Specialists</p>
            </div>
          </div>

          {/* Auto-route toggle */}
          <button
            onClick={handleAutoRouteToggle}
            className={`mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              autoRoute
                ? 'bg-[#C6A75E]/10 border-[#C6A75E]/30 text-[#C6A75E]'
                : 'bg-[#0d2035]/60 border-[#1a3a5c]/40 text-[#5a7a9a] hover:text-[#8aaac8] hover:border-[#1a3a5c]'
            }`}
          >
            <Zap size={12} className={autoRoute ? 'text-[#C6A75E]' : 'text-[#3a5a7a]'} />
            Αυτόματη Δρομολόγηση
            <div className={`ml-auto w-7 h-3.5 rounded-full transition-all relative ${autoRoute ? 'bg-[#C6A75E]/40' : 'bg-[#1a3a5c]'}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${autoRoute ? 'right-0.5 bg-[#C6A75E]' : 'left-0.5 bg-[#3a5a7a]'}`} />
            </div>
          </button>
        </div>

        {/* Specialist list */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
          {SPECIALISTS.map(spec => {
            const isActive = !autoRoute && selectedSpecialist === spec.id;
            const isAutoActive = autoRoute && activeSpecialist?.id === spec.id;
            return (
              <button
                key={spec.id}
                onClick={() => {
                  if (autoRoute) {
                    setAutoRoute(false);
                    setSelectedSpecialist(spec.id);
                    setActiveSpecialist(null);
                  } else {
                    setSelectedSpecialist(spec.id);
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl mb-0.5 transition-all cursor-pointer group border ${
                  isActive
                    ? 'border-opacity-30 text-white'
                    : isAutoActive
                    ? 'border-opacity-20 text-white'
                    : 'border-transparent text-[#5a7a9a] hover:text-[#b8cce0] hover:bg-[#0d2035]/60'
                }`}
                style={
                  isActive
                    ? { background: `${spec.color}18`, borderColor: `${spec.color}40` }
                    : isAutoActive
                    ? { background: `${spec.color}10`, borderColor: `${spec.color}25` }
                    : {}
                }
              >
                {/* Color dot */}
                <div className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
                     style={{ background: isActive || isAutoActive ? spec.color : '#2a4a6a' }} />
                <span className={`text-[12px] flex-1 text-left leading-tight font-medium ${
                  isActive || isAutoActive ? 'text-white' : ''
                }`}>
                  {spec.name}
                </span>
                {isAutoActive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${spec.color}25`, color: spec.color }}>
                    AUTO
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── RIGHT MAIN AREA ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Specialist header bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1a3a5c]/40 flex-shrink-0"
             style={{ background: 'rgba(7,18,32,0.7)' }}>
          {displaySpec ? (
            <>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                   style={{ background: `${displaySpec.color}20`, border: `1px solid ${displaySpec.color}35` }}>
                <span>{displaySpec.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white leading-tight truncate">{displaySpec.name}</h2>
                  {autoRoute && (
                    <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold tracking-wide"
                          style={{ background: `${displaySpec.color}20`, color: displaySpec.color }}>
                      ΑΥΤΟΜΑΤΗ
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#4a6a8a] leading-tight">LEXIS Specialist · Claude Sonnet</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40 flex items-center justify-center flex-shrink-0">
                <Scale size={16} className="text-[#C6A75E]" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-[#b8cce0] leading-tight">
                  {autoRoute ? 'Αυτόματη Δρομολόγηση' : 'Επίλεξε Specialist'}
                </h2>
                <p className="text-[10px] text-[#4a6a8a]">
                  {autoRoute ? 'Ο specialist επιλέγεται αυτόματα από την ερώτηση' : 'Κλικ σε specialist αριστερά'}
                </p>
              </div>
            </>
          )}

          {messages.length > 0 && (
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 text-xs text-[#5a7a9a] hover:text-[#C6A75E] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#132B45] cursor-pointer flex-shrink-0"
            >
              <RefreshCw size={11} /> Νέα συνομιλία
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#C6A75E]/20 to-[#C6A75E]/5 border border-[#C6A75E]/20 flex items-center justify-center">
                <Scale size={28} className="text-[#C6A75E]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">LEXIS — Νομικοί Specialists</h3>
                <p className="text-sm text-[#5a7a9a] max-w-sm">
                  {autoRoute
                    ? 'Γράψε το νομικό σου ερώτημα και ο κατάλληλος specialist θα απαντήσει αυτόματα.'
                    : displaySpec
                    ? `Ο specialist ${displaySpec.name} είναι έτοιμος. Γράψε το ερώτημά σου.`
                    : 'Επίλεξε specialist από τη λίστα ή ενεργοποίησε την αυτόματη δρομολόγηση.'
                  }
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                    className="text-left text-xs text-[#8aa0b8] hover:text-[#d4dce8] bg-[#0d2035]/60 hover:bg-[#132B45] border border-[#1a3a5c]/40 hover:border-[#C6A75E]/20 rounded-xl p-3 transition-all leading-relaxed cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const msgSpec = msg.role === 'assistant' ? msg.specialist : null;
            return (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                {msg.role === 'assistant' ? (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-sm"
                       style={msgSpec
                         ? { background: `${msgSpec.color}20`, border: `1px solid ${msgSpec.color}35` }
                         : { background: 'rgba(198,167,94,0.15)', border: '1px solid rgba(198,167,94,0.2)' }}>
                    {msgSpec ? <span>{msgSpec.icon}</span> : <Scale size={13} className="text-[#C6A75E]" />}
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-[#132B45] border border-[#1a3a5c] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={14} className="text-[#5a7a9a]" />
                  </div>
                )}

                {/* Bubble */}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#132B45] border border-[#1a3a5c] text-[#d4dce8] rounded-tr-sm'
                    : 'bg-[#0d1e30] border border-[#1a3a5c]/60 text-[#c8d8e8] rounded-tl-sm'
                }`}>
                  {/* Specialist label on assistant messages */}
                  {msg.role === 'assistant' && msgSpec && (
                    <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[#1a3a5c]/40">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                           style={{ background: msgSpec.color }} />
                      <span className="text-[10px] font-semibold" style={{ color: msgSpec.color }}>
                        {msgSpec.short}
                      </span>
                    </div>
                  )}
                  {msg.content || (
                    streaming && i === messages.length - 1
                      ? <span className="flex items-center gap-2 text-[#5a7a9a]">
                          <Loader2 size={12} className="animate-spin" />
                          {searchStatus || 'Αναλύω…'}
                        </span>
                      : ''
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-3 border-t border-[#1a3a5c]/40 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                autoRoute
                  ? 'Γράψε το νομικό ερώτημα… (ο specialist επιλέγεται αυτόματα)'
                  : displaySpec
                  ? `Ερώτηση προς ${displaySpec.short}…`
                  : 'Γράψε το νομικό ερώτημα…'
              }
              rows={2}
              disabled={streaming}
              className="flex-1 input-dark resize-none min-h-[2.75rem] max-h-36 py-2.5 text-sm disabled:opacity-60"
              style={{ fieldSizing: 'content' } as any}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="h-[2.75rem] px-4 flex items-center justify-center flex-shrink-0 disabled:opacity-40 cursor-pointer rounded-xl font-medium text-sm transition-all"
              style={
                displaySpec && !streaming
                  ? { background: `${displaySpec.color}CC`, color: '#fff', border: 'none' }
                  : { background: 'rgba(198,167,94,0.8)', color: '#071220', border: 'none' }
              }
              title="Αποστολή"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-[10px] text-[#3a5a7a] mt-1.5 text-center">
            Το LEXIS παρέχει νομικές πληροφορίες, όχι νομικές συμβουλές. Επαληθεύετε πάντα με δικηγόρο.
          </p>
        </div>
      </div>
    </div>
  );
}
