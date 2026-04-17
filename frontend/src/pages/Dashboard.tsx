import { useEffect, useState } from 'react';
import { Users, Briefcase, Scale, TrendingUp, AlertTriangle, Clock, ArrowRight, DollarSign, FileText, Calendar, CreditCard, GitBranch } from 'lucide-react';
import { dashboardApi, deadlinesApi, casesApi, billingApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [kpi, setKpi] = useState<any>(null);
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [stagnant, setStagnant] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dashboardApi.stats().catch(() => ({ data: {} })),
      dashboardApi.kpi().catch(() => ({ data: null })),
      deadlinesApi.upcoming(14).catch(() => ({ data: [] })),
      casesApi.stagnant().catch(() => ({ data: [] })),
    ]).then(([s, k, d, st]) => {
      setStats(s.data); setKpi(k.data); setDeadlines(d.data); setStagnant(st.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  const overdueAmt = kpi?.financials?.overdue_amount || 0;
  const overdueCount = kpi?.financials?.overdue_count || 0;
  const stuckCount = kpi?.cases?.stuck_14d || 0;
  const collRate = kpi?.financials?.collection_rate || 0;
  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-card p-6 sm:p-8 border-l-4 border-[#C6A75E]/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2"><Scale size={20} className="text-[#C6A75E]" /><span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C6A75E]">Nomos One</span></div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>Καλωσήρθατε, {user?.name?.split(' ')[0]}</h1>
            <p className="text-sm text-[#7a9ab8]">Σκοτάνης & Συνεργάτες — Κέντρο Ελέγχου</p>
          </div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs text-emerald-400 font-medium">Online</span></div>
        </div>
      </div>

      {/* Alerts */}
      {(overdueAmt > 0 || stuckCount > 0) && (
        <div className="space-y-2">
          {overdueAmt > 0 && <div onClick={() => nav('/billing')} className="glass-card p-3 border-l-4 border-red-500/40 cursor-pointer hover:border-red-500/60 transition-all flex items-center gap-3"><AlertTriangle size={16} className="text-red-400" /><span className="text-sm text-red-300"><strong>€{overdueAmt.toLocaleString()}</strong> ληξιπρόθεσμα σε {overdueCount} τιμολόγια</span><ArrowRight size={14} className="ml-auto text-red-400" /></div>}
          {stuckCount > 0 && <div onClick={() => nav('/workflow')} className="glass-card p-3 border-l-4 border-amber-500/40 cursor-pointer hover:border-amber-500/60 transition-all flex items-center gap-3"><Clock size={16} className="text-amber-400" /><span className="text-sm text-amber-300"><strong>{stuckCount} υποθέσεις</strong> stuck {'>'} 14 ημέρες</span><ArrowRight size={14} className="ml-auto text-amber-400" /></div>}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ενεργοί Πελάτες', value: stats?.total_clients || 0, icon: Users, color: '#3b82f6', border: 'border-blue-500/30', to: '/clients' },
          { label: 'Ανοικτές Υποθέσεις', value: stats?.active_cases || 0, icon: Briefcase, color: '#C6A75E', border: 'border-[#C6A75E]/30', to: '/cases' },
          { label: 'Επερχόμενες Προθεσμίες', value: deadlines?.length || 0, icon: Calendar, color: '#a855f7', border: 'border-purple-500/30', to: '/calendar' },
          { label: 'Είσπραξη %', value: `${Math.round(collRate)}%`, icon: TrendingUp, color: '#10b981', border: 'border-emerald-500/30', to: '/billing' },
        ].map((s, i) => (
          <button key={i} onClick={() => nav(s.to)} className={`glass-card-hover p-4 sm:p-5 text-left border-l-[3px] ${s.border}`}>
            <div className="flex items-center justify-between mb-3"><s.icon size={20} style={{ color: s.color }} /><ArrowRight size={14} className="text-[#3a5a7a]" /></div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-1">{s.value}</p>
            <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Quick Actions + Deadlines */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Γρήγορες Ενέργειες</h3>
          <div className="space-y-2">
            {[
              { label: 'Νέος Πελάτης', icon: Users, to: '/clients' },
              { label: 'Νέα Υπόθεση', icon: Briefcase, to: '/cases' },
              { label: 'Pipeline Lead', icon: GitBranch, to: '/pipeline' },
              { label: 'Τιμολόγηση', icon: CreditCard, to: '/invoicing' },
            ].map((a, i) => (
              <button key={i} onClick={() => nav(a.to)} className="w-full flex items-center gap-3 p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/30 hover:border-[#C6A75E]/30 transition-all text-left group">
                <div className="w-8 h-8 rounded-lg bg-[#132B45] flex items-center justify-center group-hover:bg-[#C6A75E]/10"><a.icon size={15} className="text-[#7a9ab8] group-hover:text-[#C6A75E]" /></div>
                <span className="text-sm text-[#c0d0e0] group-hover:text-[#C6A75E]">{a.label}</span>
                <ArrowRight size={14} className="ml-auto text-[#3a5a7a] group-hover:text-[#C6A75E]" />
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Προσεχείς Προθεσμίες</h3>
            <button onClick={() => nav('/calendar')} className="text-xs text-[#C6A75E] hover:text-[#E8C97A] flex items-center gap-1">Όλες <ArrowRight size={12} /></button>
          </div>
          <div className="space-y-2">
            {(deadlines || []).slice(0, 5).map((d: any, i: number) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                <div className="flex-shrink-0 w-12 text-center">
                  <div className="text-lg font-bold text-[#C6A75E]">{new Date(d.date || d.due_date).getDate()}</div>
                  <div className="text-[10px] uppercase text-[#5a7a9a]">{new Date(d.date || d.due_date).toLocaleDateString('el-GR', { month: 'short' })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#d4dce8] font-medium truncate">{d.title || d.description}</p>
                  <p className="text-xs text-[#6a8aaa] truncate">{d.case_title || ''}</p>
                </div>
              </div>
            ))}
            {(!deadlines || deadlines.length === 0) && <p className="text-sm text-[#5a7a9a] text-center py-4">Δεν υπάρχουν προσεχείς προθεσμίες</p>}
          </div>
        </div>
      </div>

      {/* Stagnant Cases */}
      {stagnant.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-[#1a3a5c]/40"><h3 className="section-title">⚠ Αδρανείς Υποθέσεις ({stagnant.length})</h3></div>
          <table className="w-full table-premium">
            <thead><tr className="bg-[#0d2035]/40"><th>Κωδικός</th><th>Τίτλος</th><th className="hidden sm:table-cell">Πελάτης</th><th>Ημέρες</th></tr></thead>
            <tbody>{stagnant.slice(0, 5).map((c: any) => (
              <tr key={c._id || c.id} className="cursor-pointer" onClick={() => nav(`/cases/${c._id || c.id}`)}>
                <td className="font-mono text-xs text-[#C6A75E]">{c.case_number}</td>
                <td className="font-medium text-[#d4dce8] max-w-[200px] truncate">{c.title}</td>
                <td className="hidden sm:table-cell text-xs">{c.client_name}</td>
                <td><span className="status-urgent">{c.days_since_update || '?'}d</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
