import { useEffect, useState } from 'react';
import { Plus, Copy, CheckCircle, XCircle, AlertCircle, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';
import { casesApi, adminPortalApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

interface PortalAccessCode {
  id: string;
  case_id: string;
  client_id: string;
  portal_code: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  accessed_at?: string;
}

interface PortalResetRequest {
  _id: string;
  case_id: string;
  name: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

const AVAILABLE_PERMISSIONS = [
  { key: 'case_title', label: 'Τίτλος Υπόθεσης' },
  { key: 'case_number', label: 'Αριθμός Υπόθεσης' },
  { key: 'case_status', label: 'Κατάσταση' },
  { key: 'client_name', label: 'Όνομα Πελάτη' },
  { key: 'lawyer_name', label: 'Όνομα Δικηγόρου' },
  { key: 'lawyer_email', label: 'Email Δικηγόρου' },
  { key: 'total_fees', label: 'Συνολική Αμοιβή' },
  { key: 'outstanding_balance', label: 'Ανεξόφλητο Ποσό' },
];

export default function AdminPortalPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [accessCodes, setAccessCodes] = useState<PortalAccessCode[]>([]);
  const [resetRequests, setResetRequests] = useState<PortalResetRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCase, setSelectedCase] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    'case_title', 'case_number', 'case_status', 'lawyer_name', 'lawyer_email',
    'total_fees', 'outstanding_balance'
  ]);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const perms = usePermissions();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [casesRes, codesRes, resetRes] = await Promise.all([
          casesApi.list().catch(() => ({ data: [] })),
          adminPortalApi.listPortalAccess().catch(() => ({ data: [] })),
          adminPortalApi.listResetRequests().catch(() => ({ data: [] })),
        ]);
        setCases(casesRes.data || []);
        setAccessCodes(codesRes.data || []);
        setResetRequests(resetRes.data || []);
      } catch (err) {
        console.error('Error loading admin data:', err);
        toast.error('Σφάλμα φόρτωσης δεδομένων');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) {
      toast.error('Παρακαλώ επιλέξτε υπόθεση');
      return;
    }
    if (selectedPermissions.length === 0) {
      toast.error('Παρακαλώ επιλέξτε τουλάχιστον ένα δικαίωμα');
      return;
    }

    setGenerating(true);
    try {
      const selectedCaseObj = cases.find(c => c._id === selectedCase);
      if (!selectedCaseObj?.client_id) {
        toast.error('Η υπόθεση δεν έχει συνδεδεμένο πελάτη');
        setGenerating(false);
        return;
      }
      const response = await adminPortalApi.generatePortalAccess(selectedCaseObj.client_id, selectedCase, selectedPermissions);
      const newCode = response.data.portal_code;
      toast.success(`Κωδικός δημιουργήθηκε: ${newCode}`);
      const codesRes = await adminPortalApi.listPortalAccess().catch(() => ({ data: [] }));
      setAccessCodes(codesRes.data || []);
      setSelectedCase();
      setSelectedPermissions([
        case_title, case_number, case_status, lawyer_name, lawyer_email,
        total_fees, outstanding_balance
      ]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα δημιουργίας κωδικού');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('Κωδικός αντιγράφηκε');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleApproveReset = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await adminPortalApi.approveResetRequest(id);
      const newCode = res.data.new_portal_code;
      toast.success();
      setResetRequests(resetRequests.filter(r => r._id !== id));
      const codesRes = await adminPortalApi.listPortalAccess().catch(() => ({ data: [] }));
      setAccessCodes(codesRes.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectReset = async (id: string) => {
    setRejectingId(id);
    try {
      await adminPortalApi.rejectResetRequest(id);
      toast.success('Αίτηση απορρίφθηκε');
      setResetRequests(resetRequests.filter(r => r._id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα');
    } finally {
      setRejectingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="page-title">Διαχείριση Πύλης Πελάτη</h2>
        <p className="page-subtitle">Δημιουργία κωδικών πρόσβασης και διαχείριση δικαιωμάτων</p>
      </div>

      {/* Generate Portal Access Code */}
      <div className="glass-card p-6 border border-[#1a3a5c]">
        <h3 className="text-lg font-semibold text-white mb-6">Δημιουργία Κωδικού Πρόσβασης</h3>
        <form onSubmit={handleGenerateCode} className="space-y-4">
          {/* Select Case */}
          <div>
            <label className="label">Επιλέξτε Υπόθεση</label>
            <select
              value={selectedCase}
              onChange={e => setSelectedCase(e.target.value)}
              className="input-dark"
              required
            >
              <option value="">— Επιλέξτε —</option>
              {cases.map(c => (
                <option key={c._id} value={c._id}>
                  {c.title} ({c.number})
                </option>
              ))}
            </select>
          </div>

          {/* Permission Checkboxes */}
          <div>
            <label className="label">Δικαιώματα Πρόσβασης</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AVAILABLE_PERMISSIONS.map(perm => (
                <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(perm.key)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedPermissions([...selectedPermissions, perm.key]);
                      } else {
                        setSelectedPermissions(selectedPermissions.filter(p => p !== perm.key));
                      }
                    }}
                    className="w-4 h-4 rounded border-[#1a3a5c] bg-[#0d2035] cursor-pointer accent-[#C6A75E]"
                  />
                  <span className="text-sm text-[#d4dce8]">{perm.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={generating}
            className="btn-gold w-full flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            {generating ? 'Δημιουργία...' : 'Δημιουργία Κωδικού'}
          </button>
        </form>
      </div>

      {/* Active Portal Access Codes */}
      {accessCodes.length > 0 && (
        <div className="glass-card overflow-hidden table-scroll border border-[#1a3a5c]">
          <div className="p-5 border-b border-[#1a3a5c]/40">
            <h3 className="section-title">Ενεργοί Κωδικοί Πρόσβασης</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-premium">
              <thead>
                <tr className="bg-[#0d2035]/40">
                  <th>Κωδικός</th>
                  <th className="hidden sm:table-cell">Υπόθεση</th>
                  <th className="hidden md:table-cell">Δικαιώματα</th>
                  <th className="hidden sm:table-cell">Δημιουργία</th>
                  <th className="hidden sm:table-cell">Τελευταία Πρόσβαση</th>
                  <th>Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {accessCodes.map(code => (
                  <tr key={code.id}>
                    <td className="font-mono text-sm text-[#C6A75E] flex items-center gap-2">
                      {code.portal_code}
                      <button
                        onClick={() => handleCopyCode(code.portal_code)}
                        className="p-1 hover:bg-[#132B45] rounded transition-colors"
                        title="Αντιγραφή"
                      >
                        <Copy size={14} className={copiedCode === code.portal_code ? 'text-emerald-400' : 'text-[#5a7a9a]'} />
                      </button>
                    </td>
                    <td className="hidden sm:table-cell text-xs text-[#8aa0b8]">
                      {cases.find(c => c._id === code.case_id)?.title || '—'}
                    </td>
                    <td className="hidden md:table-cell text-xs text-[#8aa0b8]">
                      <button
                        onClick={() => setShowPermissions(showPermissions === code.id ? null : code.id)}
                        className="inline-flex items-center gap-1 text-[#C6A75E] hover:underline"
                      >
                        {code.permissions.length} δικαιώματα
                        {showPermissions === code.id ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      {showPermissions === code.id && (
                        <div className="mt-2 p-2 bg-[#0d2035]/40 rounded text-[10px] text-[#8aa0b8] space-y-1">
                          {code.permissions.map(p => (
                            <div key={p}>• {AVAILABLE_PERMISSIONS.find(ap => ap.key === p)?.label || p}</div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="hidden sm:table-cell text-xs text-[#5a7a9a]">
                      {new Date(code.created_at).toLocaleDateString('el-GR')}
                    </td>
                    <td className="hidden sm:table-cell text-xs text-[#5a7a9a]">
                      {code.accessed_at ? new Date(code.accessed_at).toLocaleDateString('el-GR') : '—'}
                    </td>
                    <td>
                      <button
                        onClick={async () => {
                          try {
                            await adminPortalApi.deletePortalAccess(code.id);
                            setAccessCodes(accessCodes.filter(c => c.id !== code.id));
                            toast.success('Κωδικός διαγράφηκε');
                          } catch {
                            toast.error('Σφάλμα διαγραφής');
                          }
                        }}
                        className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400 transition-colors"
                        title="Διαγραφή"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Password Reset Requests */}
      {resetRequests.length > 0 && (
        <div className="glass-card overflow-hidden table-scroll border border-amber-500/20">
          <div className="p-5 border-b border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-400" />
              <h3 className="section-title">Αιτήματα Επαναφοράς Κωδικού</h3>
              <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                {resetRequests.filter(r => r.status === 'pending').length}
              </span>
            </div>
          </div>
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Πελάτης</th>
                <th className="hidden sm:table-cell">Υπόθεση</th>
                <th className="hidden sm:table-cell">Αίτημα</th>
                <th className="hidden sm:table-cell">Κατάσταση</th>
                <th>Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {resetRequests.map(req => (
                <tr key={req._id} className="bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                  <td className="font-medium text-[#d4dce8]">{req.name}</td>
                  <td className="hidden sm:table-cell text-xs text-[#8aa0b8]">
                    {cases.find(c => c._id === req.case_id)?.title || '—'}
                  </td>
                  <td className="hidden sm:table-cell text-xs text-[#5a7a9a]">
                    {new Date(req.created_at).toLocaleDateString('el-GR')}
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      req.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {req.status === 'pending' ? 'Εκκρεμεί' : req.status === 'approved' ? 'Εγκρίθηκε' : 'Απορρίφθηκε'}
                    </span>
                  </td>
                  <td>
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveReset(req._id)}
                          disabled={approvingId === req._id}
                          className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
                          title="Έγκριση"
                        >
                          {approvingId === req._id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                        <button
                          onClick={() => handleRejectReset(req._id)}
                          disabled={rejectingId === req._id}
                          className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          title="Απόρριψη"
                        >
                          {rejectingId === req._id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {accessCodes.length === 0 && resetRequests.length === 0 && (
        <div className="glass-card p-12 border border-[#1a3a5c] text-center">
          <AlertCircle size={32} className="mx-auto mb-4 text-[#5a7a9a]" />
          <p className="text-sm text-[#8aa0b8]">Δεν υπάρχουν κωδικοί πρόσβασης ή αιτήματα αποκατάστασης.</p>
        </div>
      )}
    </div>
  );
}
