import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  Plus, Trash2, Loader2, ArrowLeft, ExternalLink,
} from 'lucide-react';
import { intakeApi } from '@/lib/api';
import { toast } from 'sonner';

type DocTypeOption = 'auto'|'id'|'summons'|'contract'|'indictment';
type Confidence = 'high'|'medium'|'low';

interface DeadlineItem { title: string; due_date: string; type: string; }

interface AnalysisResult {
  document_type: string;
  confidence: Confidence;
  summary: string;
  key_facts: string[];
  client: {
    full_name: string|null; father_name: string|null; afm: string|null;
    id_number: string|null; birth_date: string|null; address: string|null;
    phone: string|null; email: string|null; nationality: string|null;
    client_type: string|null;
  };
  case: {
    title: string|null; category: string|null; court: string|null;
    case_number: string|null; opposing_party: string|null; summary: string|null;
  };
  deadlines: DeadlineItem[];
  missing_fields: string[];
  extracted_fields: string[];
}

interface ConfirmResult {
  client?: { full_name?: string; id?: string; existing?: boolean };
  case?: { case_number?: string; id?: string; title?: string };
  deadlines?: any[];
  drive?: { folder_link?: string };
}

const fileToB64 = (f: File): Promise<string> =>
  new Promise(r => { const fr = new FileReader(); fr.onload = () => r((fr.result as string).split(',')[1]); fr.readAsDataURL(f); });

const DOC_TYPES: { value: DocTypeOption; label: string }[] = [
  { value: 'auto',        label: 'Αυτόματη Ανίχνευση' },
  { value: 'id',          label: 'Ταυτότητα / Διαβατήριο' },
  { value: 'summons',     label: 'Κλήση / Αγωγή' },
  { value: 'contract',    label: 'Συμβόλαιο / Συμφωνητικό' },
  { value: 'indictment',  label: 'Κατηγορητήριο / Δικογραφία' },
];

const CLIENT_FIELDS: { key: keyof AnalysisResult['client']; label: string; type?: 'select'; opts?: {v:string;l:string}[] }[] = [
  { key: 'full_name',    label: 'Ονοματεπώνυμο' },
  { key: 'father_name',  label: 'Πατρώνυμο' },
  { key: 'afm',          label: 'ΑΦΜ' },
  { key: 'id_number',    label: 'Αριθμός Ταυτότητας' },
  { key: 'birth_date',   label: 'Ημ/νία Γέννησης' },
  { key: 'address',      label: 'Διεύθυνση' },
  { key: 'phone',        label: 'Τηλέφωνο' },
  { key: 'email',        label: 'Email' },
  { key: 'nationality',  label: 'Εθνικότητα' },
  { key: 'client_type',  label: 'Τύπος', type: 'select', opts: [
    {v:'individual',l:'Φυσικό Πρόσωπο'},{v:'company',l:'Εταιρεία'},
    {v:'public',l:'Δημόσιο'},{v:'professional',l:'Επαγγελματίας'},
  ]},
];

const CASE_FIELDS: { key: keyof Omit<AnalysisResult['case'],'summary'>; label: string; type?: 'select'; opts?: {v:string;l:string}[] }[] = [
  { key: 'title',          label: 'Τίτλος Υπόθεσης' },
  { key: 'category',       label: 'Κατηγορία', type: 'select', opts: [
    {v:'ποινικό',l:'Ποινικό'},{v:'αστικό',l:'Αστικό'},{v:'διοικητικό',l:'Διοικητικό'},
    {v:'εμπορικό',l:'Εμπορικό'},{v:'εργατικό',l:'Εργατικό'},{v:'οικογενειακό',l:'Οικογενειακό'},
    {v:'ακίνητα',l:'Ακίνητα'},{v:'φορολογικό',l:'Φορολογικό'},
  ]},
  { key: 'court',          label: 'Δικαστήριο' },
  { key: 'case_number',    label: 'Αριθμός Υπόθεσης' },
  { key: 'opposing_party', label: 'Αντίδικος' },
];

