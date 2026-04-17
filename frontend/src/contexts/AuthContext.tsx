import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';

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
