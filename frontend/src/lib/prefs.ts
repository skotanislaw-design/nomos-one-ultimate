export function getPrefs(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem('nomos_preferences') || '{}');
  } catch {
    return {};
  }
}

// Ensures a datetime string from the backend (stored as UTC, no 'Z') is parsed as UTC.
// Date-only strings (YYYY-MM-DD) are left as-is since they have no time component.
export function parseTs(s: string): Date {
  if (!s) return new Date(NaN);
  // Already has timezone info
  if (s.includes('Z') || s.includes('+') || /\d{2}-\d{2}:\d{2}$/.test(s)) return new Date(s);
  // Has time component (contains 'T') → treat as UTC
  if (s.includes('T')) return new Date(s + 'Z');
  // Date-only: new Date('YYYY-MM-DD') is already UTC per spec, no change needed
  return new Date(s);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseTs(date) : date;
  if (isNaN(d.getTime())) return '—';
  const fmt = getPrefs().dateFormat || 'DD/MM/YYYY';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  if (fmt === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  if (fmt === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseTs(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('el-GR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  const prefs = getPrefs();
  const currency = prefs.currency || 'EUR';
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const symbol = symbols[currency] || '€';
  const formatted = Math.abs(amount).toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : '';
  return `${sign}${formatted} ${symbol}`;
}
