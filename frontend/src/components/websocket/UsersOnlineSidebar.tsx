/**
 * UsersOnlineSidebar - Δείχνει χρήστες που είναι online σε ένα case
 * Φάση 1.7: Real-time Messaging
 */

import { useEffect, useState } from 'react';
import { Users, Circle, Cpu } from 'lucide-react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface OnlineUser {
  user_id: string;
  devices: {
    device_id: string;
    device_type: 'ios' | 'android' | 'web' | 'desktop';
    last_message_at: string;
  }[];
}

interface UsersOnlineSidebarProps {
  caseId: string;
  currentUserId?: string;
}

export function UsersOnlineSidebar({ caseId, currentUserId }: UsersOnlineSidebarProps) {
  const ws = useWebSocketContext();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());

  useEffect(() => {
    // Ακούγε για user.joined events
    const unsubJoined = ws.on('user.joined', (event) => {
      if (event.case_id !== caseId) return;

      setOnlineUsers(prev => {
        const newMap = new Map(prev);
        newMap.set(event.user_id, {
          user_id: event.user_id,
          devices: [],
        });
        return newMap;
      });
    });

    // Ακούγε για user.left events
    const unsubLeft = ws.on('user.left', (event) => {
      if (event.case_id !== caseId) return;

      setOnlineUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(event.user_id);
        return newMap;
      });
    });

    return () => {
      unsubJoined();
      unsubLeft();
    };
  }, [caseId, ws]);

  // Αν δεν υπάρχουν online χρήστες, δεν δείχνουμε τίποτα
  if (onlineUsers.size === 0) return null;

  const users = Array.from(onlineUsers.values()).filter(
    user => !currentUserId || user.user_id !== currentUserId
  );

  if (users.length === 0) return null;

  // Helper: Device type icon
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'ios':
        return '📱 iPhone';
      case 'android':
        return '📱 Android';
      case 'web':
        return '🌐 Web';
      case 'desktop':
        return '💻 Desktop';
      default:
        return '📱 Συσκευή';
    }
  };

  return (
    <div className="bg-[#0a1929] border border-[#1a3a5c] rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-semibold text-[#d4dce8]">
        <Users size={16} />
        <span>Online Χρήστες ({users.length})</span>
      </div>

      {/* Users List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {users.map((user) => (
          <div
            key={user.user_id}
            className="flex items-start gap-2 p-2 bg-[#071220] rounded hover:bg-[#1a3a5c] transition"
          >
            {/* Online Indicator */}
            <Circle size={8} className="text-[#4caf50] mt-1 flex-shrink-0" />

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#d4dce8] truncate">
                {user.user_id}
              </p>

              {/* Devices */}
              {user.devices.length > 0 && (
                <div className="mt-1 space-y-1">
                  {user.devices.map((device, idx) => (
                    <div
                      key={`${device.device_id}-${idx}`}
                      className="text-xs text-[#6a8aaa] flex items-center gap-1"
                    >
                      <Cpu size={10} />
                      <span>{getDeviceIcon(device.device_type)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="text-xs text-[#6a8aaa] border-t border-[#1a3a5c] pt-2">
        <p>✓ Real-time updates enabled</p>
      </div>
    </div>
  );
}
