/**
 * SyncStatusIndicator Component - Δείχνει real-time sync status
 * Φάση 1.7: Real-time Messaging
 */

import { Check, Cloud, CloudX, WifiOff } from 'lucide-react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useEffect, useState } from 'react';

interface SyncStatusIndicatorProps {
  showLabel?: boolean;
  justSynced?: boolean;
}

export function SyncStatusIndicator({ showLabel = true, justSynced = false }: SyncStatusIndicatorProps) {
  const ws = useWebSocketContext();
  const [showSyncCheck, setShowSyncCheck] = useState(justSynced);

  useEffect(() => {
    if (justSynced) {
      setShowSyncCheck(true);
      const timer = setTimeout(() => setShowSyncCheck(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [justSynced]);

  // Offline - δεν υπάρχει σύνδεση
  if (!ws.isConnected && !ws.isReconnecting) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#d32f2f]">
        <WifiOff size={14} />
        {showLabel && <span>Offline - θα συγχρονιστεί όταν έρθει σύνδεση</span>}
      </div>
    );
  }

  // Reconnecting
  if (ws.isReconnecting) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#ff9800]">
        <Cloud size={14} className="animate-pulse" />
        {showLabel && <span>Επανασύνδεση...</span>}
      </div>
    );
  }

  // Connected - μόλις συγχρονίστηκε
  if (showSyncCheck) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#4caf50]">
        <Check size={14} className="animate-bounce" />
        {showLabel && <span>✓ Συγχρονίστηκε με το server</span>}
      </div>
    );
  }

  // Connected - κανονικά
  if (ws.isConnected) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#6a8aaa]">
        <Cloud size={14} />
        {showLabel && <span>Σύνδεση ενεργή</span>}
      </div>
    );
  }

  return null;
}
