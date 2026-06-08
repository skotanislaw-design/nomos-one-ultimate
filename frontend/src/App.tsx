import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PortalAuthProvider, usePortalAuth } from '@/contexts/PortalAuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { Toaster, toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/LoginPage';
import ClientPortalLoginPage from '@/pages/ClientPortalLoginPage';
import ClientPortalPage from '@/pages/ClientPortalPage';
import { initializeFirebase } from '@/lib/firebase';
import PaymentGateModal from '@/components/PaymentGateModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#071220]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin mx-auto mb-4" />
        <p className="text-sm text-[#6a8aaa]">Φόρτωση Nomos One...</p>
      </div>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = usePortalAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#071220]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin mx-auto mb-4" />
        <p className="text-sm text-[#6a8aaa]">Φόρτωση...</p>
      </div>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/portal/login" replace />;
}

export default function App() {
  useEffect(() => {
    initializeFirebase().catch(() => {});
  }, []);

  // In-app toast fallback for push notifications (fires when service worker receives push)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        toast(event.data.title || 'Nomos One', {
          description: event.data.body,
          duration: 8000,
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return (
    <AuthProvider>
      <WebSocketProvider>
        <PortalAuthProvider>
          <Toaster position="top-right" theme="dark" richColors />
          <PaymentGateModal />
          <Routes>
          {/* Main app routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />

          {/* Portal routes */}
          <Route path="/portal/login" element={<ClientPortalLoginPage />} />
          <Route path="/portal/dashboard" element={<PortalProtectedRoute><ClientPortalPage /></PortalProtectedRoute>} />
        </Routes>
        </PortalAuthProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
