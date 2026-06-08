/**
 * useWebSocket Hook - Διαχείριση σύνδεσης WebSocket
 * Φάση 1.7: Real-time Messaging
 *
 * Αυτό το hook παρέχει:
 * - Διαχείριση σύνδεσης WebSocket
 * - Αυτόματη επανασύνδεση με exponential backoff
 * - Offline queue με IndexedDB
 * - Event subscriptions
 * - Device tracking από Phase 1.5
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePWA } from './usePWA';

export interface WebSocketEvent {
  event_type: string;
  case_id: string;
  user_id: string;
  device_id: string;
  data: Record<string, any>;
  message_id: string;
  timestamp: string;
}

export interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  lastMessage: WebSocketEvent | null;
  messageQueue: WebSocketEvent[];
  error: string | null;
}

type EventHandler = (event: WebSocketEvent) => void;

export function useWebSocket() {
  // ========== STATE ==========
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    messageQueue: [],
    error: null,
  });

  // ========== REFS ==========
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  // ========== CONTEXT ==========
  const { token } = useAuth();
  const { deviceId } = usePWA();

  // ========== ΣΤΑΘΕΡΕΣ ==========
  const MAX_RECONNECT_ATTEMPTS = 10;
  const INITIAL_RECONNECT_DELAY = 1000; // 1 δευτερόλεπτο
  const MAX_RECONNECT_DELAY = 16000; // 16 δευτερόλεπτα
  const MESSAGE_QUEUE_STORAGE_KEY = 'ws_pending_messages';

  // ========== HELPER: Exponential Backoff ==========
  const getReconnectDelay = useCallback((attempt: number): number => {
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempt);
    return Math.min(delay, MAX_RECONNECT_DELAY);
  }, []);

  // ========== HELPER: IndexedDB Operations ==========
  const saveToQueue = useCallback(async (event: WebSocketEvent) => {
    try {
      if (!window.indexedDB) return;

      const request = indexedDB.open('nomos_one', 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['pending_events'], 'readwrite');
        const store = transaction.objectStore('pending_events');
        store.add({ ...event, savedAt: new Date() });
      };
    } catch (e) {
      console.error('Σφάλμα αποθήκευσης στο IndexedDB:', e);
    }
  }, []);

  const loadQueueFromStorage = useCallback(async (): Promise<WebSocketEvent[]> => {
    try {
      if (!window.indexedDB) return [];

      return new Promise((resolve) => {
        const request = indexedDB.open('nomos_one', 1);

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['pending_events'], 'readonly');
          const store = transaction.objectStore('pending_events');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const events = (getAllRequest.result || []).map((item: any) => {
              const { savedAt, ...event } = item;
              return event as WebSocketEvent;
            });
            resolve(events);
          };
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (e) {
      console.error('Σφάλμα φόρτωσης από IndexedDB:', e);
      return [];
    }
  }, []);

  const clearQueue = useCallback(async () => {
    try {
      if (!window.indexedDB) return;

      const request = indexedDB.open('nomos_one', 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['pending_events'], 'readwrite');
        const store = transaction.objectStore('pending_events');
        store.clear();
      };
    } catch (e) {
      console.error('Σφάλμα καθαρισμού IndexedDB:', e);
    }
  }, []);

  // ========== HANDLER: Αποστολή Event ==========
  const sendEvent = useCallback(async (event: Partial<WebSocketEvent>) => {
    const fullEvent: WebSocketEvent = {
      event_type: event.event_type || '',
      case_id: event.case_id || '',
      user_id: event.user_id || '',
      device_id: deviceId || '',
      data: event.data || {},
      message_id: event.message_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // Αν είμαστε offline, κάνε queue
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await saveToQueue(fullEvent);
      setState(prev => ({
        ...prev,
        messageQueue: [...prev.messageQueue, fullEvent],
      }));
      return;
    }

    // Αλλιώς στείλε αμέσως
    try {
      wsRef.current.send(JSON.stringify({
        action: 'send_event',
        ...fullEvent,
      }));
    } catch (e) {
      console.error('Σφάλμα αποστολής event:', e);
      await saveToQueue(fullEvent);
      setState(prev => ({
        ...prev,
        messageQueue: [...prev.messageQueue, fullEvent],
      }));
    }
  }, [deviceId, saveToQueue]);

  // ========== HANDLER: Join Room ==========
  const joinRoom = useCallback(async (caseId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket δεν είναι ανοιχτό, δεν μπορώ να κάνω join στο room');
      return;
    }

    subscribedRoomsRef.current.add(caseId);

    try {
      wsRef.current.send(JSON.stringify({
        action: 'join_room',
        case_id: caseId,
      }));
    } catch (e) {
      console.error(`Σφάλμα join στο room ${caseId}:`, e);
    }
  }, []);

  // ========== HANDLER: Leave Room ==========
  const leaveRoom = useCallback((caseId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    subscribedRoomsRef.current.delete(caseId);

    try {
      wsRef.current.send(JSON.stringify({
        action: 'leave_room',
        case_id: caseId,
      }));
    } catch (e) {
      console.error(`Σφάλμα leave από room ${caseId}:`, e);
    }
  }, []);

  // ========== HANDLER: Event Subscription ==========
  const subscribeToEvent = useCallback(
    (eventType: string, handler: EventHandler): (() => void) => {
      if (!eventHandlersRef.current.has(eventType)) {
        eventHandlersRef.current.set(eventType, new Set());
      }

      eventHandlersRef.current.get(eventType)!.add(handler);

      // Επιστρέψε unsubscribe function
      return () => {
        const handlers = eventHandlersRef.current.get(eventType);
        if (handlers) {
          handlers.delete(handler);
        }
      };
    },
    []
  );

  // ========== HANDLER: Trigger Event Handlers ==========
  const triggerEventHandlers = useCallback((event: WebSocketEvent) => {
    const handlers = eventHandlersRef.current.get(event.event_type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (e) {
          console.error(`Σφάλμα στο event handler για ${event.event_type}:`, e);
        }
      });
    }
  }, []);

  // ========== HANDLER: Sync Pending Messages ==========
  const syncPendingMessages = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const queuedMessages = await loadQueueFromStorage();

    for (const message of queuedMessages) {
      try {
        wsRef.current.send(JSON.stringify({
          action: 'send_event',
          ...message,
        }));

        // Μετά την επιτυχή αποστολή, διέγραψε από queue
        await clearQueue();
      } catch (e) {
        console.error('Σφάλμα κατά τη σύγχρονη:', e);
        break; // Σταμάτησε αν υπάρχει σφάλμα
      }
    }

    setState(prev => ({
      ...prev,
      messageQueue: [],
    }));
  }, [loadQueueFromStorage, clearQueue]);

  // ========== HANDLER: Connect ==========
  const connect = useCallback(async () => {
    if (!token || !deviceId) {
      console.warn('Λείπουν token ή deviceId');
      return;
    }

    if (wsRef.current) {
      console.log('WebSocket είναι ήδη ανοιχτό');
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProto}://${window.location.host}/ws`;
    const wsUrlWithParams = `${wsUrl}?token=${token}&device_id=${deviceId}`;

    try {
      const ws = new WebSocket(wsUrlWithParams);

      ws.onopen = () => {
        console.log('✓ WebSocket συνδεδεμένο');
        wsRef.current = ws;
        reconnectAttemptsRef.current = 0;

        setState(prev => ({
          ...prev,
          connected: true,
          reconnecting: false,
          error: null,
        }));

        // Επανασυνδέσου σε προηγούμενα rooms
        subscribedRoomsRef.current.forEach(caseId => {
          try {
            ws.send(JSON.stringify({
              action: 'join_room',
              case_id: caseId,
            }));
          } catch (e) {
            console.error(`Σφάλμα reconnect στο room ${caseId}:`, e);
          }
        });

        // Συγχρόνισε pending messages
        syncPendingMessages();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;

          setState(prev => ({
            ...prev,
            lastMessage: data,
          }));

          triggerEventHandlers(data);
        } catch (e) {
          console.error('Σφάλμα parsing WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket σφάλμα:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket σφάλμα σύνδεσης',
        }));
      };

      ws.onclose = () => {
        console.log('WebSocket κλειστό, προσπάθεια επανασύνδεσης...');
        wsRef.current = null;

        setState(prev => ({
          ...prev,
          connected: false,
        }));

        // Exponential backoff reconnection
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay(reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;

          setState(prev => ({
            ...prev,
            reconnecting: true,
          }));

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(
              `Επανασύνδεση προσπάθεια ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}...`
            );
            connect();
          }, delay);
        } else {
          setState(prev => ({
            ...prev,
            error: 'Αποτυχία επανασύνδεσης μετά από πολλές προσπάθειες',
          }));
        }
      };
    } catch (e) {
      console.error('Σφάλμα δημιουργίας WebSocket:', e);
      setState(prev => ({
        ...prev,
        error: 'Δεν ήταν δυνατό να συνδεθεί στο WebSocket',
      }));
    }
  }, [token, deviceId, syncPendingMessages, triggerEventHandlers, getReconnectDelay]);

  // ========== HANDLER: Disconnect ==========
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      connected: false,
      reconnecting: false,
    }));
  }, []);

  // ========== EFFECT: Auto-connect on mount ==========
  useEffect(() => {
    if (token && deviceId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [token, deviceId, connect, disconnect]);

  // ========== RETURN ==========
  return {
    // State
    connected: state.connected,
    reconnecting: state.reconnecting,
    lastMessage: state.lastMessage,
    messageQueue: state.messageQueue,
    error: state.error,

    // Methods
    connect,
    disconnect,
    sendEvent,
    joinRoom,
    leaveRoom,
    subscribeToEvent,
    syncPendingMessages,
  };
}
