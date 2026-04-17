import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { portalApi } from '@/lib/api';

export interface PortalUser {
  id: string;
  name: string;
  case_id: string;
  permissions: string[];
}

interface PortalAuthContextType {
  user: PortalUser | null;
  token: string | null;
  loading: boolean;
  login: (name: string, case_category: string, portal_code: string) => Promise<{ error: string | null }>;
  logout: () => void;
}

const PortalAuthContext = createContext<PortalAuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => ({ error: null }),
  logout: () => {},
});

export const usePortalAuth = () => useContext(PortalAuthContext);

export const PortalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nomos_portal_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to decode token and set user if it exists
    if (token) {
      try {
        // Simple JWT decode (in production, verify on backend)
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.type === 'portal') {
          setUser({
            id: payload.client_id || '',
            name: payload.client_name || '',
            case_id: payload.case_id || '',
            permissions: payload.permissions || [],
          });
        }
      } catch {
        localStorage.removeItem('nomos_portal_token');
        setToken(null);
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (name: string, case_category: string, portal_code: string): Promise<{ error: string | null }> => {
    try {
      const { data } = await portalApi.login(name, case_category, portal_code);
      const jwt = data.access_token ?? data.token;
      localStorage.setItem('nomos_portal_token', jwt);
      setToken(jwt);

      // Decode user from token
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1]));
        if (payload.type === 'portal') {
          setUser({
            id: payload.client_id || '',
            name: payload.client_name || data.client_name || '',
            case_id: payload.case_id || '',
            permissions: payload.permissions || [],
          });
        }
      } catch {
        // Token parsing failed but we have it
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.response?.data?.detail || 'Σφάλμα σύνδεσης' };
    }
  };

  const logout = () => {
    localStorage.removeItem('nomos_portal_token');
    setToken(null);
    setUser(null);
  };

  return (
    <PortalAuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
};
