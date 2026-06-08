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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(token: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    if ('Notification' in window && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key
    const { data } = await axios.get('/api/v1/push/vapid-public-key', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const applicationServerKey = urlBase64ToUint8Array(data.public_key);

    // Subscribe (or reuse existing)
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }

    const subJson = sub.toJSON() as { endpoint: string; keys: { auth: string; p256dh: string } };

    await axios.post('/api/v1/push/subscribe', {
      endpoint: subJson.endpoint,
      auth: subJson.keys.auth,
      p256dh: subJson.keys.p256dh,
      user_agent: navigator.userAgent,
    }, { headers: { Authorization: `Bearer ${token}` } });

    // Also register device (for trusted-device/2FA logic)
    const ua = navigator.userAgent;
    let deviceType: 'ios' | 'android' | 'web' | 'desktop' = 'web';
    if (/iphone|ipad|ipod/i.test(ua)) deviceType = 'ios';
    else if (/android/i.test(ua)) deviceType = 'android';
    else if (/windows|linux|mac/i.test(ua) && !/mobile|tablet/i.test(ua)) deviceType = 'desktop';

    let deviceName = 'Browser';
    if (/iPhone/.test(ua)) deviceName = 'iPhone';
    else if (/iPad/.test(ua)) deviceName = 'iPad';
    else if (/Android/.test(ua)) deviceName = 'Android';
    else if (/Windows/.test(ua)) deviceName = 'Windows PC';
    else if (/Mac/.test(ua)) deviceName = 'Mac';
    else if (/Linux/.test(ua)) deviceName = 'Linux';

    const deviceId = localStorage.getItem('nomos_device_id') ||
      `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('nomos_device_id', deviceId);

    await axios.post('/api/v1/auth/register-device', {
      device_name: deviceName,
      device_type: deviceType,
      push_token: deviceId,
      app_version: '1.0.0',
    }, { headers: { Authorization: `Bearer ${token}` } });

    console.log('[Push] Subscribed successfully');
  } catch (e) {
    console.warn('[Push] Subscription failed:', e);
  }
}

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

  useEffect(() => {
    if (user && token) subscribeToPush(token);
  }, [user?.id, token]);

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
