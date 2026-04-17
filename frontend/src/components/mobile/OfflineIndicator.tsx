/**
 * Offline Indicator Component
 * Δείχνει την κατάσταση του δικτύου και του WebSocket
 * Ενημερώθηκε για Phase 1.7: Real-time Messaging
 */

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, AlertCircle, Cloud, CloudX } from 'lucide-react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface OfflineOperation {
  id: string;
  type: 'message' | 'case_update' | 'note';
  description: string;
  timestamp: number;
}

export const OfflineIndicator: React.FC = () => {
  const ws = useWebSocketContext(); // WebSocket context για real-time updates
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<OfflineOperation[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Listen for online/offline events
    const handleOnline = async () => {
      console.log('[Offline] Going online');
      setIsOnline(true);

      // Attempt to sync pending operations
      if (pendingOperations.length > 0) {
        await syncPendingOperations();
      }
    };

    const handleOffline = () => {
      console.log('[Offline] Going offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for pending operations
    window.addEventListener('offline-operation-queued', (e: any) => {
      const operation = e.detail;
      setPendingOperations((prev) => [...prev, operation]);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-operation-queued', () => {});
    };
  }, [pendingOperations]);

  /**
   * Sync all pending operations when going online
   */
  const syncPendingOperations = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    console.log('[Offline] Starting sync of', pendingOperations.length, 'operations');

    try {
      for (const operation of pendingOperations) {
        try {
          // Retrieve operation from IndexedDB
          const storedData = await getStoredOperation(operation.id);

          if (!storedData) {
            console.warn('[Offline] Operation not found:', operation.id);
            continue;
          }

          // Sync based on type
          await syncOperation(operation.type, storedData);

          // Remove from pending
          await deleteStoredOperation(operation.id);
          setPendingOperations((prev) =>
            prev.filter((op) => op.id !== operation.id)
          );
        } catch (error) {
          console.error('[Offline] Failed to sync operation:', operation.id, error);
        }
      }

      console.log('[Offline] Sync completed');

      // Show success notification
      if (pendingOperations.length > 0) {
        showNotification(
          'Sync Complete',
          `Successfully synced ${pendingOperations.length} changes`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Sync a single operation to the server
   */
  const syncOperation = async (type: string, data: any) => {
    switch (type) {
      case 'message':
        return fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

      case 'case_update':
        return fetch(`/api/cases/${data.caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.updates)
        });

      case 'note':
        return fetch(`/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

      default:
        console.warn('[Offline] Unknown operation type:', type);
    }
  };

  /**
   * Get stored operation from IndexedDB
   */
  const getStoredOperation = async (id: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('nomos_offline', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('updates', 'readonly');
        const store = tx.objectStore('updates');
        const getRequest = store.get(id);

        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result?.data);
      };
    });
  };

  /**
   * Delete stored operation from IndexedDB
   */
  const deleteStoredOperation = async (id: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('nomos_offline', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('updates', 'readwrite');
        const store = tx.objectStore('updates');
        const deleteRequest = store.delete(id);

        deleteRequest.onerror = () => reject(deleteRequest.error);
        deleteRequest.onsuccess = () => resolve();
      };
    });
  };

  /**
   * Show notification
   */
  const showNotification = (title: string, message: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/icons/icon-192.png'
      });
    }
  };

  // Μην δείχνουμε όταν είμαστε online, δεν υπάρχουν pending operations,
  // και το WebSocket είναι συνδεδεμένο
  const hasWebSocketIssues = !ws.isConnected || ws.messageQueue.length > 0;
  if (isOnline && pendingOperations.length === 0 && !hasWebSocketIssues) {
    return null;
  }

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-50 border-b border-red-200 px-4 py-3 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <WifiOff size={20} className="text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-900">
                  Είστε offline - τα δεδομένα θα συγχρονιστούν
                </p>
                <p className="text-xs text-red-700">
                  Using cached data • Changes will sync when online
                </p>
              </div>
            </div>

            {pendingOperations.length > 0 && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                {pendingOperations.length} pending
              </button>
            )}
          </div>
        </div>
      )}

      {/* Syncing banner */}
      {isSyncing && (
        <div className="fixed top-16 left-0 right-0 bg-blue-50 border-b border-blue-200 px-4 py-3 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin">
                <Wifi size={20} className="text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-blue-900">
                Σύγχρονη των {pendingOperations.length} αλλαγών...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WebSocket Status Banner */}
      {!ws.isConnected && ws.isReconnecting && (
        <div className="fixed top-16 left-0 right-0 bg-amber-50 border-b border-amber-200 px-4 py-3 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="animate-pulse">
                <Cloud size={20} className="text-amber-600" />
              </div>
              <p className="text-sm font-semibold text-amber-900">
                Επανασύνδεση στο server...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WebSocket Disconnected Banner */}
      {!ws.isConnected && !ws.isReconnecting && ws.messageQueue.length > 0 && (
        <div className="fixed top-16 left-0 right-0 bg-orange-50 border-b border-orange-200 px-4 py-3 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CloudX size={20} className="text-orange-600" />
              <div>
                <p className="text-sm font-semibold text-orange-900">
                  {ws.messageQueue.length} αναμενόμενα μηνύματα
                </p>
                <p className="text-xs text-orange-700">
                  Θα αποσταλούν όταν επανασυνδεθείτε
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending operations list */}
      {showDetails && pendingOperations.length > 0 && !isSyncing && (
        <div className="fixed top-32 left-4 right-4 max-w-md bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Pending Changes</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingOperations.map((op) => (
                <div
                  key={op.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200"
                >
                  <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {op.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTime(op.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {!isOnline && (
              <p className="mt-3 text-xs text-gray-500 text-center">
                Changes will sync when you go online
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

export default OfflineIndicator;
