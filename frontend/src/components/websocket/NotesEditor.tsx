/**
 * NotesEditor Component - Editor για σημειώσεις με typing indicators
 * Φάση 1.7: Real-time Messaging
 */

import { useState, useEffect, useRef } from 'react';
import { Send, X } from 'lucide-react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { TypingIndicator } from './TypingIndicator';

interface NotesEditorProps {
  caseId: string;
  currentUserId: string;
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function NotesEditor({
  caseId,
  currentUserId,
  onSubmit,
  isSubmitting = false,
}: NotesEditorProps) {
  const ws = useWebSocketContext();
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ========== Χειρισμός αλλαγών στο editor ==========
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    // Αν αρχίσει πληκτρολόγηση, στείλε typing indicator
    if (!isTyping && newContent.trim()) {
      setIsTyping(true);
      ws.sendEvent({
        event_type: 'user.typing',
        case_id: caseId,
        user_id: currentUserId,
        data: { started: true, field: 'notes' },
      });
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Στείλε stopped typing μετά από 1 δευτερόλεπτο χωρίς πληκτρολόγηση
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        ws.sendEvent({
          event_type: 'user.typing',
          case_id: caseId,
          user_id: currentUserId,
          data: { started: false, field: 'notes' },
        });
      }
    }, 1000);
  };

  // ========== Χειρισμός υποβολής ==========
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || isSubmitting) return;

    try {
      // Σταμάτα τη δήλωση πληκτρολόγησης
      if (isTyping) {
        setIsTyping(false);
        ws.sendEvent({
          event_type: 'user.typing',
          case_id: caseId,
          user_id: currentUserId,
          data: { started: false, field: 'notes' },
        });
      }

      await onSubmit(content);
      setContent(''); // Καθάρισε το editor μετά την υποβολή
    } catch (error) {
      console.error('Σφάλμα αποστολής σημείωσης:', error);
    }
  };

  // ========== Cleanup ==========
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Σταμάτα την ένδειξη πληκτρολόγησης αν φεύγουμε
      if (isTyping) {
        ws.sendEvent({
          event_type: 'user.typing',
          case_id: caseId,
          user_id: currentUserId,
          data: { started: false, field: 'notes' },
        });
      }
    };
  }, [caseId, currentUserId, isTyping, ws]);

  return (
    <div className="space-y-3">
      {/* Typing Indicator */}
      <TypingIndicator caseId={caseId} currentUserId={currentUserId} />

      {/* Editor Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Γράψτε μια σημείωση... (real-time update)"
          className="w-full p-3 bg-[#0a1929] text-white border border-[#1a3a5c]
                   rounded-lg focus:border-[#0f56b3] focus:outline-none resize-none"
          rows={4}
          disabled={isSubmitting}
        />

        {/* Character count */}
        <div className="flex justify-between items-center">
          <div className="text-xs text-[#6a8aaa]">
            {content.length} χαρακτήρες
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {content.trim() && (
              <button
                type="button"
                onClick={() => setContent('')}
                className="flex items-center gap-1 px-3 py-1.5 text-sm
                         text-[#6a8aaa] hover:text-white transition"
              >
                <X size={16} />
                Ακύρωση
              </button>
            )}

            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#0f56b3]
                       text-white rounded-lg hover:bg-[#0d4699]
                       disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Send size={16} />
              {isSubmitting ? 'Αποστολή...' : 'Αποστολή'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
