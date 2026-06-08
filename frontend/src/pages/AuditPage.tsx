import { useEffect, useState, useCallback, Fragment } from 'react';
import { Activity, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { auditApi, usersApi } from '@/lib/api';
import { formatDateTime } from '@/lib/prefs';

const PAGE_SIZE = 100;

const ACTION_MAP: Record<string, { label: string; cls: string }> = {
  CREATE_CLIENT:          { label: 'Δημιουργία Εντολέα',      cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  UPDATE_CLIENT:          { label: 'Επεξεργασία Εντολέα',     cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  DELETE_CLIENT:          { label: 'Διαγραφή Εντολέα',        cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  EXPORT_CLIENT:          { label: 'Εξαγωγή Εντολέα',         cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  CREATE_CASE:            { label: 'Δημιουργία Υπόθεσης',     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  UPDATE_CASE:            { label: 'Επεξεργασία Υπόθεσης',    cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  DELETE_CASE:            { label: 'Διαγραφή Υπόθεσης',       cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  ARCHIVE_CASE:           { label: 'Αρχειοθέτηση Υπόθεσης',   cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  CREATE_PORTAL_ACCESS:   { label: 'Δημ. Portal Access',       cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  UPDATE_PORTAL_PERMISSIONS: { label: 'Αλλαγή Δικαιωμάτων Portal', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  DELETE_PORTAL_ACCESS:   { label: 'Διαγραφή Portal Access',  cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  PORTAL_LOGIN:           { label: 'Σύνδεση Portal',           cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  PORTAL_MESSAGE:         { label: 'Μήνυμα Portal',            cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  PORTAL_UPLOAD:          { label: 'Ανέβασμα Εγγράφου (Portal)', cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  PORTAL_UPLOAD_CONFIRM:  { label: 'Επιβεβαίωση Εγγράφων',    cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  APPROVE_PORTAL_DOCUMENT:{ label: 'Έγκριση Εγγράφου Portal', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  REJECT_PORTAL_DOCUMENT: { label: 'Απόρριψη Εγγράφου Portal',cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  CREATE_INVOICE:         { label: 'Δημιουργία Τιμολογίου',   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  UPDATE_INVOICE:         { label: 'Επεξεργασία Τιμολογίου',  cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  CREATE_HEARING:         { label: 'Δημιουργία Δικασίμου',    cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  UPDATE_HEARING:         { label: 'Επεξεργασία Δικασίμου',   cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  DELETE_HEARING:         { label: 'Διαγραφή Δικασίμου',      cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  CREATE_DEADLINE:        { label: 'Δημιουργία Προθεσμίας',   cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  UPDATE_DEADLINE:        { label: 'Επεξεργασία Προθεσμίας',  cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  DELETE_DEADLINE:        { label: 'Διαγραφή Προθεσμίας',     cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  CREATE_USER:            { label: 'Δημιουργία Χρήστη',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  UPDATE_USER:            { label: 'Επεξεργασία Χρήστη',      cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  DEACTIVATE_USER:        { label: 'Απενεργοποίηση Χρήστη',   cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  LOGIN:                  { label: 'Σύνδεση',                  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  LOGOUT:                 { label: 'Αποσύνδεση',               cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  UPDATE_SETTINGS:        { label: 'Αλλαγή Ρυθμίσεων',        cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  SEND_EMAIL:             { label: 'Αποστολή Email',           cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  CREATE_EXPENSE:         { label: 'Δημιουργία Εξόδου',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  CREATE_PAYMENT:         { label: 'Καταχώριση Πληρωμής',     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  APPROVE_RESET_REQUEST:  { label: 'Έγκριση Reset Portal',    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
};

const RESOURCE_MAP: Record<string, string> = {
  client: 'Εντολέας', case: 'Υπόθεση', portal: 'Portal', invoice: 'Τιμολόγιο',
  hearing: 'Δικάσιμος', deadline: 'Προθεσμία', document: 'Έγγραφο',
  user: 'Χρήστης', expense: 'Έξοδο', payment: 'Πληρωμή', settings: 'Ρυθμίσεις',
  email: 'Email', financial: 'Οικονομικά',
};

const ROLE_MAP: Record<string, { label: string; cls: string }> = {
  administrator: { label: 'Διαχειριστής', cls: 'text-[#C6A75E] bg-[#C6A75E]/10 border-[#C6A75E]/30' },
  lawyer:        { label: 'Δικηγόρος',    cls: 'text-blue-400 bg-blue-500/15 border-blue-500/20' },
  secretary:     { label: 'Γραμματεία',   cls: 'text-purple-400 bg-purple-500/15 border-purple-500/20' },
  trainee:       { label: 'Ασκούμενος',   cls: 'text-slate-400 bg-slate-500/15 border-slate-500/20' },
  portal:        { label: 'Πελάτης',      cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
};

export default function AuditPage() {
  const [logs,       setLogs]       = useState<any[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [userMap,    setUserMap]    = useState<Record<string, { name: string; role: string }>>({});
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await auditApi.logs({ skip: p * PAGE_SIZE, limit: PAGE_SIZE });
      const data = r.data?.logs ?? (Array.isArray(r.data) ? r.data : []);
      setLogs(data);
      setTotal(r.data?.total ?? data.length);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    usersApi.list().then(r => {
      const map: Record<string, { name: string; role: string }> = {};
      (r.data || []).forEach((u: any) => {
        map[u.id || u._id] = { name: u.name || u.full_name || '—', role: u.role || 'lawyer' };
      });
      setUserMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchLogs(page); }, [page, fetchLogs]);

  const filtered = search.trim()
    ? logs.filter(l => JSON.stringify(l).toLowerCase().includes(search.toLowerCase()))
    : logs;

  const resolveUser = (l: any) => {
    const u = userMap[l.user_id];
    if (u) return u;
    if (l.resource === 'portal' || l.action?.includes('PORTAL')) return { name: 'Πελάτης (Portal)', role: 'portal' };
    return { name: l.user_id?.slice(-8) || '—', role: '' };
  };

  const fmtTs = (ts: string) => formatDateTime(ts);

  const fmtDetails = (d: any) => {
    if (!d || (typeof d === 'object' && Object.keys(d).length === 0)) return null;
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="page-title flex items-center gap-2"><Activity size={18} className="text-[#C6A75E]" /> Audit Log</h2>
          <p className="page-subtitle">{total} εγγραφές συνολικά — σελίδα {page + 1} από {totalPages}</p>
        </div>
        <div className="relative w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" />
          <input
            placeholder="Αναζήτηση στη σελίδα..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-9 text-xs"
          />
        </div>
      </div>

      <div className="glass-card overflow-hidden table-scroll">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-premium">
              <thead>
                <tr className="bg-[#0d2035]/40">
                  <th className="w-[180px]">Χρήστης</th>
                  <th className="w-[200px]">Ενέργεια</th>
                  <th className="w-[110px] hidden sm:table-cell">Αντικείμενο</th>
                  <th className="w-[120px] hidden md:table-cell">Ρόλος</th>
                  <th className="hidden lg:table-cell">Λεπτομέρειες</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any, i: number) => {
                  const rowId   = l.id || l._id || String(i);
                  const isOpen  = expanded === rowId;
                  const usr     = resolveUser(l);
                  const act     = ACTION_MAP[l.action] ?? { label: l.action, cls: 'text-[#8aa0b8] bg-[#132B45] border-[#1a3a5c]/40' };
                  const res     = RESOURCE_MAP[l.resource] || l.resource || '—';
                  const role    = ROLE_MAP[usr.role] ?? { label: usr.role || '—', cls: 'text-[#5a7a9a] bg-[#0d2035]/40 border-[#1a3a5c]/20' };
                  const details = fmtDetails(l.details);

                  return (
                    <Fragment key={rowId}>
                      <tr
                        className={`transition-colors ${isOpen ? 'bg-[#0d2035]/60' : 'hover:bg-[#0d2035]/30'}`}
                      >
                        {/* Χρήστης + timestamp */}
                        <td>
                          <p className="text-xs font-medium text-[#d4dce8] truncate max-w-[160px]">{usr.name}</p>
                          <p className="text-[10px] text-[#4a6a8a] mt-0.5 font-mono">{fmtTs(l.timestamp)}</p>
                        </td>

                        {/* Ενέργεια — κλικ για expand */}
                        <td>
                          <button
                            onClick={() => setExpanded(isOpen ? null : rowId)}
                            className="flex items-center gap-1 group cursor-pointer"
                          >
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${act.cls}`}>
                              {act.label}
                            </span>
                            {isOpen
                              ? <ChevronUp size={11} className="text-[#5a7a9a]" />
                              : <ChevronDown size={11} className="text-[#3a5a7a] group-hover:text-[#5a7a9a]" />
                            }
                          </button>
                        </td>

                        {/* Αντικείμενο */}
                        <td className="hidden sm:table-cell">
                          <span className="text-xs text-[#8aa0b8]">{res}</span>
                          {l.resource_id && (
                            <p className="text-[9px] font-mono text-[#3a5a7a] mt-0.5 truncate max-w-[100px]">{l.resource_id.slice(-8)}</p>
                          )}
                        </td>

                        {/* Ρόλος */}
                        <td className="hidden md:table-cell">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${role.cls}`}>
                            {role.label}
                          </span>
                        </td>

                        {/* Λεπτομέρειες */}
                        <td className="hidden lg:table-cell">
                          {details
                            ? <p className="text-[10px] text-[#5a7a9a] max-w-[280px] truncate font-mono">{details}</p>
                            : <span className="text-[10px] text-[#2a4a6a]">—</span>
                          }
                        </td>
                      </tr>

                      {/* Expanded row — πλήρης ενέργεια + details */}
                      {isOpen && (
                        <tr className="bg-[#071220]/60">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="flex flex-wrap gap-4 text-xs">
                              <div>
                                <p className="text-[9px] uppercase tracking-widest text-[#4a6a8a] mb-1">Πλήρης Ενέργεια</p>
                                <code className="text-[#C6A75E] font-mono text-[11px]">{l.action}</code>
                              </div>
                              {l.resource_id && (
                                <div>
                                  <p className="text-[9px] uppercase tracking-widest text-[#4a6a8a] mb-1">Resource ID</p>
                                  <code className="text-[#8aa0b8] font-mono text-[11px]">{l.resource_id}</code>
                                </div>
                              )}
                              {l.user_id && (
                                <div>
                                  <p className="text-[9px] uppercase tracking-widest text-[#4a6a8a] mb-1">User ID</p>
                                  <code className="text-[#8aa0b8] font-mono text-[11px]">{l.user_id}</code>
                                </div>
                              )}
                              {details && (
                                <div className="w-full">
                                  <p className="text-[9px] uppercase tracking-widest text-[#4a6a8a] mb-1">Λεπτομέρειες</p>
                                  <pre className="text-[10px] text-[#8aa0b8] font-mono bg-[#0d2035]/60 rounded px-3 py-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">{details}</pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν βρέθηκαν εγγραφές.</div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1a3a5c]/40">
            <p className="text-[11px] text-[#5a7a9a]">
              Εγγραφές {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} από {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i
                  : page < 4 ? i
                  : page > totalPages - 5 ? totalPages - 7 + i
                  : page - 3 + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`w-7 h-7 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      pg === page
                        ? 'bg-[#C6A75E] text-[#071220]'
                        : 'text-[#7a9ab8] hover:bg-[#132B45]'
                    }`}
                  >
                    {pg + 1}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-[#132B45] text-[#7a9ab8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
