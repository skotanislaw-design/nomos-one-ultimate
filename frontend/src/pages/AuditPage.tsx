import { useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { auditApi } from '@/lib/api';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { auditApi.logs().then(r => { const data = Array.isArray(r.data) ? r.data : (r.data?.logs ?? []); setLogs(data); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const filtered = logs.filter(l => JSON.stringify(l).toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-lg border-2 border-[#C6A75E]/30 border-t-[#C6A75E] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div><h2 className="page-title">Audit Log</h2><p className="page-subtitle">{logs.length} εγγραφές</p></div>
      <div className="glass-card p-4"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a7a9a]" /><input placeholder="Αναζήτηση..." value={search} onChange={e => setSearch(e.target.value)} className="input-dark pl-9" /></div></div>
      <div className="glass-card overflow-hidden">
        <table className="w-full table-premium">
          <thead><tr className="bg-[#0d2035]/40"><th>Ημ/νία</th><th>Χρήστης</th><th>Ενέργεια</th><th className="hidden md:table-cell">Αντικείμενο</th><th className="hidden lg:table-cell">Λεπτομέρειες</th></tr></thead>
          <tbody>{filtered.slice(0, 100).map((l: any, i) => (
            <tr key={l._id||i}>
              <td className="text-xs font-mono">{l.timestamp ? new Date(l.timestamp).toLocaleString('el-GR') : '—'}</td>
              <td className="text-xs">{l.user_name || l.user_id?.slice(-6) || '—'}</td>
              <td><span className="px-2 py-0.5 rounded text-[10px] bg-[#132B45] text-[#8aa0b8] border border-[#1a3a5c]/40">{l.action}</span></td>
              <td className="hidden md:table-cell text-xs">{l.resource || '—'}</td>
              <td className="hidden lg:table-cell text-xs max-w-[200px] truncate text-[#5a7a9a]">{typeof l.details === 'object' ? JSON.stringify(l.details) : l.details || ''}</td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-[#5a7a9a] text-sm">Δεν βρέθηκαν εγγραφές.</div>}
      </div>
    </div>
  );
}
