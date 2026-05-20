import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Sparkles, Scale, RotateCcw } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

const CATEGORIES = [
  { id: 'criminal', icon: '⚖️', title: 'Ποινικό' },
  { id: 'administrative', icon: '🏛️', title: 'Διοικητικό' },
  { id: 'economic', icon: '💼', title: 'Οικονομικό' },
  { id: 'civil', icon: '📜', title: 'Αστικό' },
  { id: 'briefs', icon: '📝', title: 'Υπομνήματα' },
  { id: 'jurisprudence', icon: '📚', title: 'Νομολογία' },
  { id: 'extrajudicial', icon: '📧', title: 'Εξώδικα' },
];

const WELCOME =
  'Καλωσήρθατε στο Nomos AI! Είμαι ο νομικός βοηθός σας.\n\n' +
  'Μπορώ να σας βοηθήσω με σύνταξη δικογράφων, αναζήτηση νομολογίας, ' +
  'ανάλυση εγγράφων, και νομικές ερωτήσεις.\n\n' +
  'Επιλέξτε κατηγορία ή γράψτε ελεύθερα.';

export default function SkotanisBot() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: WELCOME },
  ]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([{ id: Date.now().toString(), sender: 'bot', text: WELCOME }]);
    setHistory([]);
    setInput('');
    setIsTyping(false);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      const botMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text }]);
      setInput('');
      setIsTyping(true);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const response = await fetch('/api/bot/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('nomos_token')}`,
          },
          body: JSON.stringify({ message: text, history }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('No stream');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botText = '';
        let firstToken = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value, { stream: true }).split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) {
                botText += parsed.text;
                if (firstToken) {
                  firstToken = false;
                  setIsTyping(false);
                  setMessages(prev => [...prev, { id: botMsgId, sender: 'bot', text: botText }]);
                } else {
                  setMessages(prev =>
                    prev.map(m => (m.id === botMsgId ? { ...m, text: botText } : m))
                  );
                }
              }
            } catch {
              // ignore malformed lines
            }
          }
        }

        setHistory(prev => [
          ...prev,
          { role: 'user', content: text },
          { role: 'assistant', content: botText },
        ]);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setIsTyping(false);
        setMessages(prev => [
          ...prev,
          { id: botMsgId, sender: 'bot', text: 'Παρουσιάστηκε σφάλμα. Παρακαλώ δοκιμάστε ξανά.' },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, history]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
          <Bot size={24} className="text-[#071220]" />
        </div>
        <div className="flex-1">
          <h2 className="page-title">Nomos AI</h2>
          <p className="page-subtitle flex items-center gap-1">
            <Sparkles size={10} className="text-[#C6A75E]" /> Νομικός Βοηθός · Claude Sonnet
          </p>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#6a8aaa] hover:text-[#C6A75E] hover:bg-[#132B45]/60 transition-all"
        >
          <RotateCcw size={13} /> Νέα συνομιλία
        </button>
      </div>

      {/* Category shortcuts */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => sendMessage(cat.title)}
            disabled={isTyping}
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-[#132B45]/60 border border-[#1a3a5c]/40 hover:border-[#C6A75E]/30 transition-all text-xs text-[#c0d0e0] hover:text-[#C6A75E] disabled:opacity-40 cursor-pointer"
          >
            <span className="mr-1">{cat.icon}</span>
            {cat.title}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.sender === 'bot'
                  ? 'bg-gradient-to-br from-[#C6A75E] to-[#A8893D]'
                  : 'bg-[#132B45] border border-[#1a3a5c]'
              }`}
            >
              {msg.sender === 'bot' ? (
                <Scale size={14} className="text-[#071220]" />
              ) : (
                <User size={14} className="text-[#7a9ab8]" />
              )}
            </div>
            <div
              className={`max-w-[75%] p-4 rounded-xl ${
                msg.sender === 'bot'
                  ? 'glass-card'
                  : 'bg-[#C6A75E]/10 border border-[#C6A75E]/20 rounded-tr-sm'
              }`}
            >
              <p className="text-sm text-[#d4dce8] whitespace-pre-line">{msg.text}</p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
              <Scale size={14} className="text-[#071220]" />
            </div>
            <div className="glass-card p-4 rounded-xl">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="glass-card p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder="Γράψτε το ερώτημά σας..."
          className="input-dark flex-1 border-0 bg-transparent focus:ring-0"
          disabled={isTyping}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          className="btn-gold px-4 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
