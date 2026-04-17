import { useEffect, useState } from 'react';
import { Plus, X, GitBranch, ArrowRight, Phone, Mail, AlertTriangle, Clock, CheckCircle, FileCheck } from 'lucide-react';
import { leadsApi, workflowApi } from '@/lib/api';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from 'sonner';

// Pipeline stages
const STAGES = ['new', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS: Record<string,string> = {
  new: 'Νέο', contacted: 'Επαφή', meeting: 'Ραντεβού', proposal: 'Πρόταση',
  negotiation: 'Διαπραγμ.', won: 'Κερδήθηκε', lost: 'Χάθηκε'
};
const STAGE_COLORS: Record<string,string> = {
  new: 'border-blue-500/30', contacted: 'border-purple-500/30', meeting: 'border-amber-500/30',
  proposal: 'border-cyan-500/30', negotiation: 'border-orange-500/30',
  won: 'border-emerald-500/30', lost: 'border-red-500/30'
};

type TabType = 'pipeline' | 'workflow';

export default function CRMWorkflowPage() {
  const [activeTab, setActiveTab] = useState<TabType>('pipeline');
  const [pipeline, setPipeline] = useState<Record<string, any[]>>({});
  const [stuck, setStuck] = useState<any[]>([]);
  const [noAction, setNoAction] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLead, setShowAddLead] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', notes: '' });

  /* ── Load Pipeline ── */
  const loadPipeline = () => {
    leadsApi.pipeline()
      .then(r => { setPipeline(r.data || {}); })
      .catch(() => {
        leadsApi.list()
          .then(r => {
            const grouped: Record<string,any[]> = {};
            (r.data || []).forEach((l: any) => {
              const s = l.stage || 'new';
              if (!grouped[s]) grouped[s] = [];
              grouped[s].push(l);
            });
            setPipeline(grouped);
          })
          .catch(() => {});
      });
  };

  /* ── Load Workflow ── */
  const loadWorkflow = () => {
    Promise.all([
      workflowApi.stuckCases().catch(() => ({ data: [] })),
      workflowApi.noNextAction().catch(() => ({ data: [] })),
      workflowApi.templates().catch(() => ({ data: [] })),
    ]).then(([s, n, t]) => {
      setStuck(s.data || []);
      setNoAction(n.data || []);
      setTemplates(Array.isArray(t.data)
        ? t.data
        : Object.entries(t.data || {}).map(([k, v]) => ({ id: k, ...((v as any)) })));
      setLoading(false);
    });
  };

  useEffect(() => {
    loadPipeline();
    loadWorkflow();
  }, []);

  /* ── Add Lead ── */
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await leadsApi.create(form);
      toast.success('Lead δημιουργήθηκε');
      setShowAddLead(false);
      setForm({ name: '', phone: '', email: '', source: '', notes: '' });
      loadPipeline();
    } catch {
      toast.error('Σφάλμα κατά τη δημιουργία');
    }
  };

  /* ── Move Stage ── */
  const moveStage = async (id: string, stage: string) => {
    try {
      await leadsApi.updateStage(id, { stage });
      loadPipeline();
    } catch {
      toast.error('Σφάλμα κατά την ενημέρωση');
    }
  };

  /* ── Navigate ── */
  const navigate = (p: string) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
    </div>
  );

  const totalLeads = Object.values(pipeline).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="page-title">CRM & Workflow</h2>
            <Tooltip
              title="CRM & Workflow"
              description="Pipeline CRM παρακολουθεί νέα leads και τα στάδια διαπραγμάτευσης. Workflow ανιχνεύει υποθέσεις που έχουν κολλήσει ή χρειάζονται ενέργεια. Συνδυάστε τα δύο για πλήρη διαχείριση ευκαιριών και υποθέσεων."
              children={<span className="text-xs text-[#5a7a9a]">ⓘ</span>}
            />
          </div>
          <p className="page-subtitle">
            {activeTab === 'pipeline' ? `${totalLeads} leads στο pipeline` : 'Παρακολούθηση εξέλιξης υποθέσεων'}
          </p>
        </div>
        {activeTab === 'pipeline' && (
          <button onClick={() => setShowAddLead(true)} className="btn-gold text-xs flex items-center gap-1.5">
            <Plus size={14} /> Νέο Lead
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-[#1a3a5c]">
        {[
          {
            id: 'pipeline' as const,
            label: 'Pipeline CRM',
            desc: 'Νέα leads και στάδια διαπραγμάτευσης'
          },
          {
            id: 'workflow' as const,
            label: 'Workflow',
            desc: 'Υποθέσεις που χρειάζονται ενέργεια'
          },
        ].map(tab => (
          <div key={tab.id} className="relative">
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'text-[#C6A75E] border-b-2 border-[#C6A75E]'
                  : 'text-[#5a7a9a] hover:text-[#8aa0b8]'
              }`}
            >
              {tab.label}
            </button>
            <Tooltip
              title={tab.label}
              description={tab.desc}
              className="absolute -top-1 -right-6"
            />
          </div>
        ))}
      </div>

      {/* ╔═══════════════════════════════════════════════════════════════
          ║ PIPELINE TAB
          ╚═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Kanban board */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {STAGES.filter(s => s !== 'won' && s !== 'lost').map(stage => (
              <div key={stage} className={`glass-card p-4 border-t-[3px] ${STAGE_COLORS[stage]}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-[#8aa0b8] uppercase">
                    {STAGE_LABELS[stage]} ({(pipeline[stage] || []).length})
                  </h3>
                  <Tooltip
                    title={STAGE_LABELS[stage]}
                    description={`Leads στο στάδιο: ${STAGE_LABELS[stage]}`}
                  />
                </div>
                <div className="space-y-2">
                  {(pipeline[stage] || []).map((lead: any) => (
                    <div
                      key={lead._id || lead.id}
                      className="p-3 rounded-lg bg-[#0d2035]/60 border border-[#1a3a5c]/30 hover:border-[#C6A75E]/20 transition-all"
                    >
                      <p className="text-sm text-[#d4dce8] font-medium">{lead.name}</p>
                      {lead.phone && <p className="text-xs text-[#5a7a9a] flex items-center gap-1 mt-1"><Phone size={10} /> {lead.phone}</p>}
                      {lead.source && <p className="text-[10px] text-[#5a7a9a] mt-1">Πηγή: {lead.source}</p>}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {STAGES.filter(s => s !== stage && s !== 'won' && s !== 'lost').slice(0, 2).map(s => (
                          <button
                            key={s}
                            onClick={() => moveStage(lead._id || lead.id, s)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[#132B45] text-[#8aa0b8] hover:text-[#C6A75E] border border-[#1a3a5c]/30"
                          >
                            → {STAGE_LABELS[s].slice(0, 4)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(!pipeline[stage] || pipeline[stage].length === 0) && (
                    <p className="text-xs text-[#5a7a9a] text-center py-4">Κενό</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════════════════════════════
          ║ WORKFLOW TAB
          ╚═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'workflow' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-5 border-l-[3px] border-red-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <AlertTriangle size={20} className="text-red-400 mb-2" />
                  <p className="text-3xl font-bold text-red-400">{stuck.length}</p>
                  <p className="text-xs text-[#6a8aaa] uppercase">Stuck {'>'}14 ημέρες</p>
                </div>
                <Tooltip
                  title="Stuck Υποθέσεις"
                  description="Υποθέσεις που δεν έχουν δείξει ενέργεια για περισσότερες από 14 ημέρες. Χρειάζονται άμεση ενέργεια ή ενημέρωση κλιέντη."
                />
              </div>
            </div>
            <div className="glass-card p-5 border-l-[3px] border-amber-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <Clock size={20} className="text-amber-400 mb-2" />
                  <p className="text-3xl font-bold text-amber-400">{noAction.length}</p>
                  <p className="text-xs text-[#6a8aaa] uppercase">Χωρίς επόμενο βήμα</p>
                </div>
                <Tooltip
                  title="Χωρίς Επόμενο Βήμα"
                  description="Υποθέσεις που δεν έχουν καθοριστεί επόμενη ενέργεια. Ανάθεση μιας προθεσμίας ή επόμενου βήματος είναι απαραίτητη."
                />
              </div>
            </div>
          </div>

          {/* Stuck cases table */}
          {stuck.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="p-5 border-b border-[#1a3a5c]/40">
                <h3 className="section-title">⚠ Stuck Υποθέσεις</h3>
              </div>
              <table className="w-full table-premium">
                <thead>
                  <tr className="bg-[#0d2035]/40">
                    <th>Κωδικός</th>
                    <th>Τίτλος</th>
                    <th className="hidden sm:table-cell">Στάδιο</th>
                    <th>Ημέρες</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stuck.map((c: any) => (
                    <tr key={c._id || c.id}>
                      <td className="font-mono text-xs text-[#C6A75E]">{c.case_number || '—'}</td>
                      <td className="text-sm text-[#d4dce8]">{c.title}</td>
                      <td className="hidden sm:table-cell text-xs">{c.status || c.stage || '—'}</td>
                      <td><span className="status-urgent">{c.days_since_update || c.days || '?'}d</span></td>
                      <td>
                        <button
                          onClick={() => navigate(`/cases/${c._id || c.id}`)}
                          className="text-[#C6A75E] hover:text-[#E8C97A] transition-colors"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No action cases */}
          {noAction.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="p-5 border-b border-[#1a3a5c]/40">
                <h3 className="section-title">⏳ Χωρίς Επόμενο Βήμα</h3>
              </div>
              <table className="w-full table-premium">
                <thead>
                  <tr className="bg-[#0d2035]/40">
                    <th>Κωδικός</th>
                    <th>Τίτλος</th>
                    <th className="hidden sm:table-cell">Πελάτης</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {noAction.map((c: any) => (
                    <tr key={c._id || c.id}>
                      <td className="font-mono text-xs text-[#C6A75E]">{c.case_number || '—'}</td>
                      <td className="text-sm text-[#d4dce8]">{c.title}</td>
                      <td className="hidden sm:table-cell text-xs text-[#8aa0b8]">{c.client_name || '—'}</td>
                      <td>
                        <button
                          onClick={() => navigate(`/cases/${c._id || c.id}`)}
                          className="text-[#C6A75E] hover:text-[#E8C97A] transition-colors"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Workflow templates */}
          {templates.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="section-title">Workflow Templates</h3>
                <Tooltip
                  title="Workflow Templates"
                  description="Προ-κατασκευασμένες ροές εργασίας για διάφορους τύπους υποθέσεων. Χρησιμοποιήστε ως εκκίνηση για νέες περιπτώσεις."
                />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((t: any, i) => (
                  <div key={i} className="p-4 rounded-lg bg-[#0d2035]/40 border border-[#1a3a5c]/20">
                    <p className="text-sm text-[#d4dce8] font-medium mb-1">{t.name || t.id}</p>
                    <p className="text-xs text-[#5a7a9a]">{t.stages?.length || t.steps?.length || 0} στάδια</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ╔═══════════════════════════════════════════════════════════════
          ║ ADD LEAD MODAL
          ╚═══════════════════════════════════════════════════════════════ */}
      {showAddLead && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddLead(false)}>
          <div className="glass-card w-full max-w-md border border-[#1a3a5c]"
            onClick={e => e.stopPropagation()}>

            <div className="p-5 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Νέο Lead</h3>
              <button onClick={() => setShowAddLead(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddLead} className="p-5 space-y-4">
              <div>
                <label className="label">Ονοματεπώνυμο *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="input-dark"
                  placeholder="Όνομα προοπτικής"
                  required
                />
              </div>
              <div>
                <label className="label">Τηλέφωνο</label>
                <input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="input-dark"
                  placeholder="+30 210 000 0000"
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="input-dark"
                  placeholder="info@example.com"
                />
              </div>
              <div>
                <label className="label">Πηγή</label>
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="input-dark">
                  <option value="">Επιλέξτε πηγή...</option>
                  <option value="phone">Τηλεφωνική επαφή</option>
                  <option value="email">Email</option>
                  <option value="referral">Σύσταση</option>
                  <option value="website">Website</option>
                  <option value="social">Social Media</option>
                </select>
              </div>
              <div>
                <label className="label">Σημειώσεις</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-dark h-24 resize-none"
                  placeholder="Περιγραφή της υπόθεσης..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1">Δημιουργία</button>
                <button type="button" onClick={() => setShowAddLead(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
