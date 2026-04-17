import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import { workflowApi } from '@/lib/api';

export default function WorkflowPage() {
  const [stuck, setStuck] = useState<any[]>([]);
  const [noAction, setNoAction] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([workflowApi.stuckCases().catch(()=>({data:[]})), workflowApi.noNextAction().catch(()=>({data:[]})), workflowApi.templates().catch(()=>({data:[]}))]).then(([s, n, t]) => { setStuck(s.data||[]); setNoAction(n.data||[]); setTemplates(Array.isArray(t.data) ? t.data : Object.entries(t.data||{}).map(([k,v])=>({id:k,...(v as any)}))); setLoading(false); });
  }, []);

  const nav = (p: string) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div><h2 className="page-title">Workflow & Ροή Υποθέσεων</h2><p className="page-subtitle">Παρακολούθηση εξέλιξης υποθέσεων</p></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5 border-l-[3px] border-red-500/30"><AlertTriangle size={20} className="text-red-400 mb-2" /><p className="text-3xl font-bold text-red-400">{stuck.length}</p><p className="text-xs text-[#6a8aaa] uppercase">Stuck {'>'}14 ημέρες</p></div>
        <div className="glass-card p-5 border-l-[3px] border-amber-500/30"><Clock size={20} className="text-amber-400 mb-2" /><p className="text-3xl font-bold text-amber-400">{noAction.length}</p><p className="text-xs text-[#6a8aaa] uppercase">Χωρίς επόμενο βήμα</p></div>
      </div>
      {stuck.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-[#1a3a5c]/40"><h3 className="section-title">⚠ Stuck Υποθέσεις</h3></div>
          <table className="w-full table-premium"><thead><tr className="bg-[#0d2035]/40"><th>Κωδικός</th><th>Τίτλος</th><th className="hidden sm:table-cell">Στάδιο</th><th>Ημέρες</th><th></th></tr></thead>
          <tbody>{stuck.map((c: any) => (<tr key={c._id||c.id}><td className="font-mono text-xs text-[#C6A75E]">{c.case_number||'—'}</td><td className="text-sm text-[#d4dce8]">{c.title}</td><td className="hidden sm:table-cell text-xs">{c.status || c.stage || '—'}</td><td><span className="status-urgent">{c.days_since_update||c.days||'?'}d</span></td><td><button onClick={() => nav(`/cases/${c._id||c.id}`)} className="text-[#C6A75E] hover:text-[#E8C97A]"><ArrowRight size={14} /></button></td></tr>))}</tbody>
          </table>
        </div>
      )}
      {templates.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Workflow Templates</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{templates.map((t: any, i) => (
            <div key={i} className="p-4 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
              <p className="text-sm text-[#d4dce8] font-medium mb-1">{t.name || t.id}</p>
              <p className="text-xs text-[#5a7a9a]">{t.stages?.length || t.steps?.length || 0} στάδια</p>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}
