import { useEffect, useState } from 'react';
import { TrendingUp, Users, Briefcase, DollarSign, Download, BarChart3, PieChart, TrendingDown, FileText } from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { toast } from 'sonner';

type ReportTab = 'overview' | 'financial' | 'performance';

export default function ReportsPage() {
  const [stats, setStats] = useState<any>({});
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  useEffect(() => {
    Promise.all([
      dashboardApi.stats().catch(() => ({ data: {} })),
      dashboardApi.kpi().catch(() => ({ data: null })),
    ]).then(([s, k]) => { setStats(s.data); setKpi(k.data); setLoading(false); });
  }, []);

  const fmt = (n: number) => `€${Number(n || 0).toLocaleString('el-GR')}`;

  const exportCSV = () => {
    const data = [
      ['Δείκτης', 'Τιμή'],
      ['Πελάτες', stats.total_clients || 0],
      ['Ενεργές Υποθέσεις', stats.active_cases || 0],
      ['Collection Rate %', Math.round(kpi?.financials?.collection_rate || 0)],
      ['Ληξιπρόθεσμα €', kpi?.financials?.overdue_amount || 0],
      ['Συνολικές Εισπράξεις €', kpi?.financials?.total_collected || 0],
      ['Επερχόμενες Προθεσμίες', stats.upcoming_deadlines || 0],
      ['Στάσιμες Υποθέσεις', stats.stagnant_cases || 0],
    ];
    const csv = data.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nomos_report.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Έκθεση εξήχθη σε CSV');
  };

  const exportJSON = () => {
    const data = { stats, kpi, exported_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nomos_report.json'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Έκθεση εξήχθη σε JSON');
  };

  const tabs = [
    { id: 'overview' as ReportTab, label: 'Επισκόπηση' },
    { id: 'financial' as ReportTab, label: 'Οικονομικά' },
    { id: 'performance' as ReportTab, label: 'Απόδοση' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Αναφορές & Analytics</h2><p className="page-subtitle">Επιχειρηματική ευφυΐα</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-dark text-xs flex items-center gap-1.5">
              <Download size={13} /> CSV
            </button>
            <button onClick={exportJSON} className="btn-dark text-xs flex items-center gap-1.5">
              <FileText size={13} /> JSON
            </button>
          </div>
        </div>
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Πελάτες', value: stats.total_clients || 0, icon: Users, color: 'text-blue-400', border: 'border-blue-500/30', trend: '+5%' },
              { label: 'Ενεργές Υποθέσεις', value: stats.active_cases || 0, icon: Briefcase, color: 'text-[#C6A75E]', border: 'border-[#C6A75E]/30', trend: '+2' },
              { label: 'Collection Rate', value: `${Math.round(kpi?.financials?.collection_rate || 0)}%`, icon: TrendingUp, color: 'text-emerald-400', border: 'border-emerald-500/30', trend: '+3%' },
              { label: 'Ληξιπρόθεσμα', value: fmt(kpi?.financials?.overdue_amount || 0), icon: DollarSign, color: 'text-amber-400', border: 'border-amber-500/30', trend: null },
            ].map((s, i) => (
              <div key={i} className={`glass-card p-5 border-l-[3px] ${s.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <s.icon size={20} className={s.color} />
                  {s.trend && (
                    <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                      <TrendingUp size={9} /> {s.trend}
                    </span>
                  )}
                </div>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4"><BarChart3 size={16} className="text-[#C6A75E]" /><h3 className="section-title">Κατανομή Υποθέσεων</h3></div>
              {Object.entries(stats.cases_by_status || {}).length === 0 ? (
                <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν δεδομένα.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.cases_by_status || {}).map(([status, count]: any) => {
                    const pct = stats.active_cases ? Math.round((count / stats.active_cases) * 100) : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between p-2 rounded-lg mb-1 hover:bg-[#0d2035]/40 transition-colors">
                          <span className="text-sm text-[#c0d0e0] capitalize">{status.replace('_', ' ')}</span>
                          <span className="text-sm font-bold text-[#C6A75E] font-mono">{count}</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-[#0d2035] overflow-hidden">
                          <div className="h-full rounded-full bg-[#C6A75E]/60 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4"><PieChart size={16} className="text-[#C6A75E]" /><h3 className="section-title">Κατανομή ανά Κατηγορία</h3></div>
              {Object.entries(stats.cases_by_category || {}).length === 0 ? (
                <p className="text-sm text-[#5a7a9a]">Δεν υπάρχουν δεδομένα.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.cases_by_category || {}).map(([cat, count]: any) => (
                    <div key={cat} className="flex items-center justify-between p-2 rounded-lg mb-1 hover:bg-[#0d2035]/40 transition-colors">
                      <span className="text-sm text-[#c0d0e0]">{cat}</span>
                      <span className="text-sm font-bold text-[#C6A75E] font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Financial tab ── */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="glass-card p-5 border-l-[3px] border-emerald-500/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Συνολικές Εισπράξεις</p>
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-400"><TrendingUp size={9} /></span>
              </div>
              <p className="text-3xl font-bold text-emerald-400">{fmt(kpi?.financials?.total_collected || 0)}</p>
            </div>
            <div className="glass-card p-5 border-l-[3px] border-red-500/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Ληξιπρόθεσμα</p>
                <span className="flex items-center gap-0.5 text-[10px] text-red-400"><TrendingDown size={9} /></span>
              </div>
              <p className="text-3xl font-bold text-red-400">{fmt(kpi?.financials?.overdue_amount || 0)}</p>
            </div>
            <div className="glass-card p-5 border-l-[3px] border-[#C6A75E]/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#6a8aaa] uppercase tracking-wider">Collection Rate</p>
              </div>
              <p className="text-3xl font-bold text-[#C6A75E]">{Math.round(kpi?.financials?.collection_rate || 0)}%</p>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Οικονομική Σύνοψη</h3>
            <div className="space-y-3">
              {[
                { label: 'Σύνολο Τιμολογηθέντων', value: fmt(kpi?.financials?.total_invoiced || 0), color: 'text-white' },
                { label: 'Εισπραχθέντα', value: fmt(kpi?.financials?.total_collected || 0), color: 'text-emerald-400' },
                { label: 'Εκκρεμούντα', value: fmt((kpi?.financials?.total_invoiced || 0) - (kpi?.financials?.total_collected || 0)), color: 'text-amber-400' },
                { label: 'Ληξιπρόθεσμα', value: fmt(kpi?.financials?.overdue_amount || 0), color: 'text-red-400' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between p-3 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                  <span className="text-sm text-[#8aa0b8]">{row.label}</span>
                  <span className={`font-mono font-bold ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Performance tab ── */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">Ενεργές Υποθέσεις</p>
              <p className="text-3xl font-bold text-[#C6A75E]">{stats.active_cases || 0}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">Σύνολο Πελατών</p>
              <p className="text-3xl font-bold text-white">{stats.total_clients || 0}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">Προθεσμίες</p>
              <p className="text-3xl font-bold text-amber-400">{stats.upcoming_deadlines || 0}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-[#6a8aaa] uppercase tracking-wider mb-2">Στάσιμες Υποθέσεις</p>
              <p className="text-3xl font-bold text-red-400">{stats.stagnant_cases || 0}</p>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="section-title mb-4">Δείκτες Απόδοσης</h3>
            <div className="space-y-4">
              {[
                { label: 'Εισπράξεις / Στόχος 100%', value: Math.min(Math.round(kpi?.financials?.collection_rate || 0), 100), color: 'bg-emerald-400', textColor: 'text-emerald-400' },
                { label: 'Ενεργές / Σύνολο Υποθέσεων', value: stats.total_cases ? Math.round((stats.active_cases / stats.total_cases) * 100) : 0, color: 'bg-[#C6A75E]', textColor: 'text-[#C6A75E]' },
                { label: 'Στάσιμες / Ενεργές (χαμηλότερο = καλύτερο)', value: stats.active_cases ? Math.round((stats.stagnant_cases / stats.active_cases) * 100) : 0, color: 'bg-red-400', textColor: 'text-red-400' },
              ].map(bar => (
                <div key={bar.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#8aa0b8]">{bar.label}</span>
                    <span className={`font-mono font-bold ${bar.textColor}`}>{bar.value}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[#0d2035]">
                    <div className={`h-full rounded-full ${bar.color} transition-all`} style={{ width: `${bar.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
