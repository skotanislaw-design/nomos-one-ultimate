/**
 * WebSocketContext - Παροχή WebSocket state σε όλη την εφαρμογή
 * Φάση 1.7: Real-time Messaging
 *
 * Αυτό το Context παρέχει:
 * - Κεντρική διαχείριση σύνδεσης WebSocket
 * - Event broadcasting σε όλα τα components
 * - Offline queue management
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, WebSocketEvent } from '@/hooks/useWebSocket';

// ========== INTERFACE ==========
export interface WebSocketContextType {
  // State
  isConnected: boolean;
  isReconnecting: boolean;
  lastMessage: WebSocketEvent | null;
  messageQueue: WebSocketEvent[];
  error: string | null;

  // Methods
  joinRoom: (caseId: string) => Promise<void>;
  leaveRoom: (caseId: string) => void;
  sendEvent: (event: Partial<WebSocketEvent>) => Promise<void>;
  on: (eventType: string, handler: (event: WebSocketEvent) => void) => () => void;
  off: (eventType: string, handler: (event: WebSocketEvent) => void) => void;
  syncPending: () => Promise<void>;
  disconnect: () => void;
}

// ========== CONTEXT CREATION ==========
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// ========== PROVIDER COMPONENT ==========
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();

  const value: WebSocketContextType = {
    // State
    isConnected: ws.connected,
    isReconnecting: ws.reconnecting,
    lastMessage: ws.lastMessage,
    messageQueue: ws.messageQueue,
    error: ws.error,

    // Methods
    joinRoom: ws.joinRoom,
    leaveRoom: ws.leaveRoom,
    sendEvent: ws.sendEvent,
    on: ws.subscribeToEvent,
    off: () => {
      // TODO: Υλοποίηση unsubscribe όπου απαιτείται
    },
    syncPending: ws.syncPendingMessages,
    disconnect: ws.disconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// ========== HOOK: Χρήση Context ==========
export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error(
      'useWebSocketContext πρέπει να χρησιμοποιηθεί μέσα σε WebSocketProvider'
    );
  }

  return context;
}
