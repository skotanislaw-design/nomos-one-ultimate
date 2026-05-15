import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, User, Code, X, Mail, AlertCircle } from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { toast } from 'sonner';

export default function ClientPortalLoginPage() {
  const { login, user } = usePortalAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [caseCategory, setCaseCategory] = useState('');
  const [portalCode, setPortalCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotName, setForgotName] = useState('');
  const [forgotCategory, setForgotCategory] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  if (user) { navigate('/portal/dashboard'); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(name, caseCategory, portalCode);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
    } else {
      navigate('/portal/dashboard');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotName || !forgotCategory) {
      toast.error('Παρακαλώ συμπληρώστε όλα τα πεδία');
      return;
    }
    setForgotLoading(true);
    try {
      await portalApi.forgotPassword(forgotName, forgotCategory);
      toast.success('Ελέγξτε το email σας για συνδέσμου επαναφοράς');
      setShowForgotPassword(false);
      setForgotName('');
      setForgotCategory('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally {
      setForgotLoading(false);
    }
  };

  const caseCategories = [
    'Εργατικό Δίκαιο',
    'Οικογενειακό Δίκαιο',
    'Πολιτικό Δίκαιο',
    'Εμπορικό Δίκαιο',
    'Διοικητικό Δίκαιο',
    'Ποινικό Δίκαιο',
    'Φορολογικό Δίκαιο',
    'Περιβαλλοντικό Δίκαιο',
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#C6A75E]/20">
            <Scale size={28} className="text-[#071220]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>NOMOS ONE</h1>
          <p className="text-sm text-[#6a8aaa]">Πύλη Πελάτη — Client Portal</p>
        </div>

        {/* Login Form */}
        {!showForgotPassword && (
          <div className="glass-card p-8 border border-[#1a3a5c]">
            <h2 className="text-lg font-semibold text-white mb-6">Σύνδεση στη Πύλη</h2>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <div>{error}</div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Ονοματεπώνυμο</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="input-dark pl-9"
                    placeholder="π.χ. Γιάννης Παπαδόπουλος"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Κατηγορία Υπόθεσης</label>
                <select
                  value={caseCategory}
                  onChange={e => setCaseCategory(e.target.value)}
                  className="input-dark"
                  required
                >
                  <option value="">— Επιλέξτε —</option>
                  {caseCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Κωδικός Πύλης</label>
                <div className="relative">
                  <Code size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
                  <input
                    type="text"
                    value={portalCode}
                    onChange={e => setPortalCode(e.target.value.toUpperCase())}
                    className="input-dark pl-9 font-mono tracking-widest"
                    placeholder="ABC123XYZ"
                    required
                  />
                </div>
                <p className="text-[10px] text-[#5a7a9a] mt-1">Λάβατε αυτόν τον κωδικό μέσω email</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-gold w-full py-3 font-medium"
              >
                {loading ? 'Σύνδεση...' : 'Είσοδος'}
              </button>
            </form>

            <div className="border-t border-[#1a3a5c]/40 mt-6 pt-4">
              <button
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-[#8aa0b8] hover:text-[#C6A75E] transition-colors w-full text-center"
              >
                Ξεχάσατε τον κωδικό σας;
              </button>
            </div>
          </div>
        )}

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="glass-card p-8 border border-[#1a3a5c]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Επαναφορά Κωδικού</h2>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="p-1 hover:bg-[#132B45] rounded transition-colors"
              >
                <X size={18} className="text-[#7a9ab8]" />
              </button>
            </div>

            <p className="text-xs text-[#8aa0b8] mb-4">
              Εισάγετε τα στοιχεία σας και θα λάβετε έναν σύνδεσμο επαναφοράς στο email σας.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="label">Ονοματεπώνυμο</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
                  <input
                    type="text"
                    value={forgotName}
                    onChange={e => setForgotName(e.target.value)}
                    className="input-dark pl-9"
                    placeholder="π.χ. Γιάννης Παπαδόπουλος"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Κατηγορία Υπόθεσης</label>
                <select
                  value={forgotCategory}
                  onChange={e => setForgotCategory(e.target.value)}
                  className="input-dark"
                  required
                >
                  <option value="">— Επιλέξτε —</option>
                  {caseCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="btn-gold w-full py-3 font-medium"
              >
                {forgotLoading ? 'Αποστολή...' : 'Αποστολή Συνδέσμου'}
              </button>
            </form>

            <div className="border-t border-[#1a3a5c]/40 mt-6 pt-4">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-xs text-[#8aa0b8] hover:text-[#C6A75E] transition-colors w-full text-center"
              >
                Επιστροφή στη Σύνδεση
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-[11px] text-[#4a6a8a]">
            Σκοτάνης & Συνεργάτες — Εμπιστευτική Πύλη Πελάτη
          </p>
        </div>
      </div>
    </div>
  );
}
