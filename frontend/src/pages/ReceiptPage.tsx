import { useEffect, useState } from 'react';
import { Eye, Printer, Mail, Loader2, FileText } from 'lucide-react';
import { casesApi, auditApi, invoicingApi, exportApi, emailApi, settingsApi } from '@/lib/api';
import { parseTs } from '@/lib/prefs';
import { toast } from 'sonner';

const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;

type ActionType = {
  _id?: string;
  id?: string;
  action: string;
  user_name: string;
  entity_type: string;
  created_at: string;
  details?: string;
};

interface ReceiptData {
  case: any;
  actions: ActionType[];
  invoices: any[];
  totalFees: number;
  totalExpenses: number;
  loading: boolean;
}

export default function ReceiptPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [firm, setFirm] = useState({ name: '', address: '', phone: '', email: '', afm: '' });
  const [receiptData, setReceiptData] = useState<ReceiptData>({
    case: null,
    actions: [],
    invoices: [],
    totalFees: 0,
    totalExpenses: 0,
    loading: false
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  /* ── Load cases + firm settings ── */
  const loadCases = () => {
    casesApi.list()
      .then(r => setCases(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCases([]));
  };

  useEffect(() => {
    loadCases();
    settingsApi.get().then(r => {
      const s = r.data || {};
      setFirm({
        name: s.firm_name || s.name || 'Σκοτάνης & Συνεργάτες',
        address: s.firm_address || s.address || 'Αθήνα, Ελλάδα',
        phone: s.firm_phone || s.phone || '',
        email: s.firm_email || s.email || 'christos@skotanislaw.com',
        afm: s.firm_afm || s.afm || '',
      });
    }).catch(() => {});
  }, []);

  /* ── Load receipt data for selected case ── */
  useEffect(() => {
    if (!selectedCaseId) {
      setReceiptData({ case: null, actions: [], invoices: [], totalFees: 0, totalExpenses: 0, loading: false });
      return;
    }

    setReceiptData(prev => ({ ...prev, loading: true }));

    Promise.all([
      casesApi.get(selectedCaseId).catch(() => ({ data: {} })),
      (auditApi?.listByCaseId?.(selectedCaseId) || Promise.resolve({ data: [] })).catch(() => ({ data: [] })),
      casesApi.getInvoices(selectedCaseId).catch(() => ({ data: [] })),
      casesApi.getFinancials(selectedCaseId).catch(() => ({ entries: [] })),
    ]).then(([caseRes, auditRes, invRes, finRes]: any) => {
      const caseData = caseRes?.data || caseRes || {};
      const actions = (auditRes.data || []).filter((a: any) => a.case_id === selectedCaseId || !a.case_id);
      const invoices = invRes.data || [];
      const financials = finRes.entries || [];

      const totalFees = financials
        .filter((f: any) => f.entry_type === 'fee')
        .reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
      const totalExpenses = financials
        .filter((f: any) => f.entry_type === 'expense')
        .reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

      setReceiptData({
        case: caseData,
        actions: actions.sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ),
        invoices,
        totalFees,
        totalExpenses,
        loading: false
      });
    }).catch(() => {
      setReceiptData(prev => ({ ...prev, loading: false }));
      toast.error('Σφάλμα κατά τη φόρτωση δεδομένων');
    });
  }, [selectedCaseId]);

  /* ── Send receipt by email ── */
  const sendReceiptEmail = async () => {
    if (!receiptData.case) {
      toast.error('Επιλέξτε υπόθεση');
      return;
    }

    const toEmail = receiptData.case.client_email || receiptData.case.email || '';
    if (!toEmail) {
      toast.error('Δεν υπάρχει email πελάτη');
      return;
    }

    setEmailSending(true);
    try {
      await emailApi.send({
        to_email: toEmail,
        to_name: receiptData.case.client_name,
        subject: `Απόδειξη Παροχής Υπηρεσιών - ${receiptData.case.title}`,
        body_html: generateReceiptHTML(),
      });
      toast.success('Απόδειξη εστάλη');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής');
    } finally {
      setEmailSending(false);
    }
  };

  /* ── Print receipt ── */
  const downloadReceiptPDF = async () => {
    if (!receiptData.case) {
      toast.error('Επιλέξτε υπόθεση');
      return;
    }

    setPdfDownloading(true);
    try {
      const printArea = document.getElementById('receipt-print');
      if (printArea) {
        const win = window.open('', '', 'height=800,width=800');
        if (win) {
          win.document.write(`<html><head><title>Απόδειξη</title></head><body>${printArea.innerHTML}</body></html>`);
          win.document.close();
          win.print();
        }
      }
    } catch (err: any) {
      toast.error('Σφάλμα εκτύπωσης');
    } finally {
      setPdfDownloading(false);
    }
  };

  /* ── Generate receipt HTML for email ── */
  const generateReceiptHTML = (): string => {
    return `
      <div style="font-family:Arial,sans-serif;max-width:800px;color:#1a1a2e;">
        <div style="background:#071220;padding:30px;border-radius:8px 8px 0 0;text-align:center;">
          <h1 style="color:#C6A75E;margin:0;">${firm.name}</h1>
          <p style="color:#6a8aaa;margin:8px 0;font-size:14px;">Νομικό Γραφείο</p>
          <h2 style="color:#C6A75E;margin:20px 0 0;font-size:24px;">ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ</h2>
        </div>
        <div style="padding:30px;background:#f8f9fa;border:1px solid #e0e0e0;border-top:none;">
          <table style="width:100%;margin-bottom:20px;">
            <tr>
              <td style="font-weight:bold;color:#071220;">Υπόθεση:</td>
              <td style="color:#1a1a2e;">${receiptData.case?.title || '—'}</td>
            </tr>
            <tr>
              <td style="font-weight:bold;color:#071220;">Αρ. Υπόθεσης:</td>
              <td style="color:#1a1a2e;">${receiptData.case?.case_number || '—'}</td>
            </tr>
            <tr>
              <td style="font-weight:bold;color:#071220;">Πελάτης:</td>
              <td style="color:#1a1a2e;">${receiptData.case?.client_name || '—'}</td>
            </tr>
            <tr>
              <td style="font-weight:bold;color:#071220;">Δικηγόρος:</td>
              <td style="color:#1a1a2e;">${receiptData.case?.lawyer_name || '—'}</td>
            </tr>
          </table>

          <h3 style="color:#071220;margin-top:30px;">Συνοπτική Περίληψη Ενεργειών</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead>
              <tr style="background:#071220;color:white;">
                <th style="padding:12px;text-align:left;font-size:12px;">Ημερομηνία</th>
                <th style="padding:12px;text-align:left;font-size:12px;">Ενέργεια</th>
                <th style="padding:12px;text-align:left;font-size:12px;">Χρήστης</th>
              </tr>
            </thead>
            <tbody>
              ${receiptData.actions.slice(0, 20).map((action: ActionType) => `
                <tr style="border-bottom:1px solid #e0e0e0;">
                  <td style="padding:10px;font-size:12px;color:#666;">${
                    parseTs(action.created_at)?.toLocaleDateString('el-GR') ?? '—'
                  }</td>
                  <td style="padding:10px;font-size:12px;color:#071220;">${formatActionLabel(action.action)}</td>
                  <td style="padding:10px;font-size:12px;color:#666;">${action.user_name || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h3 style="color:#071220;margin-top:30px;">Χρεώσεις Υπηρεσιών</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f0f0f0;">
              <td style="padding:12px;font-weight:bold;color:#071220;">Συνολικά Δικηγορικά Δικαιώματα</td>
              <td style="padding:12px;text-align:right;font-weight:bold;color:#C6A75E;">${fmt(receiptData.totalFees)}</td>
            </tr>
            <tr>
              <td style="padding:12px;color:#666;">Συνολικές Δαπάνες</td>
              <td style="padding:12px;text-align:right;color:#666;">${fmt(receiptData.totalExpenses)}</td>
            </tr>
            <tr style="background:#071220;color:white;">
              <td style="padding:12px;font-weight:bold;font-size:14px;">ΣΥΝΟΛΟ</td>
              <td style="padding:12px;text-align:right;font-weight:bold;font-size:14px;">${fmt(receiptData.totalFees + receiptData.totalExpenses)}</td>
            </tr>
          </table>

          <p style="color:#666;font-size:12px;margin-top:30px;text-align:center;">
            Αυτή η απόδειξη επιβεβαιώνει ότι οι ανωτέρω υπηρεσίες παρασχέθησαν στον/στην ανωτέρω πελάτη σύμφωνα με τους όρους της σύμβασης.
          </p>
          <p style="color:#999;font-size:11px;margin-top:20px;border-top:1px solid #ddd;padding-top:20px;">
            ${firm.name} | ${firm.address}${firm.phone ? ' | ' + firm.phone : ''} | ${firm.email}${firm.afm ? ' | ΑΦΜ: ' + firm.afm : ''}
          </p>
        </div>
      </div>
    `;
  };

  const formatActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      'CREATE_CASE': 'Δημιουργία Υπόθεσης',
      'CREATE_NOTE': 'Σημείωση',
      'CREATE_DEADLINE': 'Προσθήκη Προθεσμίας',
      'UPDATE_CASE': 'Ενημέρωση Υπόθεσης',
      'CREATE_FINANCIAL': 'Καταγραφή Χρέωσης',
      'CREATE_DOCUMENT': 'Ανέβασμα Εγγράφου',
      'CREATE_INVOICE': 'Δημιουργία Τιμολογίου',
      'UPDATE_STATUS': 'Αλλαγή Κατάστασης',
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Απόδειξη Παροχής Υπηρεσιών</h2>
          <p className="page-subtitle">Σύνοψη ενεργειών και χρεώσεων ανά υπόθεση</p>
        </div>
        <div className="flex gap-2">
          {selectedCaseId && (
            <>
              <button
                onClick={sendReceiptEmail}
                disabled={emailSending}
                className="btn-dark text-xs flex items-center gap-1.5 text-blue-400 border-blue-500/30"
              >
                {emailSending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                Email
              </button>
              <button
                onClick={downloadReceiptPDF}
                disabled={pdfDownloading}
                className="btn-dark text-xs flex items-center gap-1.5"
              >
                {pdfDownloading ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                Εκτύπωση
              </button>
              <button
                onClick={() => setPreviewOpen(!previewOpen)}
                className="btn-gold text-xs flex items-center gap-1.5"
              >
                <Eye size={13} /> Προεπισκόπηση
              </button>
            </>
          )}
        </div>
      </div>

      {/* Case Selector */}
      <div className="glass-card p-5">
        <label className="label">Επιλέξτε Υπόθεση</label>
        <select
          value={selectedCaseId}
          onChange={e => setSelectedCaseId(e.target.value)}
          className="input-dark"
        >
          <option value="">Επιλέξτε υπόθεση...</option>
          {cases.map(c => (
            <option key={c._id || c.id} value={c._id || c.id}>
              {c.title} — {c.case_number} ({c.client_name})
            </option>
          ))}
        </select>
      </div>

      {/* Receipt Data */}
      {selectedCaseId && !receiptData.loading && receiptData.case && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4 border-l-[3px] border-blue-500/40">
              <FileText size={18} className="text-blue-400 mb-2" />
              <p className="text-2xl font-bold text-white">{receiptData.actions.length}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Συνολικές Ενέργειες</p>
            </div>
            <div className="glass-card p-4 border-l-[3px] border-amber-500/40">
              <FileText size={18} className="text-amber-400 mb-2" />
              <p className="text-2xl font-bold text-amber-400">{fmt(receiptData.totalFees)}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Δικηγορικά Δικαιώματα</p>
            </div>
            <div className="glass-card p-4 border-l-[3px] border-amber-500/40">
              <FileText size={18} className="text-amber-400 mb-2" />
              <p className="text-2xl font-bold text-amber-400">{fmt(receiptData.totalExpenses)}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Δαπάνες</p>
            </div>
            <div className="glass-card p-4 border-l-[3px] border-emerald-500/40">
              <FileText size={18} className="text-emerald-400 mb-2" />
              <p className="text-2xl font-bold text-emerald-400">{fmt(receiptData.totalFees + receiptData.totalExpenses)}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">Σύνολο</p>
            </div>
          </div>

          {/* Case Info */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Στοιχεία Υπόθεσης</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Τίτλος</p>
                <p className="text-sm font-medium text-[#d4dce8]">{receiptData.case.title}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Αρ. Υπόθεσης</p>
                <p className="text-sm font-medium text-[#d4dce8] font-mono">{receiptData.case.case_number || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Πελάτης</p>
                <p className="text-sm font-medium text-[#d4dce8]">{receiptData.case.client_name || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Δικηγόρος</p>
                <p className="text-sm font-medium text-[#d4dce8]">{receiptData.case.lawyer_name || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Κατάσταση</p>
                <p className="text-sm font-medium text-[#d4dce8]">{receiptData.case.status || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#5a7a9a] uppercase">Κατηγορία</p>
                <p className="text-sm font-medium text-[#d4dce8]">{receiptData.case.category || '—'}</p>
              </div>
            </div>
          </div>

          {/* Actions Timeline */}
          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Χρονολόγιο Ενεργειών</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {receiptData.actions.length === 0 ? (
                <p className="text-sm text-[#5a7a9a] text-center py-4">Καμία ενέργεια καταγεγραμμένη</p>
              ) : (
                receiptData.actions.map((action: ActionType, idx: number) => (
                  <div key={action._id || action.id || idx} className="flex gap-4 pb-3 border-b border-[#1a3a5c]/20 last:border-0">
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-[#C6A75E] mt-2" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[#d4dce8]">{formatActionLabel(action.action)}</p>
                        <p className="text-xs text-[#5a7a9a] flex-shrink-0">
                          {parseTs(action.created_at)?.toLocaleDateString('el-GR') ?? '—'}
                        </p>
                      </div>
                      <p className="text-xs text-[#8aa0b8] mt-0.5">
                        {action.user_name ? `από ${action.user_name}` : '—'}
                      </p>
                      {action.details && (
                        <p className="text-xs text-[#6a8aaa] mt-1 italic">{action.details}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {selectedCaseId && receiptData.loading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && receiptData.case && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-2xl my-6 bg-white text-gray-900 rounded-lg overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Preview Header */}
            <div className="p-4 bg-[#071220] border-b flex justify-between items-center">
              <h3 className="text-white font-bold">Προεπισκόπηση Απόδειξης</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-[#7a9ab8] hover:text-white">
                ✕
              </button>
            </div>

            {/* Receipt Document */}
            <div id="receipt-print" className="p-8 space-y-6">
              {/* Header */}
              <div className="text-center border-b pb-6">
                <h1 className="text-2xl font-bold text-[#071220]">{firm.name}</h1>
                <p className="text-sm text-gray-600">{firm.address}</p>
                <p className="text-sm text-gray-600">{firm.phone}{firm.phone && firm.email ? ' | ' : ''}{firm.email}</p>
                <h2 className="text-xl font-bold text-[#C6A75E] mt-4">ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ</h2>
              </div>

              {/* Case Info */}
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="font-bold w-1/3">Υπόθεση:</td><td>{receiptData.case.title}</td></tr>
                  <tr><td className="font-bold">Αρ. Υπόθεσης:</td><td className="font-mono">{receiptData.case.case_number || '—'}</td></tr>
                  <tr><td className="font-bold">Πελάτης:</td><td>{receiptData.case.client_name || '—'}</td></tr>
                  <tr><td className="font-bold">Δικηγόρος:</td><td>{receiptData.case.lawyer_name || '—'}</td></tr>
                </tbody>
              </table>

              {/* Actions Table */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Ενέργειες που Πραγματοποιήθησαν</h3>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Ημερομηνία</th>
                      <th className="border p-2 text-left">Ενέργεια</th>
                      <th className="border p-2 text-left">Χρήστης</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptData.actions.slice(0, 15).map((action: ActionType, i: number) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border p-2">{parseTs(action.created_at)?.toLocaleDateString('el-GR') ?? '—'}</td>
                        <td className="border p-2">{formatActionLabel(action.action)}</td>
                        <td className="border p-2">{action.user_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Charges */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Χρεώσεις Υπηρεσιών</h3>
                <table className="w-full border-collapse text-sm">
                  <tr className="bg-gray-100">
                    <td className="border p-2 font-bold">Δικηγορικά Δικαιώματα</td>
                    <td className="border p-2 text-right font-bold">{fmt(receiptData.totalFees)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2">Δαπάνες</td>
                    <td className="border p-2 text-right">{fmt(receiptData.totalExpenses)}</td>
                  </tr>
                  <tr className="bg-[#071220] text-white">
                    <td className="border p-2 font-bold">ΣΥΝΟΛΟ</td>
                    <td className="border p-2 text-right font-bold">{fmt(receiptData.totalFees + receiptData.totalExpenses)}</td>
                  </tr>
                </table>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-gray-500 border-t pt-4">
                <p>Αυτή η απόδειξη επιβεβαιώνει ότι οι ανωτέρω υπηρεσίες παρασχέθησαν στον/στην ανωτέρω πελάτη.</p>
                <p className="mt-2">{firm.name}{firm.afm ? ` | ΑΦΜ: ${firm.afm}` : ''}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end">
              <button
                onClick={() => {
                  const printArea = document.getElementById('receipt-print');
                  if (printArea) {
                    const win = window.open('', '', 'height=800,width=800');
                    if (win) {
                      win.document.write(printArea.innerHTML);
                      win.document.close();
                      win.print();
                    }
                  }
                }}
                className="px-4 py-2 bg-[#071220] text-white rounded text-sm flex items-center gap-2"
              >
                <Printer size={14} /> Εκτύπωση
              </button>
              <button onClick={() => setPreviewOpen(false)} className="px-4 py-2 bg-gray-300 text-gray-900 rounded text-sm">
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
