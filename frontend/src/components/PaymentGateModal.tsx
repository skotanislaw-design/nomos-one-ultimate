import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface PaymentGateEvent {
  message?: string;
  outstanding_balance?: number;
  case_id?: string;
}

export default function PaymentGateModal() {
  const [event, setEvent] = useState<PaymentGateEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setEvent((e as CustomEvent<PaymentGateEvent>).detail);
    };
    window.addEventListener('payment-gate-block', handler);
    return () => window.removeEventListener('payment-gate-block', handler);
  }, []);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 p-6 shadow-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(19,43,69,0.98), rgba(11,28,45,0.99))', boxShadow: '0 0 60px rgba(239,68,68,0.15)' }}>

        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-0.5">Απαιτείται Εξόφληση Αμοιβής</h2>
            <p className="text-xs text-[#6a8aaa]">Η ενέργεια δεν επιτράπηκε</p>
          </div>
        </div>

        {/* Balance */}
        {event.outstanding_balance != null && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-center">
            <p className="text-xs text-[#8aa0b8] mb-1 uppercase tracking-wider">Εκκρεμές υπόλοιπο</p>
            <p className="text-3xl font-bold text-red-400">{event.outstanding_balance.toLocaleString('el-GR', { minimumFractionDigits: 2 })}€</p>
          </div>
        )}

        {/* Message */}
        <p className="text-sm text-[#c0d0e0] leading-relaxed mb-6">
          {event.message || 'Ουδεμία ενέργεια επιτρέπεται πριν εξοφληθεί η αμοιβή στο σύνολό της.'}
        </p>

        {/* Notice */}
        <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-3">
          <p className="text-xs text-amber-400/90 leading-relaxed">
            Έχει αποσταλεί ειδοποίηση στη γραμματεία και τον χειριστή της υπόθεσης. Παρακαλούμε τακτοποιήστε την πληρωμή για να συνεχίσετε.
          </p>
        </div>

        <button
          onClick={() => setEvent(null)}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#C6A75E,#B8993F)', color: '#071220' }}>
          Κατάλαβα
        </button>
      </div>
    </div>
  );
}
