import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Printer, Calculator,
  Calendar, Clock, Scale, AlertTriangle, Info, Loader2,
} from 'lucide-react';
import { deadlinesApi, casesApi, hearingsApi, calendarApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Holiday  { date: string; name: string }
interface Vacation { start: string; end: string; name: string; type: string }

interface CalEvent {
  id: string; date: string; title: string;
  type: 'hearing' | 'deadline'; caseTitle?: string; data: any;
}

type View = 'month' | 'calculator' | 'print';

const MONTH_EL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
                  'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const DAY_EL   = ['Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ','Κυρ'];
const DAY_FULL = ['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο','Κυριακή'];

const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const todayYMD = toYMD(new Date());

// ── Helpers ───────────────────────────────────────────────────────────────────

function calDays(year: number, month: number): (Date | null)[] {
  // month 0-based
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekOf(d: Date): Date[] {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}

function isInVacation(ymd: string, vacations: Vacation[]) {
  return vacations.some(v => v.start <= ymd && ymd <= v.end);
}

// ── CalendarPage ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const perms = usePermissions();
  const printRef = useRef<HTMLDivElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const today = new Date();
  const [view, setView]         = useState<View>('month');
  const [year, setYear]         = useState(today.getFullYear());
  const [month, setMonth]       = useState(today.getMonth());
  const [selected, setSelected] = useState<string>(todayYMD);
  const [printDate, setPrintDate] = useState<string>(todayYMD);

  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [hearings,  setHearings]  = useState<any[]>([]);
  const [cases,     setCases]     = useState<any[]>([]);
  const [holidays,  setHolidays]  = useState<Holiday[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', due_date: selected, case_id: '', type: 'deadline' });

  // Deadline calculator
  const [dlTypes,    setDlTypes]    = useState<Record<string, any[]>>({});
  const [calcLaw,    setCalcLaw]    = useState('ΚΠολΔ');
  const [calcType,   setCalcType]   = useState('');
  const [calcStart,  setCalcStart]  = useState(todayYMD);
  const [calcNotes,  setCalcNotes]  = useState('');
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading,setCalcLoading]= useState(false);

  // Print week
  const [weekData, setWeekData] = useState<any>(null);
  const [weekLoading, setWeekLoading] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      deadlinesApi.list().catch(() => ({ data: [] })),
      hearingsApi.list().catch(() => ({ data: [] })),
      casesApi.list().catch(() => ({ data: [] })),
      calendarApi.holidays(year).catch(() => ({ data: { holidays: [] } })),
      calendarApi.vacations(year).catch(() => ({ data: { vacations: [] } })),
      // Also load adjacent year for Dec/Jan display
      calendarApi.holidays(year + 1).catch(() => ({ data: { holidays: [] } })),
      calendarApi.vacations(year + 1).catch(() => ({ data: { vacations: [] } })),
      calendarApi.deadlineTypes().catch(() => ({ data: {} })),
    ]).then(([d, h, c, hols, vac, hols2, vac2, types]) => {
      setDeadlines(Array.isArray(d.data) ? d.data : []);
      setHearings(Array.isArray(h.data) ? h.data : []);
      setCases(Array.isArray(c.data) ? c.data : []);
      setHolidays([...(hols.data.holidays || []), ...(hols2.data.holidays || [])]);
      setVacations([...(vac.data.vacations || []), ...(vac2.data.vacations || [])]);
      setDlTypes(types.data || {});
      setLoading(false);
    });
  }, [year]);

  // When law code changes reset type
  useEffect(() => {
    const first = dlTypes[calcLaw]?.[0];
    setCalcType(first?.id || '');
  }, [calcLaw, dlTypes]);

  // ── Build event map ───────────────────────────────────────────────────────
  const caseMap = useMemo(() => {
    const m: Record<string, string> = {};
    cases.forEach((c: any) => { m[c._id || c.id] = c.title || c.offense || '—'; });
    return m;
  }, [cases]);

  const eventMap = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const add = (e: CalEvent) => { (map[e.date] = map[e.date] || []).push(e); };

    deadlines.forEach((d: any) => {
      const raw = d.due_date || (d.date ? String(d.date).slice(0, 10) : null);
      if (!raw) return;
      const ymd = raw.slice(0, 10);
      add({ id: d._id || d.id, date: ymd, title: d.title || d.description || '—',
            type: 'deadline', caseTitle: caseMap[d.case_id] || d.case_title, data: d });
    });

    hearings.forEach((h: any) => {
      const raw = h.hearing_date ? String(h.hearing_date).slice(0, 10) : null;
      if (!raw) return;
      const ymd = raw.slice(0, 10);
      add({ id: h._id || h.id, date: ymd, title: h.court || 'Δικάσιμος',
            type: 'hearing', caseTitle: caseMap[h.case_id] || h.case_title, data: h });
    });

    return map;
  }, [deadlines, hearings, caseMap]);

  const holidayMap = useMemo(() => {
    const m: Record<string, string> = {};
    holidays.forEach(h => { m[h.date] = h.name; });
    return m;
  }, [holidays]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(todayYMD); };

  // ── Add deadline ─────────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await deadlinesApi.create(addForm);
      toast.success('Η προθεσμία αποθηκεύτηκε');
      setShowAdd(false);
      // refresh
      deadlinesApi.list().then(r => setDeadlines(Array.isArray(r.data) ? r.data : []));
    } catch { toast.error('Σφάλμα αποθήκευσης'); }
  };

  // ── Calculate deadline ────────────────────────────────────────────────────
  const handleCalculate = async () => {
    if (!calcType) return;
    setCalcLoading(true); setCalcResult(null);
    try {
      const r = await calendarApi.calculate({ start_date: calcStart, law_code: calcLaw, deadline_type_id: calcType, notes: calcNotes });
      setCalcResult(r.data);
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Σφάλμα υπολογισμού'); }
    finally { setCalcLoading(false); }
  };

  // ── Load week for print ────────────────────────────────────────────────────
  const loadWeek = async (d: string) => {
    setWeekLoading(true);
    try {
      const r = await calendarApi.week(d);
      setWeekData(r.data);
    } catch { toast.error('Σφάλμα φόρτωσης εβδομάδας'); }
    finally { setWeekLoading(false); }
  };

  useEffect(() => { if (view === 'print') loadWeek(printDate); }, [view, printDate]);

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────────────────────
  const cells = calDays(year, month);
  const selectedEvents = eventMap[selected] || [];

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 size={28} className="text-[#C6A75E] animate-spin" />
    </div>
  );

  return (
    <>
      {/* ── Print stylesheet injected inline ──────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #week-print-area, #week-print-area * { visibility: visible !important; }
          #week-print-area { position: fixed; inset: 0; background: white; padding: 24px; }
        }
      `}</style>

      <div className="space-y-4">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="page-title">Ημερολόγιο & Προθεσμίες</h2>
            <p className="page-subtitle">
              {deadlines.length} προθεσμίες · {hearings.length} δικάσιμοι
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View tabs */}
            {([
              ['month',      <Calendar size={14}/>,     'Ημερολόγιο'],
              ['calculator', <Calculator size={14}/>,   'Υπολογιστής'],
              ['print',      <Printer size={14}/>,      'Εβδομαδιαία'],
            ] as [View, React.ReactNode, string][]).map(([v, icon, lbl]) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                  ${view === v ? 'bg-[#C6A75E] text-[#071220]' : 'bg-[#0d2035] text-[#8aa0b8] hover:text-[#C6A75E] border border-[#1a3a5c]/40'}`}>
                {icon} {lbl}
              </button>
            ))}
            {view === 'month' && perms.canCreate('calendar' as any) && (
              <button onClick={() => { setAddForm(f => ({ ...f, due_date: selected })); setShowAdd(true); }}
                className="btn-gold text-xs flex items-center gap-1.5">
                <Plus size={14}/> Νέα
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════ MONTH VIEW ════════════════════════════════════ */}
        {view === 'month' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            {/* Calendar grid */}
            <div className="glass-card overflow-hidden table-scroll">
              {/* Month nav */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a3a5c]/40">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#132B45] text-[#8aa0b8] hover:text-white cursor-pointer"><ChevronLeft size={16}/></button>
                <div className="flex items-center gap-3">
                  <button onClick={goToday} className="text-[10px] text-[#5a7a9a] hover:text-[#C6A75E] transition-colors cursor-pointer">Σήμερα</button>
                  <span className="text-sm font-bold text-white">{MONTH_EL[month]} {year}</span>
                </div>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#132B45] text-[#8aa0b8] hover:text-white cursor-pointer"><ChevronRight size={16}/></button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-[#1a3a5c]/40">
                {DAY_EL.map(d => (
                  <div key={d} className="py-2 text-center text-[10px] font-semibold text-[#5a7a9a] tracking-wider uppercase">{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className="grid grid-cols-7">
                {cells.map((cell, i) => {
                  if (!cell) return <div key={i} className="border-r border-b border-[#1a3a5c]/20 min-h-[72px]" />;
                  const ymd = toYMD(cell);
                  const isToday = ymd === todayYMD;
                  const isSelected = ymd === selected;
                  const isHoliday = !!holidayMap[ymd];
                  const inVac = isInVacation(ymd, vacations);
                  const events = eventMap[ymd] || [];
                  const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;

                  return (
                    <div key={i}
                      onClick={() => setSelected(ymd)}
                      className={`border-r border-b border-[#1a3a5c]/20 min-h-[72px] p-1.5 cursor-pointer transition-colors
                        ${isSelected ? 'bg-[#C6A75E]/10 border-[#C6A75E]/30' : 'hover:bg-[#0d2035]/60'}
                        ${inVac && !isSelected ? 'bg-[#1a0d0d]/40' : ''}
                        ${isWeekend && !inVac && !isSelected ? 'bg-[#0a1825]/60' : ''}`}>
                      {/* Date number */}
                      <div className="flex items-start justify-between mb-1">
                        <span className={`text-xs leading-none font-medium rounded-full w-6 h-6 flex items-center justify-center
                          ${isToday ? 'bg-[#C6A75E] text-[#071220] font-bold' : isHoliday ? 'text-amber-400' : isWeekend ? 'text-[#4a6a8a]' : 'text-[#8aa0b8]'}`}>
                          {cell.getDate()}
                        </span>
                        {inVac && <span className="text-[8px] text-red-400/70 leading-none">διακ.</span>}
                      </div>
                      {/* Holiday label */}
                      {isHoliday && (
                        <div className="text-[8px] text-amber-400/80 leading-tight truncate mb-0.5">{holidayMap[ymd]}</div>
                      )}
                      {/* Events */}
                      <div className="space-y-0.5">
                        {events.slice(0, 3).map(ev => (
                          <div key={ev.id} className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium
                            ${ev.type === 'hearing' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {ev.title}
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div className="text-[9px] text-[#5a7a9a] pl-1">+{events.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="px-4 py-2.5 border-t border-[#1a3a5c]/40 flex flex-wrap gap-4 text-[10px] text-[#5a7a9a]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30"/><span>Δικάσιμος</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/30"/><span>Προθεσμία</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400/20 border border-amber-400/40"/><span>Αργία</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1a0d0d]/60"/><span>Δικαστικές Διακοπές</span></span>
              </div>
            </div>

            {/* Day detail panel */}
            <div className="space-y-4">
              <div className="glass-card p-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Clock size={14} className="text-[#C6A75E]"/>
                  {new Date(selected + 'T12:00:00').toLocaleDateString('el-GR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                </h3>
                {holidayMap[selected] && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                    <Info size={12}/>{holidayMap[selected]}
                  </div>
                )}
                {isInVacation(selected, vacations) && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle size={12}/>
                    {vacations.find(v => v.start <= selected && selected <= v.end)?.name}
                  </div>
                )}
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-[#4a6a8a] text-center py-4">Δεν υπάρχουν εγγραφές</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map(ev => (
                      <div key={ev.id} className={`rounded-xl p-3 border ${ev.type === 'hearing' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ev.type === 'hearing' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {ev.type === 'hearing' ? 'Δικάσιμος' : 'Προθεσμία'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white mt-1.5">{ev.title}</p>
                        {ev.caseTitle && <p className="text-xs text-[#6a8aaa] mt-0.5">{ev.caseTitle}</p>}
                        {ev.type === 'hearing' && ev.data?.court && <p className="text-xs text-[#5a7a9a] mt-0.5">{ev.data.court}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming 7 days */}
              <div className="glass-card p-4">
                <h3 className="text-xs font-bold text-[#8aa0b8] uppercase tracking-wider mb-3">Επόμενες 7 ημέρες</h3>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() + i + 1);
                  const ymd = toYMD(d);
                  const evs = eventMap[ymd] || [];
                  if (evs.length === 0) return null;
                  return (
                    <div key={ymd} className="mb-2 cursor-pointer" onClick={() => { setSelected(ymd); setYear(d.getFullYear()); setMonth(d.getMonth()); }}>
                      <div className="text-[10px] text-[#5a7a9a] mb-1">{d.toLocaleDateString('el-GR', { weekday:'short', day:'numeric', month:'short' })}</div>
                      {evs.map(ev => (
                        <div key={ev.id} className={`text-xs px-2 py-1 rounded mb-0.5 truncate ${ev.type === 'hearing' ? 'text-blue-300' : 'text-amber-300'}`}>
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ DEADLINE CALCULATOR ══════════════════════════ */}
        {view === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Form */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#1a3a5c]/40">
                <Scale size={16} className="text-[#C6A75E]"/>
                <h3 className="text-sm font-bold text-white">Υπολογισμός Προθεσμίας</h3>
              </div>

              <div>
                <label className="label">Κώδικας Νόμου</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.keys(dlTypes).map(code => (
                    <button key={code} onClick={() => setCalcLaw(code)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer
                        ${calcLaw === code ? 'bg-[#C6A75E] text-[#071220] border-[#C6A75E]' : 'bg-[#0d2035] text-[#8aa0b8] border-[#1a3a5c]/40 hover:border-[#C6A75E]/40'}`}>
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Τύπος Προθεσμίας</label>
                <select value={calcType} onChange={e => setCalcType(e.target.value)} className="input-dark mt-1">
                  {(dlTypes[calcLaw] || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                {calcType && dlTypes[calcLaw] && (
                  <p className="text-[11px] text-[#5a7a9a] mt-1.5 leading-relaxed">
                    {dlTypes[calcLaw].find((t: any) => t.id === calcType)?.note}
                  </p>
                )}
              </div>

              <div>
                <label className="label">Ημ/νία Έναρξης Προθεσμίας</label>
                <p className="text-[10px] text-[#4a6a8a] mb-1">Ημερομηνία γεγονότος (επίδοσης, δημοσίευσης κλπ). Η μέτρηση αρχίζει από την επομένη (ΚΠολΔ 144).</p>
                <input type="date" value={calcStart} onChange={e => setCalcStart(e.target.value)} className="input-dark" />
              </div>

              <div>
                <label className="label">Σημειώσεις <span className="text-[#4a6a8a] font-normal">(προαιρετικό)</span></label>
                <input value={calcNotes} onChange={e => setCalcNotes(e.target.value)} className="input-dark" placeholder="π.χ. Επίδοση αγωγής 15/5/2026" />
              </div>

              <button onClick={handleCalculate} disabled={!calcType || calcLoading}
                className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40">
                {calcLoading ? <Loader2 size={14} className="animate-spin"/> : <Calculator size={14}/>}
                Υπολογισμός
              </button>
            </div>

            {/* Result */}
            <div className="glass-card p-6">
              {!calcResult ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#0d2035] border border-[#1a3a5c]/40 flex items-center justify-center">
                    <Calculator size={24} className="text-[#3a5a7a]"/>
                  </div>
                  <p className="text-sm text-[#5a7a9a]">Συμπληρώστε τη φόρμα και πατήστε <strong className="text-[#8aa0b8]">Υπολογισμός</strong></p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-[#1a3a5c]/40">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"/>
                    <h3 className="text-sm font-bold text-white">Αποτέλεσμα</h3>
                  </div>

                  {/* Main result */}
                  <div className="rounded-2xl bg-[#C6A75E]/10 border border-[#C6A75E]/30 p-5 text-center">
                    <p className="text-xs text-[#C6A75E] font-semibold uppercase tracking-wider mb-2">Λήξη Προθεσμίας</p>
                    <p className="text-3xl font-bold text-white mb-1">
                      {new Date(calcResult.deadline_date + 'T12:00:00').toLocaleDateString('el-GR', { day:'numeric', month:'long', year:'numeric' })}
                    </p>
                    <p className="text-xs text-[#8aa0b8]">
                      {new Date(calcResult.deadline_date + 'T12:00:00').toLocaleDateString('el-GR', { weekday: 'long' })}
                    </p>
                    {calcResult.extended_due_to_holiday && (
                      <p className="text-xs text-amber-400 mt-2">
                        ↑ Παρατάθηκε από {new Date(calcResult.original_date + 'T12:00:00').toLocaleDateString('el-GR')} (αργία/Σ/Κ) — ΚΠολΔ 145
                      </p>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-xs">
                    {[
                      ['Τύπος', calcResult.deadline_type],
                      ['Έναρξη', new Date(calcResult.start_date + 'T12:00:00').toLocaleDateString('el-GR')],
                      ['Ονομαστικές ημέρες', `${calcResult.nominal_days} ημέρες`],
                      ['Ημέρες αναστολής', calcResult.suspended_days > 0 ? `${calcResult.suspended_days} ημέρες (διακοπές δικαστηρίων)` : '—'],
                      ['Σύνολο ημ. (ημερολόγιο)', `${calcResult.total_calendar_days} ημέρες`],
                      ['Αναστολή κατά διακοπές', calcResult.suspended_during_recesses ? 'ΝΑΙ (ΚΠολΔ 147)' : 'ΌΧΙ'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-[#1a3a5c]/20">
                        <span className="text-[#5a7a9a]">{k}</span>
                        <span className="text-[#c8d8e8] font-medium text-right">{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  <div className="rounded-xl bg-[#0d2035] border border-[#1a3a5c]/40 p-3 text-xs text-[#6a8aaa] leading-relaxed">
                    <p className="font-semibold text-[#8aa0b8] mb-1">Νομική Σημείωση</p>
                    {calcResult.legal_note}
                  </div>

                  {calcResult.overlapping_vacations?.length > 0 && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
                      <strong>Επικαλυπτόμενες διακοπές:</strong>{' '}
                      {calcResult.overlapping_vacations.join(', ')}
                    </div>
                  )}

                  {calcNotes && (
                    <p className="text-xs text-[#5a7a9a] italic">{calcNotes}</p>
                  )}

                  {/* Save as deadline */}
                  <button
                    onClick={() => {
                      setAddForm({ title: `${calcResult.deadline_type} (${calcResult.deadline_date})`, due_date: calcResult.deadline_date, case_id: '', type: 'deadline' });
                      setShowAdd(true);
                    }}
                    className="btn-dark w-full text-xs flex items-center justify-center gap-2 mt-2">
                    <Plus size={12}/> Αποθήκευση ως Προθεσμία
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════ WEEKLY PRINT VIEW ════════════════════════════ */}
        {view === 'print' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="glass-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#8aa0b8] font-medium">Εβδομάδα που περιλαμβάνει:</label>
                <input type="date" value={printDate} onChange={e => { setPrintDate(e.target.value); }} className="input-dark text-xs py-1.5 w-40" />
              </div>
              <button onClick={() => loadWeek(printDate)} className="btn-dark text-xs flex items-center gap-1.5">
                <ChevronRight size={12}/> Φόρτωση
              </button>
              <button onClick={handlePrint} className="btn-gold text-xs flex items-center gap-1.5 ml-auto">
                <Printer size={14}/> Εκτύπωση / PDF
              </button>
            </div>

            {weekLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={24} className="text-[#C6A75E] animate-spin"/></div>
            ) : weekData ? (
              <WeekPrintView data={weekData} caseMap={caseMap} />
            ) : (
              <div className="text-center py-16 text-[#5a7a9a] text-sm">Επιλέξτε εβδομάδα και πατήστε Φόρτωση</div>
            )}
          </div>
        )}
      </div>

      {/* ── Add deadline modal ───────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card w-full max-w-lg border border-[#1a3a5c]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[#1a3a5c]/40 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Νέα Προθεσμία</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-[#132B45] text-[#7a9ab8] cursor-pointer"><X size={16}/></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div>
                <label className="label">Τίτλος</label>
                <input value={addForm.title} onChange={e => setAddForm(f => ({...f, title: e.target.value}))} className="input-dark" required placeholder="π.χ. Έφεση κατά απόφασης 142/2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ημ/νία Λήξης</label>
                  <input type="date" value={addForm.due_date} onChange={e => setAddForm(f => ({...f, due_date: e.target.value}))} className="input-dark" required />
                </div>
                <div>
                  <label className="label">Υπόθεση</label>
                  <select value={addForm.case_id} onChange={e => setAddForm(f => ({...f, case_id: e.target.value}))} className="input-dark">
                    <option value="">—</option>
                    {cases.map((c: any) => <option key={c._id||c.id} value={c._id||c.id}>{c.title || c.offense}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn-gold flex-1">Αποθήκευση</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-dark flex-1">Ακύρωση</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── WeekPrintView component ───────────────────────────────────────────────────

function WeekPrintView({ data, caseMap }: { data: any; caseMap: Record<string, string> }) {
  const monday = new Date(data.week_start + 'T12:00:00');
  const days = weekOf(monday);

  const holMap: Record<string, string> = {};
  (data.holidays || []).forEach((h: Holiday) => { holMap[h.date] = h.name; });

  const hearingsByDay: Record<string, any[]> = {};
  const deadlinesByDay: Record<string, any[]> = {};

  (data.hearings || []).forEach((h: any) => {
    const d = h.day || h.hearing_date?.slice(0, 10);
    if (d) (hearingsByDay[d] = hearingsByDay[d] || []).push(h);
  });
  (data.deadlines || []).forEach((d: any) => {
    const dd = d.day || d.due_date?.slice(0, 10);
    if (dd) (deadlinesByDay[dd] = deadlinesByDay[dd] || []).push(d);
  });

  const totalHearings = data.hearings?.length || 0;
  const totalDeadlines = data.deadlines?.length || 0;

  return (
    <>
      {/* Screen preview */}
      <div className="glass-card overflow-hidden table-scroll">
        <div className="p-4 border-b border-[#1a3a5c]/40 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Εβδομάδα {monday.toLocaleDateString('el-GR', { day:'numeric', month:'long' })} — {days[6].toLocaleDateString('el-GR', { day:'numeric', month:'long', year:'numeric' })}
          </h3>
          <div className="flex gap-3 text-xs text-[#6a8aaa]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/>  {totalHearings} δικάσιμοι</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>{totalDeadlines} προθεσμίες</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-[#1a3a5c]/30">
          {days.map((day) => {
            const ymd = toYMD(day);
            const isToday = ymd === todayYMD;
            const hols = holMap[ymd];
            const inVac = data.vacations?.some((v: Vacation) => v.start <= ymd && ymd <= v.end);
            const hs = hearingsByDay[ymd] || [];
            const ds = deadlinesByDay[ymd] || [];
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div key={ymd} className={`p-3 min-h-[120px] ${isWeekend ? 'bg-[#0a1825]/40' : ''} ${inVac ? 'bg-[#1a0d0d]/30' : ''}`}>
                <div className={`text-xs font-bold mb-1 ${isToday ? 'text-[#C6A75E]' : isWeekend ? 'text-[#4a6a8a]' : 'text-[#8aa0b8]'}`}>
                  {DAY_FULL[days.indexOf(day)]}
                  <span className={`ml-1 text-[10px] font-normal ${isToday ? 'text-[#C6A75E]' : 'text-[#5a7a9a]'}`}>
                    {day.getDate()}/{day.getMonth()+1}
                  </span>
                </div>
                {hols && <div className="text-[9px] text-amber-400/80 mb-1 truncate">{hols}</div>}
                {inVac && <div className="text-[9px] text-red-400/60 mb-1">Διακοπές</div>}
                <div className="space-y-1">
                  {hs.map((h: any) => (
                    <div key={h._id} className="rounded p-1.5 bg-blue-500/15 border border-blue-500/20 text-[10px]">
                      <div className="font-medium text-blue-200 truncate">{h.court || '—'}</div>
                      <div className="text-blue-300/70 truncate">{h.case_title || caseMap[h.case_id] || ''}</div>
                    </div>
                  ))}
                  {ds.map((d: any) => (
                    <div key={d._id} className="rounded p-1.5 bg-amber-500/15 border border-amber-500/20 text-[10px]">
                      <div className="font-medium text-amber-200 truncate">{d.title || d.description || '—'}</div>
                      <div className="text-amber-300/70 truncate">{d.case_title || caseMap[d.case_id] || ''}</div>
                    </div>
                  ))}
                  {hs.length === 0 && ds.length === 0 && !hols && (
                    <p className="text-[9px] text-[#2a4a6a]">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Print area (hidden on screen, shown on print) ── */}
      <div id="week-print-area" style={{ display: 'none' }}>
        <PrintableWeek data={data} days={days} hearingsByDay={hearingsByDay} deadlinesByDay={deadlinesByDay} holMap={holMap} caseMap={caseMap} />
      </div>
    </>
  );
}

// ── PrintableWeek — pure HTML for @media print ────────────────────────────────

function PrintableWeek({ data, days, hearingsByDay, deadlinesByDay, holMap, caseMap }: {
  data: any; days: Date[];
  hearingsByDay: Record<string, any[]>; deadlinesByDay: Record<string, any[]>;
  holMap: Record<string, string>; caseMap: Record<string, string>;
}) {
  const monday = days[0];
  const sunday = days[6];

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#fff', color: '#1a1a2e', padding: '24px 32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #C6A75E', paddingBottom: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>NOMOS ONE</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Διαχείριση Νομικών Υποθέσεων</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Εβδομαδιαίο Πρόγραμμα</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
            {monday.toLocaleDateString('el-GR', { day:'numeric', month:'long' })} — {sunday.toLocaleDateString('el-GR', { day:'numeric', month:'long', year:'numeric' })}
          </div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
            Εκτύπωση: {new Date().toLocaleDateString('el-GR')}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        {[
          [`${data.hearings?.length || 0}`, 'Δικάσιμοι', '#2563eb'],
          [`${data.deadlines?.length || 0}`, 'Προθεσμίες', '#d97706'],
        ].map(([n, l, c]) => (
          <div key={l} style={{ background: '#f8f9fa', border: `2px solid ${c}`, borderRadius: 8, padding: '8px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c as string }}>{n}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Day columns */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#1a1a2e', color: '#C6A75E' }}>
            {days.map(d => (
              <th key={toYMD(d)} style={{ border: '1px solid #ddd', padding: '6px 4px', textAlign: 'center', width: '14.28%' }}>
                <div style={{ fontWeight: 700 }}>{DAY_FULL[days.indexOf(d)]}</div>
                <div style={{ fontWeight: 400, fontSize: 10, color: '#aaa' }}>{d.getDate()}/{d.getMonth()+1}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ verticalAlign: 'top' }}>
            {days.map(d => {
              const ymd = toYMD(d);
              const hol = holMap[ymd];
              const inVac = data.vacations?.some((v: Vacation) => v.start <= ymd && ymd <= v.end);
              const hs = hearingsByDay[ymd] || [];
              const ds = deadlinesByDay[ymd] || [];
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

              return (
                <td key={ymd} style={{ border: '1px solid #ddd', padding: '6px 4px', background: isWeekend ? '#f5f5f5' : inVac ? '#fff8f0' : '#fff', minHeight: 100 }}>
                  {hol && <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '2px 4px', marginBottom: 4, fontSize: 9, color: '#92400e' }}>{hol}</div>}
                  {inVac && <div style={{ background: '#fee2e2', border: '1px solid #f87171', borderRadius: 4, padding: '2px 4px', marginBottom: 4, fontSize: 9, color: '#991b1b' }}>Δικ. Διακοπές</div>}
                  {hs.map((h: any) => (
                    <div key={h._id} style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '4px 6px', marginBottom: 4, fontSize: 10 }}>
                      <div style={{ fontWeight: 700, color: '#1e40af' }}>⚖ {h.court || 'Δικάσιμος'}</div>
                      <div style={{ color: '#374151', marginTop: 1 }}>{h.case_title || caseMap[h.case_id] || ''}</div>
                      {h.notes && <div style={{ color: '#6b7280', fontSize: 9, marginTop: 1 }}>{h.notes}</div>}
                    </div>
                  ))}
                  {ds.map((d2: any) => (
                    <div key={d2._id} style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '4px 6px', marginBottom: 4, fontSize: 10 }}>
                      <div style={{ fontWeight: 700, color: '#92400e' }}>⏰ {d2.title || d2.description || 'Προθεσμία'}</div>
                      <div style={{ color: '#374151', marginTop: 1 }}>{d2.case_title || caseMap[d2.case_id] || ''}</div>
                    </div>
                  ))}
                  {hs.length === 0 && ds.length === 0 && !hol && (
                    <div style={{ color: '#d1d5db', fontSize: 10, paddingTop: 8, textAlign: 'center' }}>—</div>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #ddd', fontSize: 9, color: '#999', textAlign: 'center' }}>
        Nomos One · Εβδομαδιαίο Πρόγραμμα · Παραχθηκε αυτόματα · Σελίδα 1/1
      </div>
    </div>
  );
}
