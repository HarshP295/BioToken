// frontend/src/components/StatusBadge.jsx
import { CheckCircle2, Clock, Beaker, Truck, Package, ShieldCheck } from 'lucide-react';

export const STAGES = [
  { id: 0, name: 'MINTED', color: 'var(--primary)', icon: <Package className="w-4 h-4" /> },
  { id: 1, name: 'IN TRANSIT', color: 'var(--warning)', icon: <Truck className="w-4 h-4" /> },
  { id: 2, name: 'RECEIVED', color: 'var(--text-main)', icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 3, name: 'VERIFIED', color: 'var(--accent)', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 4, name: 'CONSUMED', color: 'var(--danger)', icon: <Beaker className="w-4 h-4" /> },
];

export default function StatusBadge({ status }) {
  const stage = STAGES[Number(status)] || STAGES[0];
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.375rem',
      padding: '0.25rem 0.75rem',
      borderRadius: '2rem',
      fontSize: '0.8rem',
      fontWeight: '600',
      backgroundColor: `color-mix(in srgb, ${stage.color} 15%, transparent)`,
      color: stage.color,
      border: `1px solid color-mix(in srgb, ${stage.color} 30%, transparent)`
    }}>
      {stage.icon}
      {stage.name}
    </div>
  );
}
