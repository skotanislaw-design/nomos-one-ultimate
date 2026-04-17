import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/LoginPage';

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

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" theme="dark" richColors />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
