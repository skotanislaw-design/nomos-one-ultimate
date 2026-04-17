import { useEffect, useState } from 'react';
import { Plus, X, GitBranch, ArrowRight, Phone, Mail } from 'lucide-react';
import { leadsApi } from '@/lib/api';
import { toast } from 'sonner';

const STAGES = ['new', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS: Record<string,string> = { new:'Νέο', contacted:'Επαφή', meeting:'Ραντεβού', proposal:'Πρόταση', negotiation:'Διαπραγμ.', won:'Κερδήθηκε', lost:'Χάθηκε' };
const STAGE_COLORS: Record<string,string> = { new:'border-blue-500/30', contacted:'border-purple-500/30', meeting:'border-amber-500/30', proposal:'border-cyan-500/30', negotiation:'border-orange-500/30', won:'border-emerald-500/30', lost:'border-red-500/30' };

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', notes: '' });

  const load = () => { leadsApi.pipeline().then(r => { setPipeline(r.data || {}); setLoading(false); }).catch(() => { leadsApi.list().then(r => { const grouped: Record<string,any[]> = {}; (r.data || []).forEach((l: any) => { const s = l.stage || 'new'; if (!grouped[s]) grouped[s] = []; grouped[s].push(l); }); setPipeline(grouped); setLoading(false); }).catch(() => setLoading(false)); }); };
  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => { e.preventDefault(); try { await leadsApi.create(form); toast.success('Lead δημιουργήθηκε'); setShowAdd(false); load(); } catch { toast.error('Σφάλμα'); } };
  const moveStage = async (id: string, stage: string) => { try { await leadsApi.updateStage(id, { stage }); load(); } catch { toast.error('Σφάλμα'); } };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  const totalLeads = Object.values(pipeline).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="page-title">Pipeline CRM</h2><p className="page-subtitle">{totalLeads} leads στο pipeline</p></div>
        <button onClick={() => setShowAdd(true)} className="btn-gold text-xs flex items-center gap-1.5"><Plus size={14} /> Νέο Lead</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {STAGES.filter(s => s !== 'won' && s !== 'lost').map(stage => (
          <div key={stage} className={`glass-card p-4 border-t-[3px] ${STAGE_COLORS[stage]}`}>
            <h3 className="text-xs font-semibold text-[#8aa0b8] uppercase mb-3">{STAGE_LABELS[stage]} ({(pipeline[stage]||[]).length})</h3>
            <div className="space-y-2">
              {(pipeline[stage] || []).map((lead: any) => (
                <div key={lead._id||lead.id} className="p-3 rounded-lg bg-[#0d2035]/60 border border-[#1a3a5c]/30 hover:border-[#C6A75E]/20 transition-all">
                  <p className="text-sm text-[#d4dce8] font-medium">{lead.name}</p>
                  {lead.phone && <p className="text-xs text-[#5a7a9a] flex items-center gap-1 mt-1"><Phone size={10} />{lead.phone}</p>}
                  {lead.source && <p className="text-[10px] text-[#5a7a9a] mt-1">Πηγή: {lead.source}</p>}
                  <div className="flex gap-1 mt-2">{STAGES.filter(s => s !== stage && s !== 'won' && s !== 'lost').slice(0,2).map(s => (
                    <button key={s} onClick={() => moveStage(lead._id||lead.id, s)} className="text-[9px] px-1.5 py-0.5 rounded bg-[#132B45] text-[#8aa0b8] hover:text-[#C6A75E] border border-[#1a3a5c]/30">→ {STAGE_LABELS[s]}</button>
                  ))}</div>
                </div>
              ))}
              {(!pipeline[stage] || pipeline[stage].length === 0) && <p className="text-xs text-[#5a7a9a] text-center py-4">Κενό</p>}
            </div>
          </div>
        ))}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#1a3a5c]/40 flex items-center justify-between"><h3 className="text-lg font-bold text-white">Νέο Lead</h3><button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]"><X size={18} /></button></div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div><label className="label">Ονοματεπώνυμο</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-dark" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Τηλέφωνο</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-dark" /></div>
                <div><label className="label">Email</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-dark" /></div>
              </div>
              <div><label className="label">Πηγή</label><input value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="input-dark" placeholder="π.χ. Σύσταση, Website" /></div>
              <div className="flex gap-2 pt-2"><button type="submit" className="btn-gold flex-1">Δημιουργία</button><button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
