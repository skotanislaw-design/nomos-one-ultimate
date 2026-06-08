import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, User, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Message { role: 'user' | 'assistant'; content: string }

const API_URL = import.meta.env.VITE_API_URL || '';

export default function LindaPage() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // Append empty assistant message that we'll fill via streaming
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    try {
      const token = localStorage.getItem('nomos_token') || localStorage.getItem('token') || '';
      const resp = await fetch(`${API_URL}/api/linda/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      let buffer = '';
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
            if (parsed.text) {
              setMessages(m => {
                const last = m[m.length - 1];
                return [...m.slice(0, -1), { ...last, content: last.content + parsed.text }];
              });
            }
          } catch { /* non-JSON line */ }
        }
      }
    } catch (err: any) {
      toast.error('Σφάλμα επικοινωνίας με τη Λίντα');
      setMessages(m => m.slice(0, -1)); // remove empty assistant bubble
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const SUGGESTIONS = [
    'Ποιες υποθέσεις έχουν επείγουσες προθεσμίες αυτή την εβδομάδα;',
    'Βοήθησέ με να συντάξω μια εξουσιοδότηση για αστική αγωγή.',
    'Πες μου τα βήματα για κατάθεση αίτησης αναστολής.',
    'Τι έγγραφα χρειάζομαι για μια μήνυση απάτης;',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-h-[900px]">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-[#1a3a5c]/40">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#a88b45] flex items-center justify-center shadow-lg shadow-[#C6A75E]/20">
            <Sparkles size={20} className="text-[#071220]" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#071220]" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">Λίντα</h2>
          <p className="text-xs text-[#5a7a9a]">Προσωπική Νομική Βοηθός · Claude Sonnet</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-[#5a7a9a] hover:text-[#C6A75E] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#132B45] cursor-pointer"
          >
            <RefreshCw size={12} /> Νέα συνομιλία
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#C6A75E]/20 to-[#C6A75E]/5 border border-[#C6A75E]/20 flex items-center justify-center">
              <Sparkles size={28} className="text-[#C6A75E]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Καλημέρα, Χρήστο</h3>
              <p className="text-sm text-[#5a7a9a] max-w-sm">
                Είμαι η Λίντα, η προσωπική σου νομική βοηθός. Πώς μπορώ να σε βοηθήσω σήμερα;
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s, i) => (
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

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            {msg.role === 'assistant' ? (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C6A75E] to-[#a88b45] flex items-center justify-center flex-shrink-0 mt-0.5 shadow shadow-[#C6A75E]/20">
                <Sparkles size={14} className="text-[#071220]" />
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
              {msg.content || (
                streaming && i === messages.length - 1
                  ? <span className="flex items-center gap-2 text-[#5a7a9a]"><Loader2 size={12} className="animate-spin" /> Γράφω…</span>
                  : ''
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-[#1a3a5c]/40">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Γράψε στη Λίντα… (Enter για αποστολή, Shift+Enter για αλλαγή γραμμής)"
            rows={2}
            disabled={streaming}
            className="flex-1 input-dark resize-none min-h-[2.75rem] max-h-36 py-2.5 text-sm disabled:opacity-60"
            style={{ fieldSizing: 'content' } as any}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="btn-gold h-[2.75rem] px-4 flex items-center justify-center flex-shrink-0 disabled:opacity-40 cursor-pointer"
            title="Αποστολή"
          >
            {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-[#3a5a7a] mt-1.5 text-center">
          Η Λίντα μπορεί να κάνει λάθη. Επαληθεύετε σημαντικές νομικές πληροφορίες.
        </p>
      </div>
    </div>
  );
}
