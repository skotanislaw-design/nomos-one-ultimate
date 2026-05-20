import { useRef, useState } from 'react';
import { ScanLine, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { aiApi } from '@/lib/api';
import { toast } from 'sonner';

export type ExtractedData = {
  document_type?: string;
  client?: {
    full_name?: string | null;
    father_name?: string | null;
    afm?: string | null;
    id_number?: string | null;
    birth_date?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    nationality?: string | null;
    client_type?: string | null;
  } | null;
  case?: {
    title?: string | null;
    category?: string | null;
    court?: string | null;
    case_number?: string | null;
    opposing_party?: string | null;
    summary?: string | null;
  } | null;
  deadlines?: Array<{
    title?: string | null;
    due_date?: string | null;
    type?: string | null;
  }>;
};

const DOC_TYPES = [
  { value: 'auto',        label: 'Αυτόματη ανίχνευση' },
  { value: 'id',          label: 'Ταυτότητα / Διαβατήριο' },
  { value: 'summons',     label: 'Κλήση / Αγωγή' },
  { value: 'contract',    label: 'Συμβόλαιο / Συμφωνητικό' },
  { value: 'indictment',  label: 'Κατηγορητήριο / Δικογραφία' },
];

type Props = {
  onExtracted: (data: ExtractedData) => void;
  className?: string;
};

export default function DocumentScanButton({ onExtracted, className = '' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState('auto');
  const [showMenu, setShowMenu] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const res = await aiApi.extractDocument(file, docType);
      onExtracted(res.data as ExtractedData);
      toast.success('Τα στοιχεία εξήχθησαν επιτυχώς');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Σφάλμα κατά την ανάλυση εγγράφου';
      toast.error(msg);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const selectedLabel = DOC_TYPES.find(d => d.value === docType)?.label || 'Αυτόματη';

  return (
    <div className={`flex items-stretch gap-0 ${className}`}>
      {/* Main scan button */}
      <button
        type="button"
        onClick={() => !loading && inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-l bg-[#0d2137] border border-[#1a3a5c] hover:bg-[#132d4a] text-[#4a9eda] text-xs font-medium transition-colors disabled:opacity-60"
        title="Σάρωση εγγράφου με AI"
      >
        {loading
          ? <Loader2 size={14} className="animate-spin" />
          : <ScanLine size={14} />
        }
        {loading ? 'Ανάλυση...' : 'Σάρωση AI'}
      </button>

      {/* Doc type dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMenu(v => !v)}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-2 rounded-r bg-[#0d2137] border border-l-0 border-[#1a3a5c] hover:bg-[#132d4a] text-[#4a9eda] text-xs transition-colors disabled:opacity-60"
        >
          <span className="hidden sm:inline text-[#7a9ab8]">{selectedLabel}</span>
          <ChevronDown size={12} />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-[#0d2137] border border-[#1a3a5c] rounded shadow-xl min-w-[200px]">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.value}
                type="button"
                onClick={() => { setDocType(dt.value); setShowMenu(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[#132d4a] transition-colors
                  ${docType === dt.value ? 'text-[#4a9eda]' : 'text-[#d4dce8]'}`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
