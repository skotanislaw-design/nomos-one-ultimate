/**
 * TypingIndicator Component - Δείχνει ποιοι χρήστες πληκτρολογούν
 * Φάση 1.7: Real-time Messaging
 */

import { useEffect, useState } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface TypingUser {
  user_id: string;
  started: boolean;
  timeout?: NodeJS.Timeout;
}

interface TypingIndicatorProps {
  caseId: string;
  currentUserId?: string;
}

export function TypingIndicator({ caseId, currentUserId }: TypingIndicatorProps) {
  const ws = useWebSocketContext();
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());

  useEffect(() => {
    // Ακούγε για typing events
    const unsubTyping = ws.on('user.typing', (event) => {
      if (event.case_id !== caseId) return;

      // Μην δείξεις ότι ο τρέχων χρήστης πληκτρολογεί
      if (currentUserId && event.user_id === currentUserId) return;

      setTypingUsers(prev => {
        const newMap = new Map(prev);
        const user = newMap.get(event.user_id) || { user_id: event.user_id, started: false };

        // Αν είναι started=false, διέγραψε το timeout
        if (!event.data.started && user.timeout) {
          clearTimeout(user.timeout);
          newMap.delete(event.user_id);
          return newMap;
        }

        // Αν είναι started=true, θέσε timeout για αυτόματη αφαίρεση
        if (event.data.started) {
          if (user.timeout) clearTimeout(user.timeout);

          user.timeout = setTimeout(() => {
            setTypingUsers(m => {
              const newM = new Map(m);
              newM.delete(event.user_id);
              return newM;
            });
          }, 3000); // 3 δευτερόλεπτα timeout

          user.started = true;
          newMap.set(event.user_id, user);
        }

        return newMap;
      });
    });

    return () => {
      unsubTyping();
      // Καθάρισε όλα τα timeouts
      typingUsers.forEach(user => {
        if (user.timeout) clearTimeout(user.timeout);
      });
    };
  }, [caseId, ws, currentUserId]);

  // Αν δεν υπάρχουν χρήστες που πληκτρολογούν, δεν δείχνουμε τίποτα
  if (typingUsers.size === 0) return null;

  const userIds = Array.from(typingUsers.keys());
  const userNames = userIds.join(', '); // Στην πραγματικότητα θα είναι user names

  return (
    <div className="flex items-center gap-2 text-sm text-[#6a8aaa] animate-pulse">
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 bg-[#0f56b3] rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
        <div className="w-1.5 h-1.5 bg-[#0f56b3] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
        <div className="w-1.5 h-1.5 bg-[#0f56b3] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
      </div>
      <span>{userNames} {userNames.includes(',') ? 'πληκτρολογούν' : 'πληκτρολογεί'}...</span>
    </div>
  );
}
