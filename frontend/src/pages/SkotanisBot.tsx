import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Scale } from 'lucide-react';

interface Message { id: string; sender: 'user' | 'bot'; text: string; }

const CATEGORIES = [
  { id: 'criminal', icon: '⚖️', title: 'Ποινικό' },
  { id: 'administrative', icon: '🏛️', title: 'Διοικητικό' },
  { id: 'economic', icon: '💼', title: 'Οικονομικό' },
  { id: 'civil', icon: '📜', title: 'Αστικό' },
  { id: 'briefs', icon: '📝', title: 'Υπομνήματα' },
  { id: 'jurisprudence', icon: '📚', title: 'Νομολογία' },
  { id: 'extrajudicial', icon: '📧', title: 'Εξώδικα' },
];

export default function SkotanisBot() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: 'Καλωσήρθατε στο Nomos AI! Είμαι ο νομικός βοηθός σας.\n\nΜπορώ να σας βοηθήσω με σύνταξη δικογράφων, αναζήτηση νομολογίας, ανάλυση εγγράφων, και νομικές ερωτήσεις.\n\nΕπιλέξτε κατηγορία ή γράψτε ελεύθερα.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulated AI response — in production, connect to OpenAI/Claude API via backend
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: generateResponse(text),
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1500);
  };

  const generateResponse = (q: string): string => {
    const lower = q.toLowerCase();
    if (lower.includes('νομολογ')) return '📚 Για αναζήτηση νομολογίας, χρειάζομαι:\n\n• Τον αριθμό απόφασης ή το θέμα\n• Το δικαστήριο (ΑΠ, ΣτΕ, κλπ.)\n• Τη χρονική περίοδο\n\nΠαρακαλώ δώστε μου αυτές τις πληροφορίες για να αναζητήσω.';
    if (lower.includes('υπόμνημα') || lower.includes('δικόγραφ')) return '📝 Για τη σύνταξη δικογράφου/υπομνήματος χρειάζομαι:\n\n• Τον τύπο (αγωγή, ανακοπή, υπόμνημα κλπ.)\n• Τα στοιχεία του πελάτη\n• Σύντομη περιγραφή των πραγματικών περιστατικών\n• Το δικαστήριο\n\nΘέλετε να ξεκινήσουμε;';
    if (lower.includes('ποινικ')) return '⚖️ Ποινικό Δίκαιο — Μπορώ να βοηθήσω με:\n\n• Ανάλυση κατηγορητηρίου\n• Σύνταξη απολογητικού υπομνήματος\n• Αναζήτηση σχετικής νομολογίας ΑΠ\n• Υπολογισμό παραγραφής\n\nΤι χρειάζεστε;';
    if (lower.includes('διοικητικ')) return '🏛️ Διοικητικό Δίκαιο — Μπορώ να βοηθήσω με:\n\n• Προσφυγές ενώπιον ΔΕφ/ΣτΕ\n• Αιτήσεις αναστολής\n• Ενδικοφανείς προσφυγές\n• Διοικητικά πρόστιμα & κυρώσεις\n\nΠεριγράψτε την υπόθεσή σας.';
    return '💡 Ευχαριστώ για το ερώτημά σας. Σε production περιβάλλον, η απάντηση θα δημιουργηθεί από AI model (Claude/GPT) με πρόσβαση στη νομική βάση δεδομένων σας.\n\nΓια τώρα, μπορείτε να δοκιμάσετε:\n• «Αναζήτηση νομολογίας για...»\n• «Σύνταξη υπομνήματος»\n• «Ποινικό δίκαιο»\n• «Διοικητικό δίκαιο»';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center"><Bot size={24} className="text-[#071220]" /></div>
        <div><h2 className="page-title">Nomos AI</h2><p className="page-subtitle flex items-center gap-1"><Sparkles size={10} className="text-[#C6A75E]" /> Νομικός Βοηθός με Τεχνητή Νοημοσύνη</p></div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => sendMessage(cat.title)} className="flex-shrink-0 px-3 py-2 rounded-lg bg-[#132B45]/60 border border-[#1a3a5c]/40 hover:border-[#C6A75E]/30 transition-all text-xs text-[#c0d0e0] hover:text-[#C6A75E]">
            <span className="mr-1">{cat.icon}</span> {cat.title}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.sender === 'bot' ? 'bg-gradient-to-br from-[#C6A75E] to-[#A8893D]' : 'bg-[#132B45] border border-[#1a3a5c]'}`}>
              {msg.sender === 'bot' ? <Scale size={14} className="text-[#071220]" /> : <User size={14} className="text-[#7a9ab8]" />}
            </div>
            <div className={`max-w-[75%] p-4 rounded-xl ${msg.sender === 'bot' ? 'glass-card' : 'bg-[#C6A75E]/10 border border-[#C6A75E]/20 rounded-tr-sm'}`}>
              <p className="text-sm text-[#d4dce8] whitespace-pre-line">{msg.text}</p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center"><Scale size={14} className="text-[#071220]" /></div>
            <div className="glass-card p-4 rounded-xl"><div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{animationDelay:'0ms'}} /><div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{animationDelay:'150ms'}} /><div className="w-2 h-2 rounded-full bg-[#C6A75E] animate-bounce" style={{animationDelay:'300ms'}} /></div></div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="glass-card p-3 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage(input)} placeholder="Γράψτε το ερώτημά σας..." className="input-dark flex-1 border-0 bg-transparent focus:ring-0" />
        <button onClick={() => sendMessage(input)} disabled={!input.trim()} className="btn-gold px-4 disabled:opacity-40"><Send size={16} /></button>
      </div>
    </div>
  );
}
