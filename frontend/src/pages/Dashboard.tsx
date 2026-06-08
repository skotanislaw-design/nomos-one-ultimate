import { useEffect, useState } from 'react';
import { Users, Briefcase, Scale, TrendingUp, AlertTriangle, Clock, ArrowRight,
  DollarSign, Calendar, CreditCard, GitBranch, ArrowUpRight, ArrowDownRight,
  Inbox, FileText } from 'lucide-react';
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
      setStats(s.data || {}); setKpi(k.data); setDeadlines(d.data || []); setStagnant(st.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 rounded-xl border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );

  const overdueAmt = kpi?.financials?.overdue_amount || 0;
  const overdueCount = kpi?.financials?.overdue_count || 0;
  const stuckCount = kpi?.cases?.stuck_14d || 0;
  const collRate = kpi?.financials?.collection_rate || 0;
  const monthRevenue = kpi?.financials?.month_revenue || stats?.monthly_revenue || 0;
  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  const today = new Date();
  const dayName = today.toLocaleDateString('el-GR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });
  const urgentDeadlines = deadlines.filter((d: any) => {
    const dt = new Date(d.date || d.due_date);
    return (dt.getTime() - today.getTime()) < 3 * 86400000;
  }).length;

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── Hero Banner ── */}
      <div className="glass-card overflow-hidden table-scroll relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full opacity-5"
            style={{ background: 'radial-gradient(circle, #C6A75E 0%, transparent 70%)' }} />
        </div>
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-[#C6A75E]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C6A75E]">Nomos One</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 tracking-tight"
                style={{ fontFamily: 'EB Garamond, Georgia, serif' }}>
                Καλωσήρθατε, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-sm text-[#6a8aaa]">
                <span className="capitalize">{dayName}</span>, {dateStr}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {urgentDeadlines > 0 && (
                <div onClick={() => nav('/calendar')} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-colors">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs text-red-300 font-medium">{urgentDeadlines} επείγουσες</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {(overdueAmt > 0 || stuckCount > 0) && (
        <div className="space-y-2">
          {overdueAmt > 0 && (
            <div onClick={() => nav('/billing')} className="glass-card p-3 border-l-4 border-red-500/50 cursor-pointer hover:border-red-400/70 transition-all flex items-center gap-3">
              <AlertTriangle size={15} className="text-red-400 flex-shrink-0" />
              <span className="text-sm text-[#c0d0e0]">
                <strong className="text-red-300">€{overdueAmt.toLocaleString('el-GR')}</strong> ληξιπρόθεσμα σε {overdueCount} τιμολόγια
              </span>
              <ArrowRight size={13} className="ml-auto text-red-400 flex-shrink-0" />
            </div>
          )}
          {stuckCount > 0 && (
            <div onClick={() => nav('/crm-workflow')} className="glass-card p-3 border-l-4 border-amber-500/50 cursor-pointer hover:border-amber-400/70 transition-all flex items-center gap-3">
              <Clock size={15} className="text-amber-400 flex-shrink-0" />
              <span className="text-sm text-[#c0d0e0]">
                <strong className="text-amber-300">{stuckCount} υποθέσεις</strong> αδρανείς &gt;14 ημέρες
              </span>
              <ArrowRight size={13} className="ml-auto text-amber-400 flex-shrink-0" />
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: 'Ενεργοί Πελάτες', value: stats?.total_clients || 0,
            icon: Users, color: '#3b82f6', glow: 'rgba(59,130,246,0.15)',
            border: 'border-blue-500/25', to: '/clients',
          },
          {
            label: 'Ανοιχτές Υποθέσεις', value: stats?.active_cases || 0,
            icon: Briefcase, color: '#C6A75E', glow: 'rgba(198,167,94,0.15)',
            border: 'border-[#C6A75E]/25', to: '/cases',
          },
          {
            label: 'Επερχόμενες', value: deadlines?.length || 0,
            icon: Calendar, color: '#a855f7', glow: 'rgba(168,85,247,0.15)',
            border: 'border-purple-500/25', to: '/calendar',
            sub: urgentDeadlines > 0 ? `${urgentDeadlines} επείγουσες` : undefined,
            subColor: urgentDeadlines > 0 ? 'text-red-400' : undefined,
          },
          {
            label: 'Είσπραξη', value: `${Math.round(collRate)}%`,
            icon: TrendingUp, color: '#10b981', glow: 'rgba(16,185,129,0.15)',
            border: 'border-emerald-500/25', to: '/billing',
            sub: collRate >= 80 ? 'Καλή απόδοση' : 'Χρειάζεται προσοχή',
            subColor: collRate >= 80 ? 'text-emerald-400' : 'text-amber-400',
          },
        ].map((s, i) => (
          <button key={i} onClick={() => nav(s.to)}
            className={`glass-card-hover p-4 sm:p-5 text-left border-t-2 ${s.border} relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)` }} />
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${s.glow}`, border: `1px solid ${s.color}22` }}>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <ArrowUpRight size={13} className="text-[#3a5a7a]" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 tracking-tight">{s.value}</p>
            <p className="text-[11px] text-[#6a8aaa] uppercase tracking-wider">{s.label}</p>
            {s.sub && <p className={`text-[10px] mt-1 font-medium ${s.subColor}`}>{s.sub}</p>}
          </button>
        ))}
      </div>

      {/* ── Financial Strip ── */}
      {monthRevenue > 0 && (
        <div className="glass-card p-4 flex flex-col sm:flex-row gap-4 sm:gap-0 sm:divide-x divide-[#1a3a5c]/50">
          {[
            { label: 'Έσοδα Μήνα', value: `€${monthRevenue.toLocaleString('el-GR')}`, icon: DollarSign, color: '#10b981', to: '/invoicing' },
            { label: 'Ληξιπρόθεσμα', value: overdueAmt > 0 ? `€${overdueAmt.toLocaleString('el-GR')}` : '—', icon: AlertTriangle, color: overdueAmt > 0 ? '#f87171' : '#4a6a8a', to: '/billing' },
            { label: 'Ποσοστό Είσπραξης', value: `${Math.round(collRate)}%`, icon: TrendingUp, color: collRate >= 80 ? '#10b981' : '#f59e0b', to: '/billing' },
          ].map((f, i) => (
            <button key={i} onClick={() => nav(f.to)} className="flex-1 flex items-center gap-3 px-4 sm:px-6 cursor-pointer hover:bg-[#0d2035]/30 transition-colors rounded-lg py-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${f.color}15` }}>
                <f.icon size={16} style={{ color: f.color }} />
              </div>
              <div>
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">{f.label}</p>
                <p className="text-base font-bold text-white mt-0.5">{f.value}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Quick Actions + Deadlines ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Γρήγορες Ενέργειες</h3>
          <div className="space-y-2">
            {[
              { label: 'Νέος Πελάτης', icon: Users, to: '/clients', desc: 'Προσθήκη εντολέα' },
              { label: 'Νέα Υπόθεση', icon: Briefcase, to: '/cases', desc: 'Άνοιγμα φακέλου' },
              { label: 'AI Intake', icon: Inbox, to: '/intake', desc: 'Ανάλυση εγγράφου' },
              { label: 'Τιμολόγηση', icon: CreditCard, to: '/invoicing', desc: 'Νέο τιμολόγιο' },
            ].map((a, i) => (
              <button key={i} onClick={() => nav(a.to)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-[#0a1929]/60 border border-[#1a3a5c]/30 hover:border-[#C6A75E]/30 hover:bg-[#0d2035]/60 transition-all text-left group cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-[#0d2035] border border-[#1a3a5c]/50 flex items-center justify-center group-hover:border-[#C6A75E]/30 group-hover:bg-[#C6A75E]/5 transition-all">
                  <a.icon size={15} className="text-[#6a8aaa] group-hover:text-[#C6A75E] transition-colors" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#c0d0e0] group-hover:text-[#E8C97A] transition-colors">{a.label}</p>
                  <p className="text-[11px] text-[#4a6a8a]">{a.desc}</p>
                </div>
                <ArrowRight size={13} className="text-[#2a4a6a] group-hover:text-[#C6A75E] transition-colors" />
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Επερχόμενες Προθεσμίες</h3>
            <button onClick={() => nav('/calendar')} className="text-[11px] text-[#C6A75E] hover:text-[#E8C97A] flex items-center gap-1 transition-colors cursor-pointer">
              Όλες <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {(deadlines || []).slice(0, 5).map((d: any, i: number) => {
              const dt = new Date(d.date || d.due_date);
              const daysLeft = Math.ceil((dt.getTime() - today.getTime()) / 86400000);
              const isUrgent = daysLeft <= 2;
              const isToday = daysLeft === 0;
              return (
                <div key={i} className={`flex gap-3 p-3 rounded-lg border transition-colors
                  ${isUrgent ? 'bg-red-500/5 border-red-500/20' : 'bg-[#0a1929]/50 border-[#1a3a5c]/20'}`}>
                  <div className="flex-shrink-0 w-11 text-center">
                    <div className={`text-lg font-bold leading-tight ${isUrgent ? 'text-red-400' : 'text-[#C6A75E]'}`}
                      style={{ fontFamily: 'EB Garamond, serif' }}>{dt.getDate()}</div>
                    <div className="text-[9px] uppercase text-[#4a6a8a] tracking-wider">
                      {dt.toLocaleDateString('el-GR', { month: 'short' })}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#d4dce8] font-medium truncate">{d.title || d.description}</p>
                    <p className="text-[11px] text-[#4a6a8a] truncate">{d.case_title || ''}</p>
                  </div>
                  <div className="flex-shrink-0 self-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full
                      ${isToday ? 'bg-red-500/15 text-red-400' : isUrgent ? 'bg-amber-500/15 text-amber-400' : 'bg-[#1a3a5c]/40 text-[#6a8aaa]'}`}>
                      {isToday ? 'Σήμερα' : daysLeft === 1 ? 'Αύριο' : `${daysLeft}μ`}
                    </span>
                  </div>
                </div>
              );
            })}
            {(!deadlines || deadlines.length === 0) && (
              <div className="text-center py-6">
                <Calendar size={24} className="text-[#2a4a6a] mx-auto mb-2" />
                <p className="text-sm text-[#4a6a8a]">Δεν υπάρχουν επερχόμενες προθεσμίες</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stagnant Cases ── */}
      {stagnant.length > 0 && (
        <div className="glass-card overflow-hidden table-scroll">
          <div className="p-4 border-b border-[#1a3a5c]/40 flex items-center gap-2">
            <Clock size={14} className="text-amber-400" />
            <h3 className="section-title">Αδρανείς Υποθέσεις</h3>
            <span className="ml-auto text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">{stagnant.length}</span>
          </div>
          <table className="w-full table-premium">
            <thead>
              <tr className="bg-[#0a1929]/60">
                <th>Κωδικός</th><th>Τίτλος</th><th className="hidden sm:table-cell">Πελάτης</th><th>Αδρανές</th>
              </tr>
            </thead>
            <tbody>
              {stagnant.slice(0, 5).map((c: any) => (
                <tr key={c._id || c.id} onClick={() => nav(`/cases/${c._id || c.id}`)}>
                  <td className="font-mono text-xs text-[#C6A75E]">{c.case_number}</td>
                  <td className="font-medium text-[#d4dce8] max-w-[180px] truncate">{c.title}</td>
                  <td className="hidden sm:table-cell text-xs text-[#8aa0b8]">{c.client_name}</td>
                  <td><span className="status-urgent">{c.days_since_update || '?'}d</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