const inp = 'w-full rounded-md px-3 py-1.5 text-sm bg-[#0a1929] border border-[#1e3a5f] text-[#d4dce8] placeholder-[#4a6080] focus:outline-none focus:border-[#4a9eda] transition-colors';
const sel = inp + ' appearance-none';
const lbl = 'block text-xs font-medium text-[#7a9bbf] mb-1';
const sec = 'text-xs font-semibold uppercase tracking-widest text-[#4a9eda] mb-3';

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step }: { step: 1|2|3 }) {
  const steps = [{n:1,label:'Μεταφόρτωση'},{n:2,label:'Επισκόπηση'},{n:3,label:'Ολοκλήρωση'}];
  return (
    <div className="flex items-center mb-8">
      {steps.map((s,i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
              ${step>s.n?'bg-emerald-600 border-emerald-500 text-white':step===s.n?'bg-[#4a9eda] border-[#4a9eda] text-white':'bg-[#132B45] border-[#1e3a5f] text-[#4a6080]'}`}>
              {step>s.n?<CheckCircle size={15}/>:s.n}
            </div>
            <span className={`text-xs whitespace-nowrap ${step===s.n?'text-[#4a9eda]':step>s.n?'text-emerald-400':'text-[#4a6080]'}`}>{s.label}</span>
          </div>
          {i<2&&<div className={`h-0.5 w-16 sm:w-24 mx-2 mb-4 ${step>s.n?'bg-emerald-600':'bg-[#1e3a5f]'}`}/>}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onAnalyzed }: { onAnalyzed: (r:AnalysisResult, f:File)=>void }) {
  const [file, setFile] = useState<File|null>(null);
  const [docType, setDocType] = useState<DocTypeOption>('auto');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (f: File) => {
    if (f.size > 20*1024*1024) { toast.error('Μέγιστο μέγεθος 20MB'); return; }
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { toast.error('Αποδεκτά: εικόνες ή PDF'); return; }
    setFile(f);
  };

  const onDrop = useCallback((e:React.DragEvent)=>{ e.preventDefault(); setDragging(false); const f=e.dataTransfer.files[0]; if(f) accept(f); },[]);

  const analyze = async () => {
    if (!file) { toast.error('Επιλέξτε αρχείο'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('document_type', docType);
      const res = await intakeApi.analyze(file);
      onAnalyzed(res.data as AnalysisResult, file);
    } catch(e:any) {
      toast.error(e?.response?.data?.detail || 'Σφάλμα ανάλυσης');
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#d4dce8] mb-1">Νέο Intake Εγγράφου</h1>
        <p className="text-sm text-[#7a9bbf]">Ανεβάστε ένα έγγραφο για αυτόματη ανάλυση και εξαγωγή δεδομένων με AI</p>
      </div>

      <div
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none min-h-[260px]
          ${dragging?'border-[#4a9eda] bg-[#0d2137]':'border-[#1e3a5f] bg-[#0d2137] hover:border-[#4a9eda] hover:bg-[#132B45]'}`}
        onDrop={onDrop} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onClick={()=>!file&&inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e=>{const f=e.target.files?.[0];if(f)accept(f);}}/>
        {file ? (
          <div className="flex flex-col items-center gap-3 p-8">
            <div className="w-16 h-16 rounded-full bg-[#132B45] flex items-center justify-center">
              <FileText size={32} className="text-[#4a9eda]"/>
            </div>
            <p className="text-[#d4dce8] font-medium text-center break-all">{file.name}</p>
            <p className="text-sm text-[#7a9bbf]">{(file.size/1024/1024).toFixed(2)} MB</p>
            <button type="button" className="text-xs text-[#4a9eda] hover:underline"
              onClick={e=>{e.stopPropagation();setFile(null);if(inputRef.current)inputRef.current.value='';}}>
              Αλλαγή αρχείου
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-10">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${dragging?'bg-[#1e3a5f]':'bg-[#132B45]'}`}>
              <Upload size={36} className={dragging?'text-[#4a9eda]':'text-[#4a6080]'}/>
            </div>
            <div className="text-center">
              <p className="text-[#d4dce8] font-medium">Σύρτε αρχείο εδώ ή <span className="text-[#4a9eda] underline">επιλέξτε</span></p>
              <p className="text-sm text-[#7a9bbf] mt-1">PDF, JPG, PNG — έως 20MB</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className={lbl}>Τύπος Εγγράφου</label>
        <select className={sel} value={docType} onChange={e=>setDocType(e.target.value as DocTypeOption)}>
          {DOC_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      <button type="button" onClick={analyze} disabled={loading||!file}
        className="w-full py-3.5 rounded-xl text-base font-semibold transition-all bg-[#4a9eda] hover:bg-[#3a8ec9] text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {loading?<><Loader2 size={20} className="animate-spin"/>Ανάλυση…</>:<><FileText size={20}/>Ανάλυση εγγράφου</>}
      </button>
    </div>
  );
}

// ─── Step 2: Review ────────────────────────────────────────────────────────────
function ReviewStep({ analysis, file, onConfirmed, onBack }:
  { analysis:AnalysisResult; file:File; onConfirmed:(r:ConfirmResult)=>void; onBack:()=>void }) {

  const [client, setClient] = useState({...analysis.client});
  const [caseData, setCaseData] = useState({...analysis.case});
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>(analysis.deadlines.map(d=>({...d})));
  const [summary, setSummary] = useState(analysis.summary||'');
  const [loading, setLoading] = useState(false);

  const ext = (k:string) => analysis.extracted_fields.includes(k);
  const total = analysis.extracted_fields.length + analysis.missing_fields.length;

  const confirm = async () => {
    setLoading(true);
    try {
      const file_b64 = await fileToB64(file);
      const res = await intakeApi.confirm({
        extracted: { ...analysis, client, case: caseData, deadlines, summary },
        file_b64,
        filename: file.name,
        media_type: file.type || 'image/jpeg',
      });
      toast.success('Η υπόθεση καταχωρήθηκε επιτυχώς');
      onConfirmed(res.data as ConfirmResult);
    } catch(e:any) {
      toast.error(e?.response?.data?.detail || 'Σφάλμα καταχώρησης');
    } finally { setLoading(false); }
  };

  const confBadge = {
    high: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
    medium: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
    low: 'bg-red-900/40 text-red-300 border border-red-700',
  }[analysis.confidence];
  const confLabel = { high:'Υψηλή Βεβαιότητα', medium:'Μέτρια Βεβαιότητα', low:'Χαμηλή Βεβαιότητα' }[analysis.confidence];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#7a9bbf] hover:text-[#4a9eda] transition-colors w-fit">
          <ArrowLeft size={16}/>Πίσω
        </button>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${confBadge}`}>{confLabel}</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#132B45] text-[#4a9eda] border border-[#1e3a5f]">{analysis.document_type}</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#132B45] text-[#7a9bbf] border border-[#1e3a5f]">{analysis.extracted_fields.length}/{total} πεδία</span>
        </div>
      </div>

      {/* Client + Case grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-[#0a1929] border border-[#1e3a5f] p-5 flex flex-col gap-4">
          <p className={sec}>Στοιχεία Πελάτη</p>
          {CLIENT_FIELDS.map(f=>(
            <div key={f.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                {ext(f.key)?<CheckCircle size={12} className="text-emerald-400 shrink-0"/>:<AlertTriangle size={12} className="text-yellow-400 shrink-0"/>}
                <label className={lbl+' mb-0'}>{f.label}</label>
              </div>
              {f.type==='select'&&f.opts?(
                <select className={sel} value={client[f.key]||''} onChange={e=>setClient(p=>({...p,[f.key]:e.target.value||null}))}>
                  <option value="">— Επιλέξτε —</option>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ):(
                <input type="text" className={inp} value={client[f.key]||''} placeholder={ext(f.key)?'':'Δεν βρέθηκε'}
                  onChange={e=>setClient(p=>({...p,[f.key]:e.target.value||null}))}/>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-[#0a1929] border border-[#1e3a5f] p-5 flex flex-col gap-4">
          <p className={sec}>Στοιχεία Υπόθεσης</p>
          {CASE_FIELDS.map(f=>(
            <div key={f.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                {ext(f.key)?<CheckCircle size={12} className="text-emerald-400 shrink-0"/>:<AlertTriangle size={12} className="text-yellow-400 shrink-0"/>}
                <label className={lbl+' mb-0'}>{f.label}</label>
              </div>
              {f.type==='select'&&f.opts?(
                <select className={sel} value={(caseData[f.key as keyof typeof caseData] as string)||''} onChange={e=>setCaseData(p=>({...p,[f.key]:e.target.value||null}))}>
                  <option value="">— Επιλέξτε —</option>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ):(
                <input type="text" className={inp} value={(caseData[f.key as keyof typeof caseData] as string)||''} placeholder={ext(f.key)?'':'Δεν βρέθηκε'}
                  onChange={e=>setCaseData(p=>({...p,[f.key]:e.target.value||null}))}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Deadlines */}
      <div className="rounded-xl bg-[#0a1929] border border-[#1e3a5f] p-5">
        <p className={sec}>Προθεσμίες / Δικάσιμοι</p>
        <div className="flex flex-col gap-3">
          {deadlines.length===0&&<p className="text-sm text-[#4a6080] italic">Δεν εντοπίστηκαν προθεσμίες</p>}
          {deadlines.map((d,i)=>(
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end p-3 rounded-lg bg-[#132B45] border border-[#1e3a5f]">
              <div>
                <label className={lbl}>Τίτλος</label>
                <input type="text" className={inp} value={d.title} onChange={e=>setDeadlines(p=>p.map((x,j)=>j===i?{...x,title:e.target.value}:x))}/>
              </div>
              <div>
                <label className={lbl}>Ημερομηνία</label>
                <input type="date" className={inp} value={d.due_date} onChange={e=>setDeadlines(p=>p.map((x,j)=>j===i?{...x,due_date:e.target.value}:x))}/>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className={lbl}>Τύπος</label>
                  <input type="text" className={inp} value={d.type} onChange={e=>setDeadlines(p=>p.map((x,j)=>j===i?{...x,type:e.target.value}:x))}/>
                </div>
                <button type="button" onClick={()=>setDeadlines(p=>p.filter((_,j)=>j!==i))}
                  className="mb-0.5 p-1.5 rounded text-red-400 hover:bg-red-900/30 transition-colors" title="Αφαίρεση">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={()=>setDeadlines(p=>[...p,{title:'',due_date:'',type:''}])}
            className="flex items-center gap-2 text-sm text-[#4a9eda] hover:text-[#3a8ec9] transition-colors w-fit mt-1">
            <Plus size={14}/>Προσθήκη Προθεσμίας
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-[#0a1929] border border-[#1e3a5f] p-5">
        <p className={sec}>Σύνοψη AI</p>
        <textarea className={`${inp} resize-none`} rows={4} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Σύνοψη εγγράφου…"/>
      </div>

      {/* Key facts */}
      {(analysis.key_facts||[]).length>0&&(
        <div className="rounded-xl bg-[#0a1929] border border-[#1e3a5f] p-5">
          <p className={sec}>Βασικά Στοιχεία</p>
          <ul className="flex flex-col gap-2">
            {analysis.key_facts.map((f,i)=>(
              <li key={i} className="flex items-start gap-2 text-sm text-[#d4dce8]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4a9eda] shrink-0 mt-[6px]"/>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing fields */}
      {(analysis.missing_fields||[]).length>0&&(
        <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/40 p-4 flex items-start gap-3">
          <AlertTriangle size={17} className="text-yellow-400 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-semibold text-yellow-300 mb-1">Πεδία που δεν αναγνωρίστηκαν</p>
            <p className="text-sm text-yellow-200/70">{analysis.missing_fields.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button type="button" onClick={onBack} disabled={loading}
          className="sm:w-36 py-3 rounded-xl text-sm font-semibold border border-[#1e3a5f] text-[#7a9bbf] hover:bg-[#132B45] transition-colors disabled:opacity-40">
          Ακύρωση
        </button>
        <button type="button" onClick={confirm} disabled={loading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[#4a9eda] hover:bg-[#3a8ec9] text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
          {loading?<><Loader2 size={17} className="animate-spin"/>Καταχώρηση…</>:<><CheckCircle size={17}/>Καταχώρηση στο Σύστημα</>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Done ──────────────────────────────────────────────────────────────
function DoneStep({ result, onReset }: { result:ConfirmResult; onReset:()=>void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="w-24 h-24 rounded-full bg-emerald-900/40 border border-emerald-600/40 flex items-center justify-center">
        <CheckCircle size={48} className="text-emerald-400"/>
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#d4dce8] mb-2">Επιτυχής Καταχώρηση</h2>
        <p className="text-sm text-[#7a9bbf]">Το έγγραφο αναλύθηκε και η υπόθεση δημιουργήθηκε στο σύστημα</p>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-[#0a1929] border border-[#1e3a5f] p-6 flex flex-col gap-4">
        {result.client?.full_name&&(
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#7a9bbf]">Πελάτης</span>
            <span className="text-sm font-semibold text-[#d4dce8]">
              {result.client.full_name}
              {result.client.existing&&<span className="ml-2 text-xs text-[#7a9bbf]">(υπάρχων)</span>}
            </span>
          </div>
        )}
        {result.case?.case_number&&(
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#7a9bbf]">Αριθμός Υπόθεσης</span>
            <span className="text-sm font-semibold text-[#4a9eda]">{result.case.case_number}</span>
          </div>
        )}
        {result.case?.title&&(
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#7a9bbf]">Τίτλος</span>
            <span className="text-sm text-[#d4dce8] text-right max-w-[55%]">{result.case.title}</span>
          </div>
        )}
        {(result.deadlines||[]).length>0&&(
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#7a9bbf]">Προθεσμίες</span>
            <span className="text-sm font-semibold text-[#d4dce8]">{result.deadlines!.length} καταχωρήθηκαν</span>
          </div>
        )}
        {result.drive?.folder_link&&(
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#7a9bbf]">Google Drive</span>
            <a href={result.drive.folder_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-[#4a9eda] hover:underline">
              Άνοιγμα φακέλου<ExternalLink size={12}/>
            </a>
          </div>
        )}
      </div>

      <button type="button" onClick={onReset}
        className="w-full max-w-md py-3.5 rounded-xl text-base font-semibold bg-[#132B45] hover:bg-[#1e3a5f] text-[#4a9eda] border border-[#1e3a5f] flex items-center justify-center gap-2 transition-colors">
        <Upload size={18}/>Νέο Intake
      </button>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function IntakePage() {
  const [step, setStep] = useState<1|2|3>(1);
  const [analysis, setAnalysis] = useState<AnalysisResult|null>(null);
  const [file, setFile] = useState<File|null>(null);
  const [result, setResult] = useState<ConfirmResult|null>(null);

  return (
    <div className="min-h-screen w-full" style={{backgroundColor:'#0a1929',color:'#d4dce8'}}>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <StepDots step={step}/>
        <div className="rounded-2xl p-6 sm:p-8" style={{backgroundColor:'#0d2137',border:'1px solid #1e3a5f'}}>
          {step===1&&<UploadStep onAnalyzed={(r,f)=>{setAnalysis(r);setFile(f);setStep(2);}}/>}
          {step===2&&analysis&&file&&(
            <ReviewStep analysis={analysis} file={file}
              onConfirmed={r=>{setResult(r);setStep(3);}}
              onBack={()=>setStep(1)}/>
          )}
          {step===3&&result&&(
            <DoneStep result={result} onReset={()=>{setStep(1);setAnalysis(null);setFile(null);setResult(null);}}/>
          )}
        </div>
      </div>
    </div>
  );
}
