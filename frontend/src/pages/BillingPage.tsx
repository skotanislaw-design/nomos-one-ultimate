import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Clock, Mail, Send, CheckCircle, RefreshCw } from 'lucide-react';
import { billingApi, emailApi, settingsApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type BillingTab = 'overview' | 'reminders' | 'overdue';

export default function BillingPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [collRate, setCollRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [sending, setSending] = useState<string | null>(null);
  const [firmContact, setFirmContact] = useState('christos@skotanislaw.com');

  useEffect(() => {
    Promise.all([
      billingApi.reminders().catch(() => ({ data: [] })),
      billingApi.overdue().catch(() => ({ data: [] })),
      billingApi.collectionRate().catch(() => ({ data: { rate: 0 } })),
      settingsApi.get().catch(() => ({ data: {} })),
    ]).then(([r, o, c, s]) => {
      setReminders(Array.isArray(r.data) ? r.data : []);
      setOverdue(Array.isArray(o.data) ? o.data : []);
      setCollRate(c.data?.rate || c.data?.collection_rate || 0);
      const sd = s.data || {};
      const phone = sd.firm_phone || sd.phone || '';
      const email = sd.firm_email || sd.email || 'christos@skotanislaw.com';
      setFirmContact([email, phone].filter(Boolean).join(' | '));
      setLoading(false);
    });
  }, []);

  const fmt = (n: number) => `€${Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2 })}`;
  const totalOverdue = overdue.reduce((s, o) => s + Number(o.amount || o.total || 0), 0);

  const buildEmailBody = (item: any, type: 'reminder' | 'overdue') => {
    const name = item.client_name || item.case_title || 'Πελάτης';
    const amount = Number(item.amount || item.total || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 });
    const ref = item.invoice_number || item.case_title || '';
    const isOverdue = type === 'overdue';
    return {
      subject: isOverdue
        ? `Ληξιπρόθεσμο Τιμολόγιο ${ref ? `— ${ref}` : ''}`
        : `Υπενθύμιση Πληρωμής ${ref ? `— ${ref}` : ''}`,
      body_html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e;">
          <div style="background:#071220;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:#C6A75E;margin:0;font-size:18px;">Σκοτάνης &amp; Συνεργάτες</h2>
            <p style="color:#6a8aaa;margin:4px 0 0;font-size:12px;">Νομικό Γραφείο — Αθήνα</p>
          </div>
          <div style="padding:24px;background:#f8f9fa;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
            <p style="margin:0 0 16px;">Αγαπητέ/ή <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;">${isOverdue
              ? `Σας ενημερώνουμε ότι διαθέτετε <strong style="color:#c0392b;">ληξιπρόθεσμο τιμολόγιο</strong> ύψους <strong>€${amount}</strong> που παραμένει εξοφλητέο.`
              : `Σας αποστέλλουμε υπενθύμιση για εκκρεμή πληρωμή ύψους <strong>€${amount}</strong>.`
            }</p>
            <p style="margin:0 0 24px;">Παρακαλούμε επικοινωνήστε μαζί μας ή προχωρήστε στη ρύθμιση της οφειλής το συντομότερο δυνατό.</p>
            <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;"/>
            <p style="color:#666;font-size:12px;margin:0;">
              Σκοτάνης &amp; Συνεργάτες &nbsp;|&nbsp; ${firmContact}
            </p>
          </div>
        </div>`,
    };
  };

  const sendReminderEmail = async (item: any, type: 'reminder' | 'overdue') => {
    const itemId = item._id || item.id || String(Math.random());
    const toEmail = item.client_email || item.email || '';
    if (!toEmail) {
      toast.warning(`Δεν υπάρχει email για ${item.client_name || 'αυτόν τον πελάτη'}`);
      return;
    }
    setSending(itemId);
    try {
      const { subject, body_html } = buildEmailBody(item, type);
      await emailApi.send({ to_email: toEmail, to_name: item.client_name, subject, body_html });
      toast.success(`Email αποστάλθηκε σε ${item.client_name || toEmail}`);
    } catch (err: any) {
      const detail = err.response?.data?.detail || '';
      if (detail.toLowerCase().includes('placeholder') || detail.toLowerCase().includes('logged')) {
        toast.info(`Email καταγράφηκε — SMTP δεν έχει ρυθμιστεί ακόμα`);
      } else {
        toast.error(detail || 'Αποτυχία αποστολής email');
      }
    } finally {
      setSending(null);
    }
  };

  const sendBulkEmails = async () => {
    const itemsWithEmail = overdue.filter(o => o.client_email || o.email);
    if (itemsWithEmail.length === 0) {
      toast.warning('Κανένας πελάτης δεν διαθέτει καταχωρημένο email');
      return;
    }
    setSending('bulk');
    let sent = 0;
    for (const item of itemsWithEmail) {
      try {
        const { subject, body_html } = buildEmailBody(item, 'overdue');
        await emailApi.send({ to_email: item.client_email || item.email, to_name: item.client_name, subject, body_html });
        sent++;
      } catch { /* continue */ }
    }
    setSending(null);
    const skipped = overdue.length - itemsWithEmail.length;
    toast.success(`Εστάλησαν ${sent} emails${skipped > 0 ? ` (${skipped} χωρίς email)` : ''}`);
  };

  const tabs = [
    { id: 'overview' as BillingTab, label: 'Επισκόπηση' },
    { id: 'reminders' as BillingTab, label: 'Υπενθυμίσεις', count: reminders.length },
    { id: 'overdue' as BillingTab, label: 'Ληξιπρόθεσμα', count: overdue.length },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Billing Engine</h2><p className="page-subtitle">Παρακολούθηση εισπράξεων & υπενθυμίσεων</p></div>
        <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="glass-card p-5 border-l-[3px] border-emerald-500/30">
              <TrendingUp size={20} className="text-emerald-400 mb-2" />
              <p className="text-3xl font-bold text-emerald-400">{Math.round(collRate)}%</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Collection Rate</p>
            </div>
            <div className="glass-card p-5 border-l-[3px] border-red-500/30">
              <AlertTriangle size={20} className="text-red-400 mb-2" />
              <p className="text-3xl font-bold text-red-400">{fmt(totalOverdue)}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Ληξιπρόθεσμα</p>
            </div>
            <div className="glass-card p-5 border-l-[3px] border-amber-500/30">
              <Clock size={20} className="text-amber-400 mb-2" />
              <p className="text-3xl font-bold text-amber-400">{reminders.length}</p>
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Ενεργές Υπενθυμίσεις</p>
            </div>
          </div>

          <div className="glass-card p-5 space-y-3">
            <h3 className="section-title">Δείκτης Είσπραξης</h3>
            <div className="w-full h-3 rounded-full bg-[#0d2035] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${Math.min(collRate, 100)}%` }} />
            </div>
            <p className="text-xs text-[#5a7a9a]">{Math.round(collRate)}% των τιμολογίων έχουν εισπραχθεί</p>
          </div>

          {/* Quick email all overdue */}
          {overdue.length > 0 && (
            <div className="glass-card p-5 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="section-title">Μαζική Αποστολή Υπενθυμίσεων</h3>
                  <p className="text-xs text-[#5a7a9a] mt-1">{overdue.length} ληξιπρόθεσμα τιμολόγια — αποστολή υπενθύμισης σε όλους τους πελάτες</p>
                </div>
                <button
                  onClick={sendBulkEmails}
                  disabled={sending === 'bulk'}
                  className="btn-gold text-xs flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50">
                  {sending === 'bulk'
                    ? <><RefreshCw size={13} className="animate-spin" /> Αποστολή...</>
                    : <><Send size={13} /> Αποστολή σε Όλους</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reminders tab ── */}
      {activeTab === 'reminders' && (
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Υπενθυμίσεις Είσπραξης ({reminders.length})</h3>
          {reminders.length === 0 ? (
            <p className="text-sm text-[#5a7a9a] py-8 text-center">Δεν υπάρχουν ενεργές υπενθυμίσεις.</p>
          ) : (
            <div className="space-y-2">
              {reminders.map((r: any, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#0d2035]/40 border border-[#1a3a5c]/20 hover:border-[#1a3a5c]/50 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#d4dce8] font-medium truncate">{r.case_title || r.client_name || '—'}</p>
                    <p className="text-xs text-[#5a7a9a]">Κύκλος: {r.current_step || r.cycle || '—'}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className="font-mono text-sm text-[#C6A75E]">{fmt(Number(r.amount || 0))}</span>
                    <button
                      onClick={() => sendReminderEmail(r, 'reminder')}
                      disabled={sending === (r._id || r.id || String(i))}
                      title="Αποστολή Email"
                      className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-40">
                      {sending === (r._id || r.id || String(i))
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Mail size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Overdue tab ── */}
      {activeTab === 'overdue' && (
        <div className="glass-card overflow-hidden table-scroll">
          <div className="p-5 border-b border-[#1a3a5c]/40 flex items-center justify-between">
            <h3 className="section-title">Ληξιπρόθεσμα Τιμολόγια ({overdue.length})</h3>
            {overdue.length > 0 && (
              <button
                onClick={sendBulkEmails}
                disabled={sending === 'bulk'}
                className="btn-dark text-xs flex items-center gap-1.5 text-amber-400 border-amber-500/30 hover:border-amber-500/60 disabled:opacity-50">
                {sending === 'bulk'
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <Send size={12} />}
                Μαζική Αποστολή
              </button>
            )}
          </div>
          {overdue.length === 0 ? (
            <p className="text-sm text-[#5a7a9a] py-8 text-center">Δεν υπάρχουν ληξιπρόθεσμα τιμολόγια.</p>
          ) : (
            <table className="w-full table-premium">
              <thead>
                <tr className="bg-[#0d2035]/40">
                  <th>Τιμολόγιο</th>
                  <th>Υπόθεση</th>
                  <th>Ποσό</th>
                  <th>Ημέρες</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((o: any, i) => {
                  const itemId = o._id || o.id || String(i);
                  return (
                    <tr key={i}>
                      <td className="font-mono text-xs text-[#C6A75E]">{o.invoice_number || '—'}</td>
                      <td className="text-xs">{o.case_title || '—'}</td>
                      <td className="font-mono text-sm text-red-400">{fmt(Number(o.amount || o.total || 0))}</td>
                      <td><span className="status-urgent">{o.days_overdue || o.days || '?'}d</span></td>
                      <td>
                        <button
                          onClick={() => sendReminderEmail(o, 'overdue')}
                          disabled={sending === itemId}
                          title="Αποστολή υπενθύμισης"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all disabled:opacity-40">
                          {sending === itemId
                            ? <RefreshCw size={11} className="animate-spin" />
                            : <Mail size={11} />}
                          <span className="hidden sm:inline">Email</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
