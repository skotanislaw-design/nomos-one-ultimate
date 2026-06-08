import { useEffect, useState, useRef } from 'react';
import {
  Plus, X, Mail, Printer, Download, TrendingUp, FileText,
  Eye, CheckCircle, Clock, Building2, Trash2,
  Receipt, AlertCircle, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { invoicingApi, casesApi, emailApi, exportApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';
import { parseTs } from '@/lib/prefs';

type InvoiceTab = 'invoices' | 'monthly';

/* ─── firm constants ─────────────────────────────────────────── */
const FIRM_NAME    = 'Σκοτάνης & Συνεργάτες';
const FIRM_ADDRESS = 'Αθήνα, Ελλάδα';
const FIRM_PHONE   = '+30 210 000 0000';
const FIRM_EMAIL   = 'christos@skotanislaw.com';
const FIRM_AFM     = '123456789';

const GRAMMATIO_RATES = { efka: 0.2695, ean: 0.0167, dsa: 0.0200 };

const EXPENSE_LABELS: Record<string, string> = {
  grammatio: 'Προείσπραξη (Γραμμάτιο Συλλόγου)',
  parabolon: 'Παράβολο', ensima: 'Ένσημα', court_fees: 'Δικαστικά Τέλη',
  travel: 'Μετάβαση / Μετακίνηση', meal: 'Σίτιση', apostoli: 'Αποστολή / Courier',
  copies: 'Φωτοτυπίες / Αντίγραφα', filing: 'Κατάθεση Εγγράφων',
  postage: 'Ταχυδρομικά', notary: 'Συμβολαιογράφος', translation: 'Μεταφράσεις',
  expert_witness: 'Πραγματογνωμοσύνη', expert_fee: 'Αμοιβή Εμπειρογνώμονα', other: 'Λοιπά',
};

/* ─── helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;

interface LineItem { description: string; amount: string; is_expense?: boolean; }
interface GrammatioState {
  include: boolean; gross: string;
  efka: string; ean: string; dsa: string; other: string;
}

function defaultGrammatio(): GrammatioState {
  return { include: false, gross: '', efka: '', ean: '', dsa: '', other: '' };
}
function calcGrammatio(g: GrammatioState) {
  const gross = Number(g.gross)  || 0;
  const efka  = Number(g.efka)   || (gross * GRAMMATIO_RATES.efka);
  const ean   = Number(g.ean)    || (gross * GRAMMATIO_RATES.ean);
  const dsa   = Number(g.dsa)    || (gross * GRAMMATIO_RATES.dsa);
  const other = Number(g.other)  || 0;
  const totalDeductions = efka + ean + dsa + other;
  return { gross, efka, ean, dsa, other, totalDeductions, netToLawyer: gross - totalDeductions };
}

/* ═══════════════════════════════════════════════════════════════
   InvoiceDocument — shared print-ready component
   Used both for existing-invoice preview AND draft proforma
═══════════════════════════════════════════════════════════════ */
interface InvoiceDocProps {
  isProforma: boolean;
  invNumber: string;
  invDate: string;
  clientName: string;
  clientAfm?: string;
  clientAddress?: string;
  caseTitle?: string;
  caseNumber?: string;
  items: Array<{ description: string; amount: number; is_expense?: boolean }>;
  vatRate: number;
  totalFees: number;
  totalExpenses: number;
  vat: number;
  withholding: number;
  grammatioGross: number;
  grammatioDetails?: { efka: number; ean: number; dsa: number };
  totalPayable: number;
  isProfessional: boolean;
}
function InvoiceDocument(p: InvoiceDocProps) {
  return (
    <div id="nomos-print-area" className="bg-white text-gray-900 rounded-2xl overflow-hidden shadow-2xl">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#071220] to-[#0a1929] p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[#C6A75E] flex items-center justify-center">
                <span className="text-[#071220] font-bold text-sm">Ν1</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-xl">{FIRM_NAME}</h1>
                <p className="text-[#C6A75E] text-xs tracking-widest uppercase">Δικηγορική Εταιρεία</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-[#8aa0b8] space-y-0.5">
              <p>{FIRM_ADDRESS}</p>
              <p>{FIRM_PHONE} | {FIRM_EMAIL}</p>
              <p>ΑΦΜ: {FIRM_AFM}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-[#C6A75E]/10 border border-[#C6A75E]/30 rounded-xl px-5 py-3">
              <p className="text-[#C6A75E] text-xs uppercase tracking-wider">
                {p.isProforma ? 'ΠΡΟΤΙΜΟΛΟΓΙΟ' : 'ΤΙΜΟΛΟΓΙΟ'}
              </p>
              <p className="text-white font-bold text-2xl mt-1">#{p.invNumber}</p>
              <p className="text-[#8aa0b8] text-xs mt-1">{p.invDate}</p>
              {p.isProforma && (
                <p className="text-amber-400 text-[10px] mt-1 italic">Μη φορολογικό έγγραφο</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-8 space-y-6">
        {/* Client & case */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Προς</p>
            <p className="font-bold text-gray-900">{p.clientName || '—'}</p>
            {p.clientAfm && <p className="text-sm text-gray-600">ΑΦΜ: {p.clientAfm}</p>}
            {p.clientAddress && <p className="text-sm text-gray-600">{p.clientAddress}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Υπόθεση</p>
            <p className="font-medium text-gray-900">{p.caseTitle || '—'}</p>
            {p.caseNumber && <p className="text-sm text-gray-600">Αρ. {p.caseNumber}</p>}
          </div>
        </div>

        {/* Line items table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 text-gray-500 font-medium">Περιγραφή</th>
              <th className="text-right py-2 text-gray-500 font-medium w-32">Ποσό</th>
            </tr>
          </thead>
          <tbody>
            {p.items.filter(it => it.amount > 0 || it.description).map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-800">
                  {item.description || (item.is_expense ? 'Δαπάνη' : 'Νομικές Υπηρεσίες')}
                  {item.is_expense && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Δαπάνη</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono">{fmt(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial breakdown */}
        <div className="bg-gray-50 rounded-xl p-5 space-y-2.5 border border-gray-200">
          {p.totalFees > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Αμοιβές (ακαθάριστο)</span>
                <span className="font-mono">{fmt(p.totalFees)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ΦΠΑ {p.vatRate}%</span>
                <span className="font-mono text-blue-700">+ {fmt(p.vat)}</span>
              </div>
              {p.isProfessional && p.withholding > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Παρακράτηση Φόρου 20%</span>
                  <span className="font-mono text-purple-700">− {fmt(p.withholding)}</span>
                </div>
              )}
            </>
          )}

          {p.totalExpenses > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Δαπάνες / Έξοδα Δίκης</span>
              <span className="font-mono text-amber-700">+ {fmt(p.totalExpenses)}</span>
            </div>
          )}

          {p.grammatioGross > 0 && (
            <>
              <div className="pt-1 border-t border-gray-200" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  Γραμμάτιο Προείσπραξης Δ.Σ.
                  <span className="ml-2 text-xs text-orange-600 font-medium">(επιπλέον αμοιβής)</span>
                </span>
                <span className="font-mono text-orange-600">+ {fmt(p.grammatioGross)}</span>
              </div>
              {p.grammatioDetails && (
                <div className="pl-4 text-xs text-gray-400 space-y-0.5">
                  <p>Κρατήσεις: ΕΦΚΑ {fmt(p.grammatioDetails.efka)} · ΕΑΝ {fmt(p.grammatioDetails.ean)} · ΔΣ {fmt(p.grammatioDetails.dsa)}</p>
                </div>
              )}
            </>
          )}

          <div className="pt-2 border-t-2 border-gray-300 flex justify-between items-baseline">
            <span className="font-bold text-gray-900 text-base">
              {p.isProforma ? 'Εκτιμώμενο Πληρωτέο' : 'Σύνολο Πληρωτέο'}
            </span>
            <span className="font-bold text-2xl text-[#071220] font-mono">{fmt(p.totalPayable)}</span>
          </div>

          {p.isProfessional && p.withholding > 0 && (
            <p className="text-xs text-gray-400 italic pt-1">
              * Η παρακράτηση {fmt(p.withholding)} αποδίδεται από τον πελάτη απευθείας στην εφορία
            </p>
          )}
        </div>

        {/* Proforma disclaimer */}
        {p.isProforma && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
            <p className="text-xs text-amber-800 font-semibold mb-1">ΠΡΟΤΙΜΟΛΟΓΙΟ — Μη φορολογικό έγγραφο</p>
            <p className="text-xs text-amber-700">
              Το παρόν αποτελεί προεκτίμηση αμοιβής πριν την έκδοση του επίσημου τιμολογίου.
              Τα ποσά ενδέχεται να διαφέρουν στο τελικό τιμολόγιο.
            </p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="bg-[#071220] px-8 py-4 flex justify-between items-center">
        <p className="text-[#6a8aaa] text-xs">{FIRM_NAME} · {FIRM_EMAIL}</p>
        <p className="text-[#C6A75E] text-xs">ΑΦΜ: {FIRM_AFM}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════ */
export default function InvoicingPage() {
  const [invoices, setInvoices]     = useState<any[]>([]);
  const [cases, setCases]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<InvoiceTab>('invoices');

  const [showCreate, setShowCreate] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);   // existing invoice
  const [showProforma, setShowProforma]     = useState(false);        // draft proforma

  /* create-form state */
  const [caseId, setCaseId]         = useState('');
  const [isProfessional, setIsProfessional] = useState(false);
  const [vatRate, setVatRate]       = useState(24);
  const [clientName, setClientName] = useState('');
  const [clientAfm, setClientAfm]   = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [items, setItems]           = useState<LineItem[]>([{ description: '', amount: '' }]);
  const [grammatio, setGrammatio]   = useState<GrammatioState>(defaultGrammatio());
  const [showExpenses, setShowExpenses] = useState(false);

  /* invoicing context */
  const [context, setContext]       = useState<any>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  /* email / pdf state */
  const [emailSending, setEmailSending]     = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState<string | null>(null);

  /* ── data loading ──────────────────────────────────────────── */
  const load = () => {
    Promise.all([
      invoicingApi.list().catch(() => ({ data: [] })),
      casesApi.list().catch(() => ({ data: [] })),
    ]).then(([i, c]) => {
      setInvoices(Array.isArray(i.data) ? i.data : []);
      setCases(Array.isArray(c.data) ? c.data : []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  /* ── load context on case change ──────────────────────────── */
  useEffect(() => {
    if (!caseId) { setContext(null); return; }
    setCtxLoading(true);
    casesApi.getInvoicingContext(caseId)
      .then(r => {
        const d = r.data;
        setContext(d);
        if (d.client) {
          setClientName(d.client.name || '');
          setClientAfm(d.client.afm || '');
          setClientAddress(d.client.address || '');
        }
        // Auto-import billable expenses (γραμμάτιο, παράβολα, ένσημα κλπ.) ως expense line items
        const billableExpenses: any[] = (d.expenses || []).filter((e: any) => e.billable_to_client === true);
        if (billableExpenses.length > 0) {
          const grouped: Record<string, number> = {};
          billableExpenses.forEach((e: any) => {
            const cat = e.category || 'other';
            grouped[cat] = (grouped[cat] || 0) + Number(e.amount || 0);
          });
          const expLines: LineItem[] = Object.entries(grouped)
            .filter(([, total]) => total > 0)
            .map(([cat, total]) => ({
              description: EXPENSE_LABELS[cat] || cat,
              amount: String(Number(total).toFixed(2)),
              is_expense: true,
            }));
          setItems(prev => [...prev.filter(it => !it.is_expense), ...expLines]);
        }
        // Auto-populate grammatio toggle για ανάλυση κρατήσεων (εσωτερικό)
        if (d.grammatia?.length > 0) {
          const totalGram = d.grammatia.reduce((s: number, g: any) => s + Number(g.amount || 0), 0);
          setGrammatio(prev => ({ ...prev, include: true, gross: String(totalGram.toFixed(2)) }));
        }
      })
      .catch(() => setContext(null))
      .finally(() => setCtxLoading(false));
  }, [caseId]);

  /* ── derived calculations ──────────────────────────────────── */
  const feeItems      = items.filter(it => !it.is_expense);
  const expenseItems  = items.filter(it => it.is_expense);
  const totalFees     = feeItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const totalExpenses = expenseItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const vat           = totalFees * (vatRate / 100);
  const withholding   = isProfessional ? totalFees * 0.20 : 0;
  const subtotal      = totalFees + vat + totalExpenses - withholding;
  const gCalc         = calcGrammatio(grammatio);
  // Γραμμάτιο = πρόσθετο κόστος ΓΙΑ τον εντολέα (επιπλέον της αμοιβής), ΟΧΙ αφαίρεση
  const totalPayable  = grammatio.include ? subtotal + gCalc.gross : subtotal;
  // Καθαρό εισπρακτέο = αμοιβή + έξοδα + γραμμάτιο gross − κρατήσεις Bar Association − παρακράτηση
  const lawyerReceives = totalFees - withholding + totalExpenses + (grammatio.include ? gCalc.netToLawyer : 0);

  /* ── selected case info for proforma ──────────────────────── */
  const selectedCase = cases.find(c => (c._id || c.id) === caseId);

  /* ── helpers ──────────────────────────────────────────────── */
  const addItem    = (isExpense = false) => setItems(prev => [...prev, { description: '', amount: '', is_expense: isExpense }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof LineItem, val: string | boolean) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const importExpenses = () => {
    if (!context?.expenses_by_category) return;
    // expenses_by_category is a dict {category: total}
    const expLines: LineItem[] = Object.entries(context.expenses_by_category as Record<string, number>)
      .filter(([, total]) => total > 0)
      .map(([cat, total]) => ({
        description: EXPENSE_LABELS[cat] || cat,
        amount: String(Number(total).toFixed(2)),
        is_expense: true,
      }));
    setItems(prev => [...prev.filter(it => !it.is_expense), ...expLines]);
    toast.success('Έξοδα εισήχθησαν');
  };

  const resetForm = () => {
    setCaseId(''); setIsProfessional(false); setVatRate(24);
    setClientName(''); setClientAfm(''); setClientAddress('');
    setItems([{ description: '', amount: '' }]);
    setGrammatio(defaultGrammatio());
    setContext(null); setShowExpenses(false); setShowProforma(false);
  };

  /* ── proforma print ────────────────────────────────────────── */
  const printProforma = () => window.print();

  /* ── submit ────────────────────────────────────────────────── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) { toast.error('Επιλέξτε υπόθεση'); return; }
    if (items.every(it => !Number(it.amount))) { toast.error('Εισάγετε τουλάχιστον ένα ποσό'); return; }
    const gFinal = grammatio.include ? gCalc : null;
    try {
      await invoicingApi.create({
        case_id: caseId,
        description: items.filter(it => !it.is_expense).map(it => it.description).filter(Boolean).join(' | '),
        amount: totalFees,
        vat_rate: vatRate,
        vat_amount: vat,
        withholding_tax: withholding,
        is_professional: isProfessional,
        total: totalFees + vat,
        net_payable: subtotal,
        client_name: clientName,
        client_afm: clientAfm,
        client_address: clientAddress,
        items: items.map(it => ({ description: it.description, amount: Number(it.amount) || 0, is_expense: !!it.is_expense })),
        total_expenses: totalExpenses,
        grammatio_gross:            gFinal?.gross || 0,
        grammatio_efka:             gFinal?.efka  || 0,
        grammatio_ean:              gFinal?.ean   || 0,
        grammatio_dsa:              gFinal?.dsa   || 0,
        grammatio_other_deductions: gFinal?.other || 0,
        total_before_grammatio:     subtotal,
        total_payable:              totalPayable,
        lawyer_receives:            lawyerReceives,
      });
      toast.success('Τιμολόγιο δημιουργήθηκε');
      setShowCreate(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά τη δημιουργία');
    }
  };

  /* ── email ─────────────────────────────────────────────────── */
  const sendEmail = async (invoice: any) => {
    const toEmail = invoice.client_email || invoice.email || '';
    if (!toEmail) {
      toast.warning(`Δεν υπάρχει email για ${invoice.client_name || 'αυτόν τον πελάτη'} — ελέγξτε το μητρώο`);
      return;
    }
    const invId = invoice._id || invoice.id;
    setEmailSending(invId);
    try {
      const amount = Number(invoice.amount || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 });
      const total  = Number(invoice.total  || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 });
      const vatAmt = Number(invoice.vat_amount || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 });
      const wh     = Number(invoice.withholding_tax || 0);
      const num    = invoice.invoice_number || invId?.slice(-6) || '—';
      await emailApi.send({
        to_email: toEmail, to_name: invoice.client_name,
        subject: `Τιμολόγιο ${num} — Σκοτάνης & Συνεργάτες`,
        invoice_id: invId,
        body_html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e;">
            <div style="background:#071220;padding:20px 24px;border-radius:8px 8px 0 0;">
              <h2 style="color:#C6A75E;margin:0;">Σκοτάνης &amp; Συνεργάτες</h2>
              <p style="color:#6a8aaa;margin:4px 0 0;font-size:12px;">Νομικό Γραφείο — Αθήνα</p>
            </div>
            <div style="padding:24px;background:#f8f9fa;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
              <p>Αγαπητέ/ή <strong>${invoice.client_name || ''}</strong>,</p>
              <p>Σας αποστέλλουμε το τιμολόγιο <strong>${num}</strong>:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr style="background:#e8f0fe;"><td style="padding:8px 12px;font-weight:bold;">Ακαθάριστο</td><td style="padding:8px 12px;text-align:right;">€${amount}</td></tr>
                <tr><td style="padding:8px 12px;">ΦΠΑ 24%</td><td style="padding:8px 12px;text-align:right;">€${vatAmt}</td></tr>
                ${wh > 0 ? `<tr><td style="padding:8px 12px;">Παρακράτηση 20%</td><td style="padding:8px 12px;text-align:right;color:#c0392b;">−€${wh.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>` : ''}
                <tr style="background:#071220;color:white;"><td style="padding:10px 12px;font-weight:bold;">Σύνολο Πληρωτέο</td><td style="padding:10px 12px;text-align:right;font-weight:bold;">€${total}</td></tr>
              </table>
              <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;"/>
              <p style="color:#666;font-size:12px;margin:0;">Σκοτάνης &amp; Συνεργάτες &nbsp;|&nbsp; christos@skotanislaw.com</p>
            </div>
          </div>`,
      });
      toast.success(`Τιμολόγιο ${num} εστάλη`);
    } catch (err: any) {
      const d = err.response?.data?.detail || '';
      if (d.toLowerCase().includes('placeholder') || d.toLowerCase().includes('logged'))
        toast.info('Email καταγράφηκε — SMTP δεν έχει ρυθμιστεί ακόμα');
      else toast.error(d || 'Αποτυχία αποστολής');
    } finally { setEmailSending(null); }
  };

  /* ── pdf ───────────────────────────────────────────────────── */
  const downloadPdf = async (invoice: any) => {
    const invId = invoice._id || invoice.id;
    if (!invId) { toast.error('Δεν βρέθηκε ID τιμολογίου'); return; }
    setPdfDownloading(invId);
    try {
      const res = await exportApi.invoicePdf(invId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `invoice_${invoice.invoice_number || invId.slice(-6)}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF ληφθέν');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Αποτυχία εξαγωγής PDF');
    } finally { setPdfDownloading(null); }
  };

  /* ── kpi totals ────────────────────────────────────────────── */
  const totalInvoiced    = invoices.reduce((s, i) => s + Number(i.total || i.amount || 0), 0);
  const totalPaid        = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || i.amount || 0), 0);
  const totalWithholding = invoices.reduce((s, i) => s + Number(i.withholding_tax || 0), 0);
  const totalVAT         = invoices.reduce((s, i) => s + Number(i.vat_amount || 0), 0);

  /* ── monthly grouping ──────────────────────────────────────── */
  const monthlyMap: Record<string, any> = {};
  invoices.forEach(inv => {
    const d = inv.created_at ? (parseTs(inv.created_at) ?? new Date()) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
    if (!monthlyMap[key]) monthlyMap[key] = { key, label, gross: 0, vat: 0, withholding: 0, net: 0, count: 0 };
    monthlyMap[key].gross      += Number(inv.amount || 0);
    monthlyMap[key].vat        += Number(inv.vat_amount || 0);
    monthlyMap[key].withholding+= Number(inv.withholding_tax || 0);
    monthlyMap[key].net        += Number(inv.total || inv.amount || 0) - Number(inv.withholding_tax || 0);
    monthlyMap[key].count      += 1;
  });
  const monthlyRows = Object.values(monthlyMap).sort((a: any, b: any) => b.key.localeCompare(a.key));

  const tabs = [
    { id: 'invoices' as InvoiceTab, label: 'Τιμολόγια', count: invoices.length },
    { id: 'monthly'  as InvoiceTab, label: 'Μηνιαία Ανάλυση' },
  ];

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Τιμολόγηση</h2>
          <p className="page-subtitle">{invoices.length} τιμολόγια</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-gold text-xs flex items-center gap-1.5">
            <Plus size={14} /> Νέο Τιμολόγιο
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <FileText size={18} className="text-blue-400 mb-2" />,    val: totalInvoiced,              label: 'Σύνολο Τιμολ/θέντων', cls: 'text-white',        border: 'border-blue-500/40' },
          { icon: <CheckCircle size={18} className="text-emerald-400 mb-2"/>, val: totalPaid,                label: 'Εισπραχθέντα',        cls: 'text-emerald-400',  border: 'border-emerald-500/40' },
          { icon: <Clock size={18} className="text-amber-400 mb-2" />,       val: totalInvoiced - totalPaid, label: 'Υπόλοιπο',            cls: 'text-amber-400',    border: 'border-amber-500/40' },
          { icon: <TrendingUp size={18} className="text-purple-400 mb-2" />, val: totalWithholding,          label: 'Παρακρ. Φόρος',       cls: 'text-purple-400',   border: 'border-purple-500/40' },
        ].map(card => (
          <div key={card.label} className={`glass-card p-4 border-l-[3px] ${card.border}`}>
            {card.icon}
            <p className={`text-2xl font-bold ${card.cls}`}>{fmt(card.val)}</p>
            <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Invoices list ── */}
      {activeTab === 'invoices' && (
        <div className="glass-card overflow-hidden table-scroll">
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0d2035]/40">
                <th>Αρ. Τιμολ.</th>
                <th>Υπόθεση / Πελάτης</th>
                <th className="hidden sm:table-cell">Ημ/νία</th>
                <th>Σύνολο</th>
                <th className="hidden md:table-cell">ΦΠΑ</th>
                <th className="hidden lg:table-cell">Παρακράτηση</th>
                <th>Κατάσταση</th>
                <th>Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => {
                const invId  = inv._id || inv.id;
                const amount = Number(inv.amount || 0);
                const invVat = Number(inv.vat_amount || amount * 0.24);
                const wh     = Number(inv.withholding_tax || 0);
                return (
                  <tr key={invId}>
                    <td className="font-mono text-xs text-[#C6A75E]">{inv.invoice_number || invId?.slice(-6) || '—'}</td>
                    <td>
                      <p className="text-xs font-medium text-[#d4dce8]">{inv.case_title || '—'}</p>
                      {inv.client_name && <p className="text-[10px] text-[#5a7a9a]">{inv.client_name}</p>}
                    </td>
                    <td className="hidden sm:table-cell text-xs">{inv.created_at ? (parseTs(inv.created_at)?.toLocaleDateString('el-GR') ?? '—') : '—'}</td>
                    <td className="font-mono text-sm font-semibold text-[#C6A75E]">{fmt(Number(inv.total || amount + invVat))}</td>
                    <td className="hidden md:table-cell font-mono text-xs text-blue-400">{fmt(invVat)}</td>
                    <td className="hidden lg:table-cell font-mono text-xs text-purple-400">{wh > 0 ? fmt(wh) : <span className="text-[#3a5a7a]">—</span>}</td>
                    <td>
                      <span className={inv.status === 'paid' ? 'status-active' : inv.status === 'overdue' ? 'status-urgent' : 'status-pending'}>
                        {inv.status === 'paid' ? 'Πληρωμένο' : inv.status === 'overdue' ? 'Ληξιπρόθεσμο' : 'Εκκρεμεί'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreviewInvoice(inv)} title="Προεπισκόπηση"
                          className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-[#C6A75E] transition-all">
                          <Eye size={13} />
                        </button>
                        <button onClick={() => downloadPdf(inv)} disabled={pdfDownloading === invId} title="Λήψη PDF"
                          className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-red-400 transition-all disabled:opacity-40">
                          {pdfDownloading === invId
                            ? <span className="w-3 h-3 rounded-full border border-red-400/40 border-t-red-400 animate-spin block" />
                            : <Download size={13} />}
                        </button>
                        <button onClick={() => sendEmail(inv)} disabled={emailSending === invId} title="Αποστολή Email"
                          className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] hover:text-blue-400 transition-all disabled:opacity-40">
                          {emailSending === invId
                            ? <span className="w-3 h-3 rounded-full border border-blue-400/40 border-t-blue-400 animate-spin block" />
                            : <Mail size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {invoices.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν τιμολόγια.</div>}
        </div>
      )}

      {/* ── Monthly analysis ── */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Σύνολο Ακαθάριστα', value: invoices.reduce((s, i) => s + Number(i.amount || 0), 0), cls: 'text-white' },
              { label: 'Σύνολο ΦΠΑ 24%',    value: totalVAT,        cls: 'text-blue-400' },
              { label: 'Παρακράτηση',        value: totalWithholding, cls: 'text-purple-400' },
              { label: 'Καθαρό Εισπρακτέο',  value: invoices.reduce((s, i) => s + Number(i.net_payable || (Number(i.total || i.amount || 0) - Number(i.withholding_tax || 0))), 0), cls: 'text-emerald-400' },
            ].map(card => (
              <div key={card.label} className="glass-card p-4 text-center">
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">{card.label}</p>
                <p className={`text-xl font-bold ${card.cls}`}>{fmt(card.value)}</p>
              </div>
            ))}
          </div>
          <div className="glass-card overflow-hidden table-scroll">
            <div className="p-5 border-b border-[#1a3a5c]/40">
              <h3 className="section-title">Μηνιαία Ανάλυση Φόρων</h3>
              <p className="text-xs text-[#5a7a9a] mt-1">ΦΠΑ 24% και Παρακράτηση Φόρου 20%</p>
            </div>
            {monthlyRows.length === 0 ? (
              <p className="p-6 text-center text-[#5a7a9a] text-sm">Δεν υπάρχουν δεδομένα.</p>
            ) : (
              <table className="w-full table-premium">
                <thead><tr className="bg-[#0d2035]/40"><th>Μήνας</th><th>Τιμολόγια</th><th>Ακαθάριστα</th><th>ΦΠΑ 24%</th><th>Παρακράτηση</th><th>Καθαρό</th></tr></thead>
                <tbody>
                  {monthlyRows.map((row: any) => (
                    <tr key={row.key}>
                      <td className="font-medium text-[#d4dce8] capitalize">{row.label}</td>
                      <td className="font-mono text-xs text-[#C6A75E]">{row.count}</td>
                      <td className="font-mono text-sm text-white">{fmt(row.gross)}</td>
                      <td className="font-mono text-sm text-blue-400">{fmt(row.vat)}</td>
                      <td className="font-mono text-sm text-purple-400">{row.withholding > 0 ? fmt(row.withholding) : <span className="text-[#3a5a7a]">—</span>}</td>
                      <td className="font-mono text-sm font-bold text-emerald-400">{fmt(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0d2035]/60 border-t-2 border-[#1a3a5c]/60">
                    <td className="font-bold text-[#C6A75E]">ΣΥΝΟΛΟ</td>
                    <td className="font-mono font-bold text-[#C6A75E]">{invoices.length}</td>
                    <td className="font-mono font-bold text-white">{fmt(monthlyRows.reduce((s: number, r: any) => s + r.gross, 0))}</td>
                    <td className="font-mono font-bold text-blue-400">{fmt(totalVAT)}</td>
                    <td className="font-mono font-bold text-purple-400">{fmt(totalWithholding)}</td>
                    <td className="font-mono font-bold text-emerald-400">{fmt(monthlyRows.reduce((s: number, r: any) => s + r.net, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          CREATE INVOICE MODAL
      ════════════════════════════════════════════════════════════ */}
      {showCreate && !showProforma && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setShowCreate(false)}>
          <div className="glass-card w-full max-w-3xl border border-[#1a3a5c] my-6"
            onClick={e => e.stopPropagation()}>

            <div className="p-5 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Νέο Τιμολόγιο</h3>
                <p className="text-xs text-[#5a7a9a] mt-0.5">Αμοιβές · Έξοδα · Γραμμάτιο Προείσπραξης</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="divide-y divide-[#1a3a5c]/30">

              {/* ── Α. Υπόθεση & Πελάτης ── */}
              <div className="p-5 space-y-4">
                <p className="text-[10px] uppercase tracking-widest text-[#C6A75E] font-semibold">Α. Στοιχεία Υπόθεσης</p>

                <div>
                  <label className="label">Υπόθεση *</label>
                  <select value={caseId} onChange={e => setCaseId(e.target.value)} className="input-dark" required>
                    <option value="">Επιλέξτε υπόθεση...</option>
                    {cases.map(c => (
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.title}{c.case_number ? ` [${c.case_number}]` : ''} — {c.client_name || ''}
                      </option>
                    ))}
                  </select>
                  {ctxLoading && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-[#5a7a9a]">
                      <Loader2 size={12} className="animate-spin" /> Φόρτωση στοιχείων υπόθεσης...
                    </div>
                  )}
                </div>

                {/* Case context panel */}
                {context && (context.expenses_by_category?.length > 0 || context.existing_invoices?.length > 0) && (
                  <div className="rounded-xl overflow-hidden border border-[#1a3a5c]/60 bg-[#0a1929]/40">
                    <button type="button" onClick={() => setShowExpenses(!showExpenses)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#132B45]/30 transition-colors">
                      <span className="text-xs font-semibold text-[#C6A75E] flex items-center gap-2">
                        <Receipt size={13} /> Έξοδα & Ιστορικό Τιμολόγησης Υπόθεσης
                        {context.expenses_by_category && (
                          <span className="px-1.5 py-0.5 bg-[#132B45] rounded text-[10px] text-[#8aa0b8]">
                            {fmt(context.expenses_by_category.reduce((s: number, c: any) => s + c.total, 0))} σύνολο εξόδων
                          </span>
                        )}
                      </span>
                      {showExpenses ? <ChevronUp size={14} className="text-[#5a7a9a]" /> : <ChevronDown size={14} className="text-[#5a7a9a]" />}
                    </button>
                    {showExpenses && (
                      <div className="px-4 pb-4 space-y-3">
                        {context.expenses_by_category?.filter((c: any) => c.total > 0).length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#5a7a9a] mb-2">Έξοδα ανά Κατηγορία</p>
                            <div className="space-y-1">
                              {context.expenses_by_category.filter((c: any) => c.total > 0).map((cat: any) => (
                                <div key={cat.category} className="flex justify-between text-xs py-1 border-b border-[#1a3a5c]/20 last:border-0">
                                  <span className="text-[#8aa0b8]">{cat.category}</span>
                                  <span className="font-mono text-[#d4dce8]">{fmt(cat.total)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs py-1.5 font-semibold">
                                <span className="text-[#C6A75E]">Σύνολο</span>
                                <span className="font-mono text-[#C6A75E]">{fmt(context.expenses_by_category.reduce((s: number, c: any) => s + c.total, 0))}</span>
                              </div>
                            </div>
                            <button type="button" onClick={importExpenses}
                              className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                              ↓ Εισαγωγή εξόδων ως γραμμές τιμολογίου
                            </button>
                          </div>
                        )}
                        {context.existing_invoices?.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#5a7a9a] mb-2">Προηγούμενα Τιμολόγια</p>
                            {context.existing_invoices.map((inv: any) => (
                              <div key={inv._id} className="flex justify-between text-xs py-1 border-b border-[#1a3a5c]/20 last:border-0">
                                <span className="text-[#8aa0b8]">#{inv.invoice_number || inv._id?.slice(-6)} — {inv.created_at ? (parseTs(inv.created_at)?.toLocaleDateString('el-GR') ?? '') : ''}</span>
                                <span className={`font-mono ${inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(Number(inv.total || inv.amount || 0))}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-xs py-1.5 font-semibold">
                              <span className="text-[#5a7a9a]">Ήδη τιμολογηθέν</span>
                              <span className="font-mono text-purple-400">{fmt(context.existing_invoices.reduce((s: number, i: any) => s + Number(i.total || i.amount || 0), 0))}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Client info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="label">Πελάτης</label><input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ονοματεπώνυμο" className="input-dark" /></div>
                  <div><label className="label">ΑΦΜ</label><input value={clientAfm} onChange={e => setClientAfm(e.target.value)} placeholder="123456789" className="input-dark" /></div>
                  <div><label className="label">Διεύθυνση</label><input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Πόλη, Οδός" className="input-dark" /></div>
                </div>

                {/* Professional toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d2035]/60 border border-[#1a3a5c]/40">
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className={isProfessional ? 'text-purple-400' : 'text-[#5a7a9a]'} />
                    <div>
                      <p className="text-xs font-medium text-[#d4dce8]">Επιτηδευματίας / Β' Κατηγορία</p>
                      <p className="text-[10px] text-[#5a7a9a]">Ενεργοποιεί παρακράτηση φόρου 20%</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsProfessional(!isProfessional)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${isProfessional ? 'bg-purple-500' : 'bg-[#1a3a5c]'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isProfessional ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* ── Β. Γραμμές ── */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-[#C6A75E] font-semibold">Β. Γραμμές Αμοιβών & Εξόδων</p>
                  <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
                    className="text-xs bg-[#0d2035] border border-[#1a3a5c]/60 rounded-lg px-2 py-1 text-[#8aa0b8]">
                    <option value={24}>ΦΠΑ 24%</option>
                    <option value={13}>ΦΠΑ 13%</option>
                    <option value={6}>ΦΠΑ 6%</option>
                    <option value={0}>ΦΠΑ 0%</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className={`flex gap-2 items-center p-2.5 rounded-xl border ${item.is_expense ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#0d2035]/40 border-[#1a3a5c]/40'}`}>
                      <div className="flex-1 min-w-0">
                        <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder={item.is_expense ? 'Περιγραφή εξόδου...' : 'Περιγραφή υπηρεσίας...'}
                          className="w-full text-xs bg-transparent border-0 text-[#d4dce8] placeholder-[#3a5a7a] focus:outline-none" />
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <input type="number" step="0.01" min="0" value={item.amount} onChange={e => updateItem(idx, 'amount', e.target.value)}
                          placeholder="0.00" className="w-full text-xs bg-transparent border-0 text-right text-[#C6A75E] font-mono placeholder-[#3a5a7a] focus:outline-none" />
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${item.is_expense ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {item.is_expense ? 'Έξοδο' : 'Αμοιβή'}
                      </span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="p-1 text-[#3a5a7a] hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addItem(false)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition-colors">
                    <Plus size={12} /> Γραμμή Αμοιβής
                  </button>
                  <button type="button" onClick={() => addItem(true)}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/20 hover:border-amber-500/40 transition-colors">
                    <Plus size={12} /> Γραμμή Εξόδου
                  </button>
                </div>
              </div>

              {/* ── Γ. Γραμμάτιο ── */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-[#C6A75E] font-semibold">Γ. Ανάλυση Κρατήσεων Γραμματίου (Εσωτερικό)</p>
                  <button type="button" onClick={() => setGrammatio(prev => ({ ...prev, include: !prev.include }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${grammatio.include ? 'bg-emerald-500' : 'bg-[#1a3a5c]'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${grammatio.include ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {grammatio.include && (
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-[#6a8aaa]">
                        Εσωτερική ανάλυση κρατήσεων Συλλόγου. Το ονομαστικό ποσό χρεώνεται <strong className="text-orange-400">επιπλέον</strong> της αμοιβής στον εντολέα (εμφανίζεται ως Έξοδο στο τιμολόγιο). Οι κρατήσεις (ΕΦΚΑ/ΕΑΝ/ΔΣ) υπολογίζονται αυτόματα εάν δεν συμπληρωθούν.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="label text-emerald-400/80">Ακαθάριστο (€)</label>
                        <input type="number" step="0.01" min="0" value={grammatio.gross}
                          onChange={e => setGrammatio(prev => ({ ...prev, gross: e.target.value }))}
                          placeholder="0.00" className="input-dark font-mono" />
                      </div>
                      {[
                        { key: 'efka' as const, label: `ΕΦΚΑ ${(GRAMMATIO_RATES.efka*100).toFixed(2)}%`, rate: GRAMMATIO_RATES.efka },
                        { key: 'ean'  as const, label: `ΕΑΝ ${(GRAMMATIO_RATES.ean*100).toFixed(2)}%`,  rate: GRAMMATIO_RATES.ean },
                        { key: 'dsa'  as const, label: `ΔΣ ${(GRAMMATIO_RATES.dsa*100).toFixed(2)}%`,   rate: GRAMMATIO_RATES.dsa },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="label">{f.label}</label>
                          <input type="number" step="0.01" min="0" value={grammatio[f.key]}
                            onChange={e => setGrammatio(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={grammatio.gross ? (Number(grammatio.gross) * f.rate).toFixed(2) : 'αυτόματο'}
                            className="input-dark font-mono text-xs" />
                        </div>
                      ))}
                    </div>
                    {gCalc.gross > 0 && (
                      <div className="p-3 rounded-lg bg-[#0a1929]/60 border border-emerald-500/10 space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-[#5a7a9a] mb-2">Ανάλυση Γραμματίου</p>
                        {[
                          { label: 'Ακαθάριστο',             val: gCalc.gross,         sign: '',  cls: 'text-white' },
                          { label: `ΕΦΚΑ (${(GRAMMATIO_RATES.efka*100).toFixed(2)}%)`, val: gCalc.efka,  sign: '−', cls: 'text-red-400' },
                          { label: `ΕΑΝ (${(GRAMMATIO_RATES.ean*100).toFixed(2)}%)`,  val: gCalc.ean,   sign: '−', cls: 'text-red-400' },
                          { label: `ΔΣ (${(GRAMMATIO_RATES.dsa*100).toFixed(2)}%)`,   val: gCalc.dsa,   sign: '−', cls: 'text-red-400' },
                          ...(gCalc.other > 0 ? [{ label: 'Λοιπά', val: gCalc.other, sign: '−', cls: 'text-red-400' }] : []),
                        ].map(row => (
                          <div key={row.label} className="flex justify-between text-xs">
                            <span className="text-[#6a8aaa]">{row.label}</span>
                            <span className={`font-mono ${row.cls}`}>{row.sign}{fmt(row.val)}</span>
                          </div>
                        ))}
                        <div className="pt-1.5 border-t border-emerald-500/20 flex justify-between text-xs font-bold">
                          <span className="text-emerald-400">Καθαρό στο δικηγόρο</span>
                          <span className="font-mono text-emerald-400">{fmt(gCalc.netToLawyer)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Δ. Σύνοψη ── */}
              {(totalFees > 0 || totalExpenses > 0) && (
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#C6A75E] font-semibold mb-3">Δ. Σύνοψη Τιμολογίου</p>
                  <div className="rounded-xl border border-[#1a3a5c]/60 bg-[#0d2035]/40 p-4 space-y-2">
                    {totalFees > 0 && <>
                      <div className="flex justify-between text-sm"><span className="text-[#8aa0b8]">Αμοιβές</span><span className="font-mono text-white">{fmt(totalFees)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#8aa0b8]">ΦΠΑ {vatRate}%</span><span className="font-mono text-blue-400">+ {fmt(vat)}</span></div>
                      {isProfessional && <div className="flex justify-between text-sm"><span className="text-[#8aa0b8]">Παρακράτηση 20%</span><span className="font-mono text-purple-400">− {fmt(withholding)}</span></div>}
                    </>}
                    {totalExpenses > 0 && <div className="flex justify-between text-sm"><span className="text-[#8aa0b8]">Δαπάνες / Έξοδα</span><span className="font-mono text-amber-400">+ {fmt(totalExpenses)}</span></div>}
                    <div className="pt-2 border-t border-[#1a3a5c]/40 flex justify-between text-sm font-semibold">
                      <span className="text-[#d4dce8]">Υποσύνολο</span><span className="font-mono text-white">{fmt(subtotal)}</span>
                    </div>
                    {grammatio.include && gCalc.gross > 0 && <>
                      <div className="flex justify-between text-sm"><span className="text-[#8aa0b8]">Γραμμάτιο (επιπλέον αμοιβής)</span><span className="font-mono text-orange-400">+ {fmt(gCalc.gross)}</span></div>
                    </>}
                    <div className="pt-2 border-t-2 border-[#C6A75E]/30 flex justify-between">
                      <span className="text-base font-bold text-[#C6A75E]">Υπόλοιπο Πληρωτέο</span>
                      <span className="font-mono text-xl font-bold text-[#C6A75E]">{fmt(totalPayable)}</span>
                    </div>
                    {grammatio.include && gCalc.gross > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[#5a7a9a] italic">↳ Εισπράττει ο δικηγόρος</span>
                        <span className="font-mono text-emerald-400">{fmt(lawyerReceives)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              <div className="p-5 space-y-2">
                {/* Proforma preview button */}
                {(totalFees > 0 || totalExpenses > 0) && caseId && (
                  <button type="button"
                    onClick={() => setShowProforma(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all text-sm font-medium">
                    <Eye size={15} /> Προεπισκόπηση Προτιμολογίου
                  </button>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="btn-gold flex-1 flex items-center justify-center gap-2">
                    <FileText size={14} /> Έκδοση Τιμολογίου
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-dark flex-1">Ακύρωση</button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          PROFORMA PREVIEW MODAL (draft — before saving)
      ════════════════════════════════════════════════════════════ */}
      {showCreate && showProforma && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setShowProforma(false)}>
          <div className="w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>

            {/* Action bar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <h3 className="text-sm font-semibold text-amber-400">Προτιμολόγιο — Προεπισκόπηση</h3>
                <p className="text-[10px] text-[#5a7a9a]">Δεν έχει αποθηκευτεί ακόμα</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printProforma}
                  className="btn-gold text-xs flex items-center gap-1.5">
                  <Printer size={13} /> Εκτύπωση / PDF
                </button>
                <button onClick={() => setShowProforma(false)}
                  className="btn-dark text-xs flex items-center gap-1.5">
                  ← Επιστροφή στη φόρμα
                </button>
                <button onClick={() => { setShowProforma(false); setShowCreate(false); resetForm(); }}
                  className="p-2 rounded-lg text-[#7a9ab8] hover:text-white hover:bg-[#132B45]">
                  <X size={16} />
                </button>
              </div>
            </div>

            <InvoiceDocument
              isProforma={true}
              invNumber={`DRAFT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`}
              invDate={new Date().toLocaleDateString('el-GR')}
              clientName={clientName}
              clientAfm={clientAfm}
              clientAddress={clientAddress}
              caseTitle={selectedCase?.title || ''}
              caseNumber={selectedCase?.case_number || ''}
              items={items.map(it => ({ description: it.description, amount: Number(it.amount) || 0, is_expense: !!it.is_expense }))}
              vatRate={vatRate}
              totalFees={totalFees}
              totalExpenses={totalExpenses}
              vat={vat}
              withholding={withholding}
              isProfessional={isProfessional}
              grammatioGross={grammatio.include ? gCalc.gross : 0}
              grammatioDetails={grammatio.include && gCalc.gross > 0 ? { efka: gCalc.efka, ean: gCalc.ean, dsa: gCalc.dsa } : undefined}
              totalPayable={totalPayable}
            />

            {/* After preview, offer direct issue */}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowProforma(false)} className="btn-dark text-sm flex items-center gap-1.5">
                ← Επεξεργασία
              </button>
              <button
                onClick={async () => {
                  // Trigger submit by simulating
                  setShowProforma(false);
                  // We need a small delay to re-render form, then auto-submit
                  // Instead, directly call the create logic:
                  const gFinal = grammatio.include ? gCalc : null;
                  try {
                    await invoicingApi.create({
                      case_id: caseId,
                      description: items.filter(it => !it.is_expense).map(it => it.description).filter(Boolean).join(' | '),
                      amount: totalFees,
                      vat_rate: vatRate,
                      vat_amount: vat,
                      withholding_tax: withholding,
                      is_professional: isProfessional,
                      total: totalFees + vat,
                      net_payable: subtotal,
                      client_name: clientName,
                      client_afm: clientAfm,
                      client_address: clientAddress,
                      items: items.map(it => ({ description: it.description, amount: Number(it.amount) || 0, is_expense: !!it.is_expense })),
                      total_expenses: totalExpenses,
                      grammatio_gross:            gFinal?.gross || 0,
                      grammatio_efka:             gFinal?.efka  || 0,
                      grammatio_ean:              gFinal?.ean   || 0,
                      grammatio_dsa:              gFinal?.dsa   || 0,
                      grammatio_other_deductions: gFinal?.other || 0,
                      total_before_grammatio:     subtotal,
                      total_payable:              totalPayable,
                      lawyer_receives:            lawyerReceives,
                    });
                    toast.success('Τιμολόγιο εκδόθηκε επιτυχώς');
                    setShowCreate(false);
                    setShowProforma(false);
                    resetForm();
                    load();
                  } catch (err: any) {
                    toast.error(err.response?.data?.detail || 'Σφάλμα κατά τη δημιουργία');
                  }
                }}
                className="btn-gold text-sm flex items-center gap-2">
                <FileText size={14} /> Έκδοση Τιμολογίου
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          EXISTING INVOICE PREVIEW MODAL
      ════════════════════════════════════════════════════════════ */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setPreviewInvoice(null)}>
          <div className="w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-semibold text-[#C6A75E]">
                Τιμολόγιο #{previewInvoice.invoice_number || previewInvoice._id?.slice(-6)}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => sendEmail(previewInvoice)}
                  className="btn-dark text-xs flex items-center gap-1.5 text-blue-400 border-blue-500/30">
                  <Mail size={13} /> Email Πελάτη
                </button>
                <button onClick={() => window.print()}
                  className="btn-gold text-xs flex items-center gap-1.5">
                  <Printer size={13} /> Εκτύπωση / PDF
                </button>
                <button onClick={() => setPreviewInvoice(null)}
                  className="p-2 rounded-lg text-[#7a9ab8] hover:text-white hover:bg-[#132B45]">
                  <X size={16} />
                </button>
              </div>
            </div>

            <InvoiceDocument
              isProforma={false}
              invNumber={previewInvoice.invoice_number || previewInvoice._id?.slice(-6) || '—'}
              invDate={previewInvoice.created_at ? (parseTs(previewInvoice.created_at)?.toLocaleDateString('el-GR') ?? new Date().toLocaleDateString('el-GR')) : new Date().toLocaleDateString('el-GR')}
              clientName={previewInvoice.client_name || ''}
              clientAfm={previewInvoice.client_afm}
              clientAddress={previewInvoice.client_address}
              caseTitle={previewInvoice.case_title}
              caseNumber={previewInvoice.case_number}
              items={previewInvoice.items?.length > 0
                ? previewInvoice.items
                : [{ description: previewInvoice.description || 'Νομικές Υπηρεσίες', amount: Number(previewInvoice.amount || 0) }]}
              vatRate={previewInvoice.vat_rate || 24}
              totalFees={Number(previewInvoice.amount || 0)}
              totalExpenses={Number(previewInvoice.total_expenses || 0)}
              vat={Number(previewInvoice.vat_amount || 0)}
              withholding={Number(previewInvoice.withholding_tax || 0)}
              isProfessional={!!previewInvoice.is_professional}
              grammatioGross={Number(previewInvoice.grammatio_info?.gross || 0)}
              grammatioDetails={previewInvoice.grammatio_info?.gross > 0 ? {
                efka: Number(previewInvoice.grammatio_info.efka || 0),
                ean:  Number(previewInvoice.grammatio_info.ean  || 0),
                dsa:  Number(previewInvoice.grammatio_info.dsa  || 0),
              } : undefined}
              totalPayable={Number(previewInvoice.total_payable || previewInvoice.net_payable || previewInvoice.total || previewInvoice.amount || 0)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
