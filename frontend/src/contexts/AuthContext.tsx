import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'lawyer' | 'secretary' | 'trainee';
  approved?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;
  changePassword: (current: string, newPw: string) => Promise<{ error: string | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, token: null, loading: true,
  login: async () => ({ error: null }),
  logout: () => {},
  changePassword: async () => ({ error: null }),
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nomos_token'));
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      localStorage.removeItem('nomos_token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  // Register device for PWA push notifications
  useEffect(() => {
    const registerDevice = async () => {
      if (!user || !token) return;

      try {
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }

        // Only proceed if notification permission granted
        if (Notification.permission !== 'granted') return;

        // Register device with backend
        try {
          const userAgent = navigator.userAgent;
          const appVersion = process.env.REACT_APP_VERSION || '1.0.0';

          // Determine device type
          let deviceType: 'ios' | 'android' | 'web' | 'desktop' = 'web';
          if (/iphone|ipad|ipod/i.test(userAgent)) deviceType = 'ios';
          else if (/android/i.test(userAgent)) deviceType = 'android';
          else if (/windows|linux|mac/i.test(userAgent) && !/mobile|tablet/i.test(userAgent)) {
            deviceType = 'desktop';
          }

          // Generate device name
          let deviceName = 'Device';
          if (/iPhone/.test(userAgent)) deviceName = 'iPhone';
          else if (/iPad/.test(userAgent)) deviceName = 'iPad';
          else if (/Android/.test(userAgent)) deviceName = 'Android Device';
          else if (/Windows/.test(userAgent)) deviceName = 'Windows PC';
          else if (/Mac/.test(userAgent)) deviceName = 'Mac';
          else if (/Linux/.test(userAgent)) deviceName = 'Linux';

          // Try to get push token (placeholder for now, Firebase would be used in production)
          const pushToken = localStorage.getItem('nomos_push_token') ||
                           `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem('nomos_push_token', pushToken);

          // Register device
          await axios.post('/api/v1/auth/register-device', {
            device_name: deviceName,
            device_type: deviceType,
            push_token: pushToken,
            app_version: appVersion
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });

          console.log('[Auth] Device registered for push notifications');
        } catch (deviceError) {
          console.error('[Auth] Failed to register device:', deviceError);
          // Don't fail login if device registration fails
        }
      } catch (error) {
        console.error('[Auth] Device registration error:', error);
      }
    };

    if (user && token) {
      registerDevice();
    }
  }, [user, token]);

  const login = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data } = await authApi.login(email, password);
      const jwt = data.access_token ?? data.token;
      localStorage.setItem('nomos_token', jwt);
      setToken(jwt);
      setUser(data.user);
      return { error: null };
    } catch (err: any) {
      return { error: err.response?.data?.detail || 'Σφάλμα σύνδεσης' };
    }
  };

  const logout = () => {
    localStorage.removeItem('nomos_token');
    setToken(null);
    setUser(null);
  };

  const changePassword = async (current: string, newPw: string): Promise<{ error: string | null }> => {
    try {
      await authApi.changePassword(current, newPw);
      return { error: null };
    } catch (err: any) {
      return { error: err.response?.data?.detail || 'Σφάλμα αλλαγής κωδικού' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
