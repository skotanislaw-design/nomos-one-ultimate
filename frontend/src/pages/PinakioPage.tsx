import { useEffect, useState, useRef } from 'react';
import { Upload, Search, Gavel, CheckCircle, AlertCircle, ExternalLink, Trash2, RefreshCw, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { pinakiaApi } from '@/lib/api';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { parseTs } from '@/lib/prefs';

type Tab = 'list' | 'today' | 'search';

interface Hearing {
  aa: number;
  case_number: string;
  parties: string[];
  time?: string;
  notes?: string;
  matched_case_id?: string;
  matched_case_title?: string;
  matched_case_number?: string;
}

interface Pinakio {
  _id: string;
  court_name: string;
  hearing_date: string;
  file_name: string;
  uploaded_at: string;
  uploaded_by: string;
  source: 'web' | 'telegram';
  hearings?: Hearing[];
  hearing_count: number;
  match_count: number;
}

export default function PinakioPage() {
  const [tab, setTab] = useState<Tab>('list');
  const [pinakia, setPinakia] = useState<Pinakio[]>([]);
  const [todayHearings, setTodayHearings] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Pinakio>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    loadList();
    loadToday();
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const r = await pinakiaApi.list();
      setPinakia(Array.isArray(r.data) ? r.data : []);
    } catch { toast.error('Σφάλμα φόρτωσης'); }
    finally { setLoading(false); }
  };

  const loadToday = async () => {
    try {
      const r = await pinakiaApi.byDate(today);
      setTodayHearings(r.data?.hearings || []);
    } catch { /* silent */ }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const r = await pinakiaApi.upload(fd);
      const p: Pinakio = r.data;
      toast.success(`Πινάκειο αποθηκεύτηκε — ${p.hearing_count} υποθέσεις, ${p.match_count} matches`);
      setPinakia(prev => [p, ...prev]);
      setExpanded(p._id);
      setDetail(prev => ({ ...prev, [p._id]: p }));
      loadToday();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Σφάλμα ανεβάσματος');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      try {
        const r = await pinakiaApi.get(id);
        setDetail(prev => ({ ...prev, [id]: r.data }));
      } catch { toast.error('Σφάλμα φόρτωσης λεπτομερειών'); }
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Διαγραφή πινακείου;')) return;
    setDeleting(id);
    try {
      await pinakiaApi.delete(id);
      setPinakia(prev => prev.filter(p => p._id !== id));
      if (expanded === id) setExpanded(null);
      toast.success('Διαγράφηκε');
    } catch { toast.error('Σφάλμα διαγραφής'); }
    finally { setDeleting(null); }
  };

  const handleSearch = async () => {
    if (searchQ.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await pinakiaApi.search(searchQ);
      setSearchResults(r.data?.results || []);
    } catch { toast.error('Σφάλμα αναζήτησης'); }
    finally { setSearching(false); }
  };

  const fmtDate = (d: string) => {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const HearingRow = ({ h, showCourt, courtName, hearingDate }: {
    h: any; showCourt?: boolean; courtName?: string; hearingDate?: string;
  }) => (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      h.matched_case_id
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-[#0d2035]/30 border-[#1a3a5c]/15'
    }`}>
      <div className="flex-shrink-0 mt-0.5">
        {h.matched_case_id
          ? <CheckCircle size={14} className="text-emerald-400" />
          : <div className="w-3.5 h-3.5 rounded-full border border-[#3a5a7c]/50 mt-0.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#5a7a9a] font-mono">#{h.aa}</span>
          {h.case_number && (
            <span className="text-xs font-mono text-[#C6A75E]">{h.case_number}</span>
          )}
          {h.time && <span className="text-[10px] text-[#5a7a9a]">🕐 {h.time}</span>}
          {showCourt && courtName && (
            <span className="text-[10px] text-[#4a6a8a] truncate">{courtName}</span>
          )}
          {hearingDate && <span className="text-[10px] text-[#4a6a8a]">{fmtDate(hearingDate)}</span>}
        </div>
        <p className="text-sm text-[#d4dce8] font-medium mt-0.5">
          {(h.parties || []).join(' · ') || '—'}
        </p>
        {h.notes && <p className="text-[10px] text-amber-400/70 mt-0.5">{h.notes}</p>}
        {h.matched_case_id && (
          <button
            onClick={() => navigate(`/cases/${h.matched_case_id}`)}
            className="mt-1 flex items-center gap-1 text-emerald-400 text-xs hover:text-emerald-300 transition-colors"
          >
            <ExternalLink size={11} />
            {h.matched_case_title}
            {h.matched_case_number && <span className="text-[10px] text-[#5a7a9a]">({h.matched_case_number})</span>}
          </button>
        )}
      </div>
    </div>
  );

  const tabs = [
    { id: 'list' as Tab, label: 'Όλα', count: pinakia.length },
    { id: 'today' as Tab, label: 'Σήμερα', count: todayHearings.filter(h => h.matched_case_id).length },
    { id: 'search' as Tab, label: 'Αναζήτηση' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Πινάκια Δικαστηρίων</h2>
          <p className="page-subtitle">Ανέβασε πινάκια — AI αναγνώριση & matching με υποθέσεις</p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentTabs tabs={tabs} active={tab} onChange={setTab} />
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png"
            onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-gold text-xs flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
          >
            {uploading
              ? <><RefreshCw size={13} className="animate-spin" /> Ανάλυση...</>
              : <><Upload size={13} /> Ανέβασε Πινάκειο</>}
          </button>
        </div>
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
            </div>
          )}
          {!loading && pinakia.length === 0 && (
            <div className="glass-card p-12 text-center">
              <Gavel size={40} className="text-[#3a5a7c] mx-auto mb-3" />
              <p className="text-[#5a7a9a]">Δεν υπάρχουν πινάκια ακόμα.</p>
              <p className="text-xs text-[#3a5a7c] mt-1">Ανέβασε ένα PDF/XLSX/DOCX πινακείου.</p>
            </div>
          )}
          {pinakia.map(p => {
            const isOpen = expanded === p._id;
            const fullData = detail[p._id];
            return (
              <div key={p._id} className="glass-card overflow-hidden table-scroll">
                <div
                  className="p-4 flex items-center gap-3 cursor-pointer hover:bg-[#0d2035]/20 transition-all"
                  onClick={() => toggleExpand(p._id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#d4dce8]">{p.court_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        p.hearing_date === today
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-[#1a3a5c]/40 text-[#5a7a9a]'
                      }`}>
                        📅 {fmtDate(p.hearing_date)}
                      </span>
                      {p.source === 'telegram' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Telegram</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[#5a7a9a]">{p.hearing_count} υποθέσεις</span>
                      {p.match_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle size={11} /> {p.match_count} match{p.match_count > 1 ? 'es' : ''}
                        </span>
                      )}
                      <span className="text-[10px] text-[#3a5a7c]">
                        {parseTs(p.uploaded_at)?.toLocaleDateString('el-GR') ?? '—'} • {p.uploaded_by}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDelete(p._id, e)}
                      disabled={deleting === p._id}
                      className="p-1.5 rounded-lg text-[#4a6a8a] hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      {deleting === p._id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                    {isOpen ? <ChevronDown size={16} className="text-[#5a7a9a]" /> : <ChevronRight size={16} className="text-[#5a7a9a]" />}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-[#1a3a5c]/30 p-4 space-y-2">
                    {!fullData && (
                      <div className="flex justify-center py-4">
                        <div className="w-5 h-5 rounded border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" />
                      </div>
                    )}
                    {fullData && (
                      <>
                        {fullData.match_count > 0 && (
                          <div className="mb-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                            <p className="text-xs font-semibold text-emerald-400 mb-2">
                              ✅ {fullData.match_count} Matches με ανοιχτές υποθέσεις
                            </p>
                            <div className="space-y-1.5">
                              {(fullData.hearings || [])
                                .filter(h => h.matched_case_id)
                                .map((h, i) => (
                                  <HearingRow key={i} h={h} />
                                ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-[#5a7a9a] font-medium mb-2">
                          Όλες οι υποθέσεις ({fullData.hearing_count})
                        </p>
                        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                          {(fullData.hearings || []).map((h, i) => (
                            <HearingRow key={i} h={h} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TODAY TAB ── */}
      {tab === 'today' && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-[#C6A75E]" />
              <h3 className="section-title">Δικάσιμοι σήμερα — {fmtDate(today)}</h3>
              <span className="text-xs text-[#5a7a9a]">{todayHearings.length} υποθέσεις</span>
            </div>
            {todayHearings.length === 0 ? (
              <p className="text-sm text-[#5a7a9a] py-6 text-center">Δεν υπάρχουν πινάκια για σήμερα.</p>
            ) : (
              <div className="space-y-1.5">
                {todayHearings.map((h, i) => (
                  <HearingRow key={i} h={h} showCourt courtName={h.court_name} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Αναζήτηση ονόματος ή αριθμού υπόθεσης..."
                  className="input-field pl-9 w-full text-sm"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || searchQ.trim().length < 2}
                className="btn-gold text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {searching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                Αναζήτηση
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="glass-card p-4">
              <p className="text-xs text-[#5a7a9a] mb-3">{searchResults.length} αποτελέσματα</p>
              <div className="space-y-1.5">
                {searchResults.map((h, i) => (
                  <HearingRow key={i} h={h} showCourt courtName={h.court_name} hearingDate={h.hearing_date} />
                ))}
              </div>
            </div>
          )}

          {searching === false && searchQ && searchResults.length === 0 && (
            <div className="glass-card p-8 text-center">
              <AlertCircle size={32} className="text-[#3a5a7c] mx-auto mb-2" />
              <p className="text-sm text-[#5a7a9a]">Δεν βρέθηκαν αποτελέσματα για «{searchQ}»</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
